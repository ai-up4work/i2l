// lib/checkout/server.ts
//
// SERVER-ONLY. Prices a cart and places the order(s) on the server.
//
// Before this, the cart page worked out every price in the browser and
// inserted orders straight into the database — so a customer could change
// any price (or the discount) before confirming. Now the browser only says
// WHICH items and HOW MANY; this file decides what each costs:
//
//   1. Store catalogue / Wishdrop Mall items -> the store's own live
//      product (fetchStoreProduct), including the chosen variant's price.
//   2. Pasted-link items -> the last price our scraper saw for that exact
//      URL (price_observations, written by /api/scrape), or a fresh read
//      of the page right now if that is missing or older than a day.
//   3. Anything still unknown -> the customer's price is kept but the
//      order is flagged `price_review` so staff check it before buying.
//
// Then the same pricing engine the site shows (lib/pricing.ts) turns the
// source price into the LKR total, the coupon is checked and redeemed
// atomically, and the orders are created with the service role.

import 'server-only'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { ensurePricingSettings } from '@/lib/pricing-settings-server'
import { getDualDeliveryPricing, type DeliveryPriceOption } from '@/lib/pricing'
import type { PricingSettings } from '@/lib/pricing-settings'
import { localPickupFees, socialStoreCurrency, storeOriginOf, type StoreOrigin } from '@/lib/store-origin'
import { storeSourceOf } from '@/lib/catalogue-stores'
import { fetchStoreProduct } from '@/lib/store-providers/product'
import { scrapeProduct } from '@/lib/scrape/parsers'
import { ECONOMY_LOCKED } from '@/lib/feature-flags'
import type { StoreProduct } from '@/lib/store.types'
import { ensureProductSnapshot } from '@/lib/supabase/product-snapshots'
import { getOrCreateGeneralThread } from '@/lib/supabase/chat'
import { checkMallStock, deductMallStockForOrder } from '@/lib/wishdrop-mall/stock'
import {
  computeDiscount,
  db,
  discountLabel,
  redeemCoupon,
  resolveCouponForUser,
  voidRedemptionsForCheckout,
  type AdminClient,
  type CouponRow,
} from '@/lib/coupons/server'

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type DeliveryChoice = 'express' | 'economy'

/** What the browser sends for each cart line. Prices in here are only
 *  ever used as a last resort (and then the order is flagged). */
export type CheckoutLineInput = {
  id: string
  url: string
  site: string | null
  title: string
  image: string | null
  currencyCode: string | null
  sourcePrice: string | null
  weightKg: number | null
  source: 'catalogue' | 'link'
  selectedOptions: Record<string, string> | null
  productHandle: string | null
  qty: number
}

export type CheckoutRecipient = {
  fullName: string
  phone: string
  addressLine1: string
  addressLine2?: string | null
  city: string
  postalCode?: string | null
  country: string
  existingAddressId?: string | null
}

const MAX_LINES = 50
const MAX_QTY = 99

function str(v: unknown, max = 2000): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

export function parseLines(raw: unknown): CheckoutLineInput[] | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'Your cart is empty.' }
  if (raw.length > MAX_LINES) return { error: `You can check out up to ${MAX_LINES} items at a time.` }
  const lines: CheckoutLineInput[] = []
  for (const r of raw as Record<string, unknown>[]) {
    const qty = Math.floor(Number(r?.qty))
    const url = str(r?.url)
    const title = str(r?.title, 300)
    if (!url || !title || !Number.isFinite(qty) || qty < 1 || qty > MAX_QTY) {
      return { error: 'One of the items in your cart is invalid. Remove it and add it again.' }
    }
    const opts =
      r?.selectedOptions && typeof r.selectedOptions === 'object'
        ? Object.fromEntries(
            Object.entries(r.selectedOptions as Record<string, unknown>)
              .filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
              .slice(0, 10) as [string, string][],
          )
        : null
    const weight = Number(r?.weightKg)
    lines.push({
      id: str(r?.id, 500) ?? url,
      url,
      site: str(r?.site, 120),
      title,
      image: str(r?.image),
      currencyCode: str(r?.currencyCode, 8),
      sourcePrice: r?.sourcePrice == null ? null : String(r.sourcePrice).slice(0, 32),
      weightKg: Number.isFinite(weight) && weight > 0 ? weight : null,
      source: r?.source === 'catalogue' ? 'catalogue' : 'link',
      selectedOptions: opts && Object.keys(opts).length ? opts : null,
      productHandle: str(r?.productHandle, 300),
      qty,
    })
  }
  return lines
}

export function parseRecipient(raw: unknown): CheckoutRecipient | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>
  const fullName = str(r.fullName, 120)
  const phone = str(r.phone, 40)
  const addressLine1 = str(r.addressLine1, 200)
  const city = str(r.city, 100)
  const country = str(r.country, 80)
  if (!fullName || !phone || !addressLine1 || !city || !country) {
    return { error: 'Please fill in your name, WhatsApp number and shipping address.' }
  }
  return {
    fullName,
    phone,
    addressLine1,
    addressLine2: str(r.addressLine2, 200),
    city,
    postalCode: str(r.postalCode, 20),
    country,
    existingAddressId: str(r.existingAddressId, 64),
  }
}

// ---------------------------------------------------------------------------
// Trusted source prices
// ---------------------------------------------------------------------------

type StoreInfo = { origin: StoreOrigin; marginIncluded: boolean; currency?: 'LKR' | 'INR' }
type PriceSource = 'catalogue' | 'mall' | 'observed' | 'live_scrape' | 'customer'

type SourcePrice = {
  price: number
  currency: string
  weightKg: number | null
  origin: StoreOrigin | null
  marginIncluded: boolean | undefined
  source: PriceSource
  verified: boolean
  inStock: boolean
}

const OBSERVATION_MAX_AGE_MS = 24 * 60 * 60 * 1000
const LIVE_SCRAPE_TIMEOUT_MS = 20_000

async function loadStoreInfo(admin: AdminClient): Promise<Map<string, StoreInfo>> {
  const map = new Map<string, StoreInfo>()
  const { data } = await admin.from('sellers').select('*').eq('status', 'active')
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const slug = row.platform_slug as string
    if (!slug) continue
    const origin = storeOriginOf(row)
    const social = storeSourceOf(row) === 'social'
    map.set(slug, { origin, marginIncluded: social, ...(social ? { currency: socialStoreCurrency(origin) } : {}) })
  }
  return map
}

/** The product handle/id for a catalogue line: the explicit field when the
 *  cart sent it, else parsed back out of the `<store>:<id>` url format. */
function catalogueHandle(line: CheckoutLineInput): string | null {
  if (line.productHandle) return line.productHandle
  if (line.site && line.url.startsWith(`${line.site}:`)) {
    const rest = line.url.slice(line.site.length + 1)
    const id = rest.split(':')[0]
    return id || null
  }
  return null
}

function variantPrice(product: StoreProduct, selected: Record<string, string> | null): number {
  if (!selected || !product.variants?.length || !product.options?.length) return product.price
  const axes = product.options.map((o) => o.name)
  const match = product.variants.find((v) =>
    axes.every((name, i) => selected[name] == null || v.options[i] == null || v.options[i] === selected[name]),
  )
  return match?.price ?? product.price
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  try {
    return await Promise.race([p, timeout])
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function recordPriceObservation(
  admin: AdminClient,
  obs: { url: string; site?: string | null; price: number; currency?: string | null; weightKg?: number | null },
): Promise<void> {
  if (!obs.url || !Number.isFinite(obs.price) || obs.price <= 0) return
  await db(admin)
    .from('price_observations')
    .upsert({
      url: obs.url.slice(0, 2000),
      site: obs.site ?? null,
      price: obs.price,
      currency: obs.currency ?? null,
      weight_kg: obs.weightKg ?? null,
      observed_at: new Date().toISOString(),
    })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.error('[price_observations] upsert failed', error.message)
    })
}

function parsePrice(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

async function trustedSourcePrice(admin: AdminClient, line: CheckoutLineInput, stores: Map<string, StoreInfo>): Promise<SourcePrice> {
  const info = line.site ? stores.get(line.site) : undefined
  const isHttp = /^https?:\/\//i.test(line.url)

  // 1. Catalogue + Mall: the store's own product.
  if ((line.source === 'catalogue' || line.productHandle) && line.site) {
    const handle = catalogueHandle(line)
    if (handle) {
      const product = await withTimeout(fetchStoreProduct(line.site, handle), 15_000)
      if (product && Number.isFinite(product.price) && product.price > 0) {
        return {
          price: variantPrice(product, line.selectedOptions),
          currency: info?.currency ?? product.currency,
          weightKg: product.weightKg ?? line.weightKg,
          origin: info?.origin ?? product.origin ?? null,
          marginIncluded: info?.marginIncluded ?? product.marginIncluded,
          source: line.site === 'wishdrop-mall' ? 'mall' : 'catalogue',
          verified: true,
          inStock: product.inStock !== false,
        }
      }
    }
  }

  // 2. Links: what our scraper saw, or read it again now.
  if (isHttp) {
    const { data: obs } = await db(admin)
      .from('price_observations')
      .select('price, currency, weight_kg, observed_at')
      .eq('url', line.url)
      .maybeSingle()
    if (obs && Date.now() - new Date(obs.observed_at).getTime() < OBSERVATION_MAX_AGE_MS) {
      return {
        price: Number(obs.price),
        currency: info?.currency ?? obs.currency ?? line.currencyCode ?? 'INR',
        weightKg: obs.weight_kg != null ? Number(obs.weight_kg) : line.weightKg,
        origin: info?.origin ?? null,
        marginIncluded: info?.marginIncluded,
        source: 'observed',
        verified: true,
        inStock: true,
      }
    }
    const fresh = await withTimeout(scrapeProduct(line.url, { needVariants: false }), LIVE_SCRAPE_TIMEOUT_MS)
    const freshPrice = parsePrice(fresh?.price)
    // Same rule the item modal uses: only a price with a currency from a
    // real (not Open-Graph-only) read counts as confirmed.
    if (fresh && !fresh.error && freshPrice && fresh.currencyCode && !fresh.ogOnly) {
      const weight = (fresh as { weightKg?: number | null }).weightKg ?? null
      void recordPriceObservation(admin, {
        url: line.url,
        site: fresh.site ?? line.site,
        price: freshPrice,
        currency: fresh.currencyCode ?? null,
        weightKg: weight,
      })
      return {
        price: freshPrice,
        currency: info?.currency ?? fresh.currencyCode ?? line.currencyCode ?? 'INR',
        weightKg: weight ?? line.weightKg,
        origin: info?.origin ?? null,
        marginIncluded: info?.marginIncluded,
        source: 'live_scrape',
        verified: true,
        inStock: !(fresh as { unavailable?: boolean }).unavailable,
      }
    }
  }

  // 3. Couldn't confirm it — keep the customer's price, flag for staff.
  return {
    price: parsePrice(line.sourcePrice) ?? 0,
    currency: info?.currency ?? line.currencyCode ?? 'USD',
    weightKg: line.weightKg,
    origin: info?.origin ?? null,
    marginIncluded: info?.marginIncluded,
    source: 'customer',
    verified: false,
    inStock: true,
  }
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export type PricedLine = {
  input: CheckoutLineInput
  origin: StoreOrigin
  option: DeliveryPriceOption
  /** unit price shown on the order item = price + service + delivery for one unit */
  unitTotalLKR: number
  priceLKR: number
  serviceLKR: number
  deliveryLKR: number
  verified: boolean
  priceSource: PriceSource
  inStock: boolean
}

export type CartPricing = {
  lines: PricedLine[]
  priceSubtotalLKR: number
  serviceSubtotalLKR: number
  deliverySubtotalLKR: number
  pickupLKR: number
  pickupByOrigin: Record<StoreOrigin, number>
  needsReview: boolean
}

export async function priceCart(
  admin: AdminClient,
  lines: CheckoutLineInput[],
  delivery: DeliveryChoice,
  settings?: PricingSettings,
): Promise<CartPricing> {
  const s = settings ?? (await ensurePricingSettings())
  const stores = await loadStoreInfo(admin)
  const sources = await Promise.all(lines.map((l) => trustedSourcePrice(admin, l, stores)))

  const priced: PricedLine[] = lines.map((input, i) => {
    const src = sources[i]
    const dual = getDualDeliveryPricing(
      {
        origin: src.origin,
        marginIncluded: src.marginIncluded,
        price: src.price,
        currency: src.currency,
        weightKg: src.weightKg ?? undefined,
        storeSlug: input.site,
      },
      s,
    )
    const option = delivery === 'economy' ? dual.economy : dual.express
    return {
      input,
      origin: src.origin === 'LK' ? 'LK' : 'IN',
      option,
      unitTotalLKR: option.actualTotalLKR,
      priceLKR: option.priceLKR * input.qty,
      serviceLKR: option.serviceChargeLKR * input.qty,
      deliveryLKR: option.deliveryFeeLKR * input.qty,
      verified: src.verified,
      priceSource: src.source,
      inStock: src.inStock,
    }
  })

  const localLines = priced.filter((l) => l.origin === 'LK')
  const pickup = localPickupFees(localLines.map((l) => ({ storeSlug: l.input.site, origin: 'LK' as const })), s)

  return {
    lines: priced,
    priceSubtotalLKR: priced.reduce((t, l) => t + l.priceLKR, 0),
    serviceSubtotalLKR: priced.reduce((t, l) => t + l.serviceLKR, 0),
    deliverySubtotalLKR: priced.reduce((t, l) => t + l.deliveryLKR, 0),
    pickupLKR: pickup.totalLKR,
    pickupByOrigin: { IN: 0, LK: pickup.totalLKR },
    needsReview: priced.some((l) => !l.verified),
  }
}

// ---------------------------------------------------------------------------
// Quote (cart page) — prices + coupon check, nothing saved
// ---------------------------------------------------------------------------

export type CouponSummary = { id: string; title: string; label: string }

export type CheckoutQuote = {
  lines: { id: string; unitTotalLKR: number; priceLKR: number; verified: boolean; inStock: boolean }[]
  priceSubtotalLKR: number
  serviceSubtotalLKR: number
  deliverySubtotalLKR: number
  pickupLKR: number
  discountLKR: number
  totalLKR: number
  coupon: CouponSummary | null
  couponError: string | null
  needsReview: boolean
}

async function applyCoupon(
  admin: AdminClient,
  userId: string,
  token: string | null,
  pricing: CartPricing,
): Promise<{ coupon: CouponRow | null; allocationId: string | null; discount: number; perLine: Map<string, number>; error: string | null }> {
  const none = { coupon: null, allocationId: null, discount: 0, perLine: new Map<string, number>() }
  if (!token) return { ...none, error: null }
  const resolved = await resolveCouponForUser(admin, userId, token)
  if (!resolved.ok) return { ...none, error: resolved.error }
  const result = computeDiscount(
    resolved.value.coupon,
    pricing.lines.map((l) => ({ key: l.input.id, storeSlug: l.input.site, priceLKR: l.priceLKR })),
  )
  if (!result.ok) return { ...none, error: result.error }
  return {
    coupon: resolved.value.coupon,
    allocationId: resolved.value.allocationId,
    discount: result.discountLKR,
    perLine: result.perLine,
    error: null,
  }
}

function checkDelivery(delivery: DeliveryChoice): DeliveryChoice {
  return delivery === 'economy' && !ECONOMY_LOCKED ? 'economy' : 'express'
}

export async function quoteCheckout(
  userId: string,
  input: { lines: CheckoutLineInput[]; delivery: DeliveryChoice; couponToken: string | null },
): Promise<CheckoutQuote> {
  const admin = createServiceRoleClient()
  const pricing = await priceCart(admin, input.lines, checkDelivery(input.delivery))
  const c = await applyCoupon(admin, userId, input.couponToken, pricing)
  const gross = pricing.priceSubtotalLKR + pricing.serviceSubtotalLKR + pricing.deliverySubtotalLKR + pricing.pickupLKR
  return {
    lines: pricing.lines.map((l) => ({
      id: l.input.id,
      unitTotalLKR: l.unitTotalLKR,
      priceLKR: l.priceLKR,
      verified: l.verified,
      inStock: l.inStock,
    })),
    priceSubtotalLKR: pricing.priceSubtotalLKR,
    serviceSubtotalLKR: pricing.serviceSubtotalLKR,
    deliverySubtotalLKR: pricing.deliverySubtotalLKR,
    pickupLKR: pricing.pickupLKR,
    discountLKR: c.discount,
    totalLKR: gross - c.discount,
    coupon: c.coupon ? { id: c.coupon.id, title: c.coupon.title, label: discountLabel(c.coupon) } : null,
    couponError: c.error,
    needsReview: pricing.needsReview,
  }
}

// ---------------------------------------------------------------------------
// Place order
// ---------------------------------------------------------------------------

function cleanSiteLabel(site: string): string {
  const trimmed = site.trim().replace(/^www\./i, '')
  if (trimmed.includes('.')) return trimmed
  return trimmed
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}

async function siteIdFor(admin: AdminClient, origin: StoreOrigin): Promise<string | null> {
  if (origin === 'LK') {
    const { data } = await db(admin).from('sites').select('id').eq('country', 'LK').eq('active', true).limit(1).maybeSingle()
    if (data?.id) return data.id
  }
  const { data } = await db(admin).from('sites').select('id').eq('is_default', true).maybeSingle()
  return data?.id ?? null
}

async function insertOrder(admin: AdminClient, fields: Record<string, unknown>): Promise<{ id: string; display_id: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db(admin).from('orders').insert(fields).select('id, display_id').single()
    if (!error) return data
    const collision = error.code === '23505' && /display_id/i.test(error.message)
    if (!collision || attempt === 4) throw error
  }
  throw new Error('Could not create order.')
}

async function saveAddress(admin: AdminClient, userId: string, r: CheckoutRecipient): Promise<string> {
  const payload = {
    recipient_name: r.fullName,
    phone: r.phone,
    address_line1: r.addressLine1,
    address_line2: r.addressLine2 || null,
    city: r.city,
    postal_code: r.postalCode || null,
    country: r.country,
  }
  if (r.existingAddressId) {
    // Only ever update the customer's OWN address.
    const { data, error } = await db(admin)
      .from('addresses')
      .update(payload)
      .eq('id', r.existingAddressId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (data?.id) return data.id
  }
  const { data, error } = await db(admin)
    .from('addresses')
    .insert({ ...payload, user_id: userId, is_default: true })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export type PlaceResult =
  | {
      ok: true
      checkoutId: string
      orders: { id: string; displayId: string }[]
      totalLKR: number
      discountLKR: number
      needsReview: boolean
    }
  | { ok: false; error: string; status?: number }

export async function placeCheckout(
  userId: string,
  input: { lines: CheckoutLineInput[]; delivery: DeliveryChoice; couponToken: string | null; recipient: CheckoutRecipient },
): Promise<PlaceResult> {
  const admin = createServiceRoleClient()
  const delivery = checkDelivery(input.delivery)

  // Wishdrop Mall stock first — cheapest way to fail.
  const problems = await checkMallStock(
    admin,
    input.lines.map((l) => ({ url: l.url, qty: l.qty })),
  )
  if (problems[0]) {
    const p = problems[0]
    return {
      ok: false,
      error: p.available > 0 ? `Only ${p.available} left of ${p.name}. Please lower the quantity.` : `${p.name} is sold out. Please remove it from your order.`,
    }
  }

  const pricing = await priceCart(admin, input.lines, delivery)
  const outOfStock = pricing.lines.find((l) => !l.inStock)
  if (outOfStock) return { ok: false, error: `${outOfStock.input.title} is out of stock. Please remove it from your order.` }
  if (pricing.lines.some((l) => l.unitTotalLKR <= 0)) {
    return { ok: false, error: 'We couldn’t price one of your items. Open it again to refresh the price, then try once more.' }
  }

  const c = await applyCoupon(admin, userId, input.couponToken, pricing)
  if (input.couponToken && c.error) return { ok: false, error: c.error }

  const gross = pricing.priceSubtotalLKR + pricing.serviceSubtotalLKR + pricing.deliverySubtotalLKR + pricing.pickupLKR
  const total = gross - c.discount

  // 1. Checkout row (holds the breakdown, the discount and payment state).
  const { data: checkout, error: checkoutError } = await db(admin)
    .from('checkouts')
    .insert({
      user_id: userId,
      delivery,
      item_count: pricing.lines.reduce((t, l) => t + l.input.qty, 0),
      price_subtotal_lkr: pricing.priceSubtotalLKR,
      service_lkr: pricing.serviceSubtotalLKR,
      delivery_lkr: pricing.deliverySubtotalLKR,
      pickup_lkr: pricing.pickupLKR,
      discount_lkr: c.discount,
      total_lkr: total,
      coupon_id: c.coupon?.id ?? null,
      needs_price_review: pricing.needsReview,
    })
    .select('id')
    .single()
  if (checkoutError) throw checkoutError
  const checkoutId: string = checkout.id

  // 2. Coupon — limits enforced atomically in the database.
  if (c.coupon && c.discount > 0) {
    const redeemed = await redeemCoupon(admin, {
      couponId: c.coupon.id,
      userId,
      allocationId: c.allocationId,
      checkoutId,
      amountLKR: c.discount,
    })
    if (!redeemed.ok) {
      await db(admin).from('checkouts').delete().eq('id', checkoutId)
      return { ok: false, error: redeemed.error }
    }
  }

  // 3. Orders — one per origin, same as before.
  const created: { id: string; displayId: string }[] = []
  try {
    const addressId = await saveAddress(admin, userId, input.recipient)
    const threadId = await getOrCreateGeneralThread(admin as never, userId)

    for (const origin of ['IN', 'LK'] as const) {
      const group = pricing.lines.filter((l) => l.origin === origin)
      if (group.length === 0) continue
      const groupDiscount = group.reduce((t, l) => t + (c.perLine.get(l.input.id) ?? 0), 0)
      const pickup = pricing.pickupByOrigin[origin]
      const groupTotal = group.reduce((t, l) => t + l.unitTotalLKR * l.input.qty, 0) + pickup - groupDiscount
      const channel = group.every((l) => l.input.source === 'catalogue') ? 1 : 2

      const order = await insertOrder(admin, {
        user_id: userId,
        channel,
        currency: 'LKR',
        total_value: groupTotal,
        recipient_address_id: addressId,
        chat_thread_id: threadId,
        site_id: await siteIdFor(admin, origin),
        checkout_id: checkoutId,
        discount_lkr: groupDiscount,
        coupon_id: groupDiscount > 0 ? c.coupon?.id ?? null : null,
        payment_status: 'unpaid',
        price_review: group.some((l) => !l.verified),
        ...(origin === 'LK' ? { store_origin: 'LK', pickup_fee_lkr: pickup } : {}),
      })
      created.push({ id: order.id, displayId: order.display_id })

      const itemRows = await Promise.all(
        group.map(async (l) => {
          const snapshotId = await ensureProductSnapshot(admin as never, {
            id: l.input.url || l.input.title,
            title: l.input.title,
            image: l.input.image,
            site: l.input.site,
            price: null,
          })
          const isCatalogue = l.input.source === 'catalogue'
          const variantLabel = l.input.selectedOptions
            ? Object.keys(l.input.selectedOptions)
                .sort()
                .map((k) => `${k}: ${l.input.selectedOptions![k]}`)
                .join(', ') || null
            : null
          return {
            order_id: order.id,
            product_snapshot_id: snapshotId,
            title: l.input.title,
            variant_label: variantLabel,
            quantity: l.input.qty,
            unit_price: l.unitTotalLKR,
            seller_name: l.input.site ? cleanSiteLabel(l.input.site) : null,
            seller_type: 'store',
            store_url: isCatalogue ? l.input.url || null : null,
            request_link: isCatalogue ? null : l.input.url || null,
            price_verified: l.verified,
            price_source: l.priceSource,
          }
        }),
      )
      const { error: itemsError } = await db(admin).from('order_items').insert(itemRows)
      if (itemsError) throw itemsError

      if (group.some((l) => l.input.url.startsWith('wishdrop-mall:'))) {
        await deductMallStockForOrder(admin, order.id).catch((err) => console.error('[checkout] mall stock deduction failed', err))
      }
    }
  } catch (err) {
    // Roll back what we can so a failed checkout doesn't keep the coupon
    // used or leave half an order behind.
    console.error('[checkout] order creation failed', err)
    await voidRedemptionsForCheckout(admin, checkoutId, 'Order creation failed')
    if (created.length) await db(admin).from('orders').delete().in('id', created.map((o) => o.id))
    await db(admin).from('checkouts').delete().eq('id', checkoutId)
    return { ok: false, error: 'Something went wrong placing your order. Please try again.', status: 500 }
  }

  return { ok: true, checkoutId, orders: created, totalLKR: total, discountLKR: c.discount, needsReview: pricing.needsReview }
}
