// lib/scrape/extractors/ebay.ts
//
// Real eBay Browse API integration (OAuth client-credentials / "Application"
// access token — no user login required, matches the public read-only data
// this QA tool needs). This is the preferred path whenever EBAY_APP_ID/
// EBAY_CERT_ID are configured (see scrapeEbayProductViaApi in parsers.ts).
//
// This file ALSO exports a lightweight legacy DOM/JSON-LD scraper
// (parseEbay / SITE_ID / REQUIRES_RENDER_FOR_VARIANTS / consumeEbayMeta)
// used by parsers.ts's generic scrapeProduct() fallback path for
// environments without EBAY_APP_ID/EBAY_CERT_ID set. The bulk of that
// fallback's data actually comes from parseHtml()'s JSON-LD / OpenGraph
// merge chain — this scraper just supplies a title guess and any visible
// selected variant options as a starting point.
//
// Env vars (names match eBay's own developer-portal terminology):
//   EBAY_APP_ID   — "Client ID" in eBay's Application Keys page
//   EBAY_CERT_ID  — "Client Secret" in eBay's Application Keys page
//   EBAY_DEV_ID   — only used by the legacy Trading (XML) API; NOT used
//                   by this file (Browse API + OAuth client-credentials
//                   don't need it). Fine to leave set in .env, just unused.
//   EBAY_ENV      — 'production' (default) or 'sandbox'
//   EBAY_MARKETPLACE_ID — defaults to EBAY_US
//
// IMPORTANT: a EBAY_CERT_ID starting with "SBX-" is a Sandbox credential —
// Sandbox only has synthetic test listings, so real item URLs will 404
// against it. Set EBAY_ENV=sandbox to point requests at the sandbox host
// (and use sandbox test item IDs), or swap in your Production keyset and
// leave EBAY_ENV unset/'production' to hit real listings.
//
// VARIANT PICKER: getItemByLegacyId returns full detail for the ONE
// item/variation you asked for — it never returns sibling options. To
// build a real, clickable picker (all sizes/colors, not just the one
// currently selected) this now makes a SECOND call, get_items_by_item_group,
// whenever the fetched item belongs to a multi-variation listing. See
// fetchEbayItemsByGroup / buildVariantDimensionsFromGroup below.
//
// Docs:
//   OAuth (client credentials): https://developer.ebay.com/api-docs/static/oauth-client-credentials-grant.html
//   Browse API getItemByLegacyId: https://developer.ebay.com/api-docs/buy/browse/resources/item/methods/getItemByLegacyId
//   Browse API getItemsByItemGroup: https://developer.ebay.com/api-docs/buy/browse/resources/item/methods/getItemsByItemGroup

import type { CheerioAPI } from 'cheerio'
import { cleanText, domainCurrency } from '../shared'

const EBAY_ENV = (process.env.EBAY_ENV || 'production').toLowerCase()
const IS_SANDBOX = EBAY_ENV === 'sandbox'

const EBAY_OAUTH_URL = IS_SANDBOX
  ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
  : 'https://api.ebay.com/identity/v1/oauth2/token'

const EBAY_BROWSE_ITEM_BY_LEGACY_ID_URL = IS_SANDBOX
  ? 'https://api.sandbox.ebay.com/buy/browse/v1/item/get_item_by_legacy_id'
  : 'https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id'

const EBAY_BROWSE_ITEMS_BY_GROUP_URL = IS_SANDBOX
  ? 'https://api.sandbox.ebay.com/buy/browse/v1/item/get_items_by_item_group'
  : 'https://api.ebay.com/buy/browse/v1/item/get_items_by_item_group'

const EBAY_OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope'

// ---------- Site identity (used by parsers.ts's site-routing tables) ----------

export const SITE_ID = 'ebay'

// The legacy scraper's variant picker is a plain server-rendered <select>/
// label-value block, not a client-side-hydrated widget — so unlike
// Flipkart/Meesho/etc it does NOT need a JS-rendering fetch tier for
// variant LABELS to show up in a static HTML fetch. Per-option PRICE and
// IMAGE, however, are populated by eBay's client-side JS on selection
// change and are NOT present in the static HTML — see the note on
// extractEbayVariantDimensions below. If per-option price/image ever
// becomes a hard requirement for the no-API-creds path, this constant is
// the flag to flip (plus adding a render tier that clicks through each
// option and re-scrapes), rather than trying to parse them out of a
// static fetch.
export const REQUIRES_RENDER_FOR_VARIANTS = false

export type EbayApiVariantOption = {
  label: string
  price: string | null
  currencyCode: string | null
  image: string | null
  url: string | null
  selected: boolean
  outOfStock?: boolean
}

export type EbayApiVariantDimension = {
  dimension: string
  options: EbayApiVariantOption[]
}

export type EbayApiProduct = {
  itemId: string
  legacyItemId: string | null
  title: string | null
  price: string | null
  currencyCode: string | null
  originalPrice: string | null
  discountPercentage: number | null
  condition: string | null
  conditionDescription: string | null
  images: string[]
  seller: string | null
  sellerFeedbackScore: number | null
  sellerFeedbackPercent: string | null
  availability: string | null
  quantityAvailable: number | null
  quantitySold: number | null
  shipping: string | null
  itemLocation: string | null
  topRatedBuying: boolean
  returnsAccepted: boolean | null
  returnPeriodDays: number | null
  paymentMethods: string[]
  brand: string | null
  mpn: string | null
  gtin: string | null
  categoryPath: string | null
  itemCreationDate: string | null
  bidCount: number | null
  currentBidPrice: string | null
  itemWebUrl: string
  buyingOptions: string[]
  itemEndDate: string | null
  variants: EbayApiVariantDimension[]
  variantsNote: string | null
  itemSpecifics: { name: string; value: string }[]
  ended: boolean
}

// ---------- Item-id parsing ----------

// Real eBay item pages are /itm/<slug->?<numeric item id> with an optional
// `?var=<numeric variation id>` query param selecting a specific variant.
const EBAY_ITEM_ID_RE = /\/itm\/(?:[^/]+-)?(\d+)(?:[/?]|$)/i

export function parseEbayItemUrl(url: string): { legacyItemId: string; legacyVariationId: string | null } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const match = parsed.pathname.match(EBAY_ITEM_ID_RE)
  if (!match) return null
  const legacyVariationId = parsed.searchParams.get('var')
  return { legacyItemId: match[1], legacyVariationId: legacyVariationId || null }
}

// ---------- OAuth token (in-memory cache, shared across the whole process) ----------

let cachedToken: { value: string; expiresAt: number } | null = null
let inflightTokenRequest: Promise<string> | null = null

export function ebayCredentialsConfigured(): boolean {
  return !!(process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID)
}

// Surfaced so callers (and the QA UI) can warn when Sandbox creds are
// being used against what looks like a real, non-sandbox item URL.
export function ebayIsSandbox(): boolean {
  return IS_SANDBOX || !!process.env.EBAY_CERT_ID?.startsWith('SBX-')
}

async function fetchNewToken(): Promise<string> {
  const clientId = process.env.EBAY_APP_ID
  const clientSecret = process.env.EBAY_CERT_ID
  if (!clientId || !clientSecret) {
    throw new Error('EBAY_APP_ID / EBAY_CERT_ID are not set — cannot request an eBay OAuth token.')
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(EBAY_OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: EBAY_OAUTH_SCOPE,
    }).toString(),
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`eBay OAuth token request failed (HTTP ${res.status}, env=${EBAY_ENV}): ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  // Refresh a couple minutes early so an in-flight request never gets
  // handed a token that's about to expire mid-call.
  const expiresAt = Date.now() + (data.expires_in - 120) * 1000
  cachedToken = { value: data.access_token, expiresAt }
  return data.access_token
}

async function getEbayAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value
  // Coalesce concurrent callers into a single token request instead of
  // firing one OAuth call per simultaneous scrape.
  if (!inflightTokenRequest) {
    inflightTokenRequest = fetchNewToken().finally(() => {
      inflightTokenRequest = null
    })
  }
  return inflightTokenRequest
}

// ---------- Item fetch + normalization ----------

function money(m: { value?: string; currency?: string } | null | undefined): string | null {
  return m?.value != null ? String(m.value) : null
}

function normalizeAvailability(itemEndDate: string | null | undefined, estimatedAvailability: any): string | null {
  if (itemEndDate && new Date(itemEndDate).getTime() < Date.now()) return 'Ended'
  const status = estimatedAvailability?.estimatedAvailabilityStatus
  if (status === 'IN_STOCK') return 'In stock'
  if (status === 'LIMITED_STOCK') return 'Limited stock'
  if (status === 'OUT_OF_STOCK') return 'Out of stock'
  return null
}

function formatShipping(shippingOptions: any[] | undefined): string | null {
  if (!shippingOptions?.length) return null
  const opt = shippingOptions[0]
  const cost = opt.shippingCost
  if (cost && Number(cost.value) === 0) return 'Free shipping'
  if (cost?.value != null) return `${cost.value} ${cost.currency ?? ''} shipping`.trim()
  return opt.shippingCostType === 'FREE' ? 'Free shipping' : null
}

// ---------- Sibling variation lookup (get_items_by_item_group) ----------
//
// getItemByLegacyId only ever describes the ONE item/variation you asked
// for. When that item belongs to a multi-variation listing, eBay includes
// an `itemGroupHref` HATEOAS link on the response — a second call to that
// endpoint returns every sibling (each with its own itemId, price, image,
// stock status, and aspect values), which is what actually lets us build
// a real "click Size M to see Size M's price/photo" picker instead of a
// single frozen value.

type EbaySiblingItem = {
  itemId: string
  legacyItemId: string | null
  itemWebUrl: string | null
  price: { value?: string; currency?: string } | null
  image: { imageUrl?: string } | null
  localizedAspects: { name: string; value: string }[]
  estimatedAvailabilities: any[]
}

function extractItemGroupId(item: any): string | null {
  const href: string | undefined = item?.itemGroupHref
  if (!href) return null
  try {
    const url = new URL(href)
    return url.searchParams.get('item_group_id')
  } catch {
    // Some responses hand back a bare id or a malformed fragment instead
    // of a full HATEOAS URL — fall back to using it as-is if it looks
    // like a plausible id rather than throwing the whole lookup away.
    return /^[\w|]+$/.test(href) ? href : null
  }
}

function normalizeSibling(raw: any): EbaySiblingItem {
  return {
    itemId: raw.itemId,
    legacyItemId: raw.legacyItemId ?? null,
    itemWebUrl: raw.itemWebUrl ?? null,
    price: raw.price ?? null,
    image: raw.image ?? null,
    localizedAspects: (raw.localizedAspects ?? []).map((a: any) => ({ name: a.name, value: a.value })),
    estimatedAvailabilities: raw.estimatedAvailabilities ?? [],
  }
}

function siblingAspectValue(sibling: EbaySiblingItem, name: string): string | undefined {
  return sibling.localizedAspects.find((a) => a.name === name)?.value
}

function siblingOutOfStock(sibling: EbaySiblingItem): boolean {
  const status = sibling.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus
  return status === 'OUT_OF_STOCK'
}

async function fetchEbayItemsByGroup(itemGroupId: string, marketplaceId: string): Promise<any[]> {
  const token = await getEbayAccessToken()
  const params = new URLSearchParams({ item_group_id: itemGroupId })

  const res = await fetch(`${EBAY_BROWSE_ITEMS_BY_GROUP_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    // Non-fatal by design — an expired/unavailable item group shouldn't
    // fail the whole product lookup, it should just mean "no picker,
    // show the single item we already have." The caller surfaces this
    // via EbayApiProduct.variantsNote instead of throwing.
    return []
  }

  const data = await res.json()
  return Array.isArray(data.items) ? data.items : []
}

// Builds one dimension per aspect name that actually VARIES across the
// sibling set — dynamic detection instead of a fixed whitelist
// (Color/Size/Style/...), so this picks up whatever eBay actually varies
// this specific listing by. Every distinct value on each axis gets its
// own option (not just the currently-selected one), each carrying that
// sibling's own price/image/stock/url so clicking it is a real re-fetch
// of that variation's own page, same convention as every other platform
// view in this tool.
function buildVariantDimensionsFromGroup(currentItemId: string, siblings: EbaySiblingItem[]): EbayApiVariantDimension[] {
  if (siblings.length <= 1) return []

  const valuesByName = new Map<string, Set<string>>()
  for (const sibling of siblings) {
    for (const aspect of sibling.localizedAspects) {
      if (!aspect.value) continue
      if (!valuesByName.has(aspect.name)) valuesByName.set(aspect.name, new Set())
      valuesByName.get(aspect.name)!.add(aspect.value)
    }
  }
  const dimensionNames = [...valuesByName.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([name]) => name)

  if (!dimensionNames.length) return []

  const current = siblings.find((s) => s.itemId === currentItemId) ?? siblings[0]

  return dimensionNames.map((dimensionName) => {
    // For each distinct value on this axis, prefer the sibling that also
    // matches the current item on every OTHER axis (mirrors
    // buildStoreVariantDimensions in parsers.ts, used for Shopify/
    // WooCommerce) — falls back to the first sibling with that value if
    // no exact cross-axis match exists (e.g. a Color that only comes in
    // one Size).
    const byLabel = new Map<string, EbaySiblingItem>()
    for (const sibling of siblings) {
      const label = siblingAspectValue(sibling, dimensionName)
      if (!label) continue
      const existing = byLabel.get(label)
      const matchesOtherAxes = dimensionNames.every((otherName) => {
        if (otherName === dimensionName) return true
        return siblingAspectValue(sibling, otherName) === siblingAspectValue(current, otherName)
      })
      if (!existing || matchesOtherAxes) byLabel.set(label, sibling)
    }

    return {
      dimension: dimensionName,
      options: [...byLabel.entries()].map(([label, sibling]) => ({
        label,
        price: money(sibling.price),
        currencyCode: sibling.price?.currency ?? null,
        image: sibling.image?.imageUrl ?? null,
        url:
          sibling.itemWebUrl ||
          (sibling.legacyItemId ? `https://www.ebay.com/itm/${sibling.legacyItemId}` : null),
        selected: sibling.itemId === current.itemId,
        outOfStock: siblingOutOfStock(sibling),
      })),
    }
  })
}

export async function fetchEbayItemByLegacyId(
  legacyItemId: string,
  legacyVariationId: string | null,
  marketplaceId = process.env.EBAY_MARKETPLACE_ID || 'EBAY_US'
): Promise<EbayApiProduct> {
  const token = await getEbayAccessToken()

  const params = new URLSearchParams({ legacy_item_id: legacyItemId })
  if (legacyVariationId) params.set('legacy_variation_id', legacyVariationId)
  // PRODUCT fieldgroup pulls in extra data the default response omits —
  // brand/MPN/GTIN (when eBay has them attached to the listing) and a
  // fuller aspect list — so there's more to show, not less.
  params.set('fieldgroups', 'PRODUCT')

  const res = await fetch(`${EBAY_BROWSE_ITEM_BY_LEGACY_ID_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const sandboxHint = IS_SANDBOX
      ? ' (EBAY_ENV=sandbox — sandbox only has synthetic test listings; a real item id will 404 here)'
      : ''
    throw new Error(`eBay Browse API request failed (HTTP ${res.status})${sandboxHint}: ${body.slice(0, 500)}`)
  }

  const item = await res.json()

  const images = [item.image?.imageUrl, ...(item.additionalImages ?? []).map((i: any) => i.imageUrl)].filter(
    Boolean
  ) as string[]

  const itemSpecifics: { name: string; value: string }[] = (item.localizedAspects ?? []).map((a: any) => ({
    name: a.name,
    value: a.value,
  }))

  const ended = !!item.itemEndDate && new Date(item.itemEndDate).getTime() < Date.now()

  // Sibling variations (full picker) — only fetched when this item is
  // actually part of a multi-variation listing.
  const itemGroupId = extractItemGroupId(item)
  const rawSiblings = itemGroupId ? await fetchEbayItemsByGroup(itemGroupId, marketplaceId) : []
  const siblings = rawSiblings.map(normalizeSibling)
  const variants = buildVariantDimensionsFromGroup(item.itemId, siblings)

  let variantsNote: string | null = null
  if (itemGroupId && siblings.length <= 1) {
    variantsNote =
      'This listing is part of a multi-variation group, but sibling variation data could not be fetched (API error or an expired item group) — showing only the single fetched item.'
  } else if (itemGroupId && variants.length === 0) {
    variantsNote =
      'This listing is part of a multi-variation group, but no aspect that actually varies across the siblings could be detected.'
  }

  const returnTerms = item.returnTerms
  const itemLocation = item.itemLocation
  const paymentMethods: string[] = Array.isArray(item.paymentMethods)
    ? item.paymentMethods.map((p: any) => p.paymentMethodType).filter(Boolean)
    : []

  return {
    itemId: item.itemId,
    legacyItemId: item.legacyItemId ?? legacyItemId,
    title: item.title ?? null,
    price: money(item.price),
    currencyCode: item.price?.currency ?? null,
    originalPrice: money(item.marketingPrice?.originalPrice),
    discountPercentage:
      item.marketingPrice?.discountPercentage != null ? Number(item.marketingPrice.discountPercentage) : null,
    condition: item.condition ?? null,
    conditionDescription: item.conditionDescription ?? null,
    images,
    seller: item.seller?.username ?? null,
    sellerFeedbackScore: item.seller?.feedbackScore ?? null,
    sellerFeedbackPercent: item.seller?.feedbackPercentage ?? null,
    availability: normalizeAvailability(item.itemEndDate, item.estimatedAvailabilities?.[0]),
    quantityAvailable: item.estimatedAvailabilities?.[0]?.estimatedAvailableQuantity ?? null,
    quantitySold: item.estimatedAvailabilities?.[0]?.estimatedSoldQuantity ?? null,
    shipping: formatShipping(item.shippingOptions),
    itemLocation: itemLocation
      ? [itemLocation.city, itemLocation.stateOrProvince, itemLocation.country].filter(Boolean).join(', ')
      : null,
    topRatedBuying: !!item.topRatedBuyingExperience,
    returnsAccepted: returnTerms?.returnsAccepted ?? null,
    returnPeriodDays: returnTerms?.returnPeriod?.value ?? null,
    paymentMethods,
    brand: item.brand ?? itemSpecifics.find((a) => a.name === 'Brand')?.value ?? null,
    mpn: item.mpn ?? itemSpecifics.find((a) => a.name === 'MPN')?.value ?? null,
    gtin: item.gtin ?? null,
    categoryPath: item.categoryPath ?? null,
    itemCreationDate: item.itemCreationDate ?? null,
    bidCount: item.bidCount ?? null,
    currentBidPrice: money(item.currentBidPrice),
    itemWebUrl: item.itemWebUrl ?? '',
    buyingOptions: item.buyingOptions ?? [],
    itemEndDate: item.itemEndDate ?? null,
    variants,
    variantsNote,
    itemSpecifics,
    ended,
  }
}

// ---------- Legacy DOM/JSON-LD scraper (fallback path, no API creds) ----------
//
// Used only by parsers.ts's generic scrapeProduct() flow when
// EBAY_APP_ID/EBAY_CERT_ID are unset. Most fields here return null on
// purpose — parseHtml()'s JSON-LD / OpenGraph merge chain (withFallbacks)
// fills in title/price/currency/images from the page's own SEO metadata.
// This function's job is just: (1) a raw <h1>/<title> fallback in case
// JSON-LD is missing, and (2) the full set of variant dimensions/options
// actually present in the static HTML (a plain <select> per dimension,
// plus the ux-labels-values blocks eBay server-renders for the currently
// selected variant when no <select> is present).

export type EbayLegacyVariantOption = {
  label: string
  value: string | null
  // Best-effort re-derived link: eBay item pages accept `?var=<variation
  // id>` to jump straight to that variation. We only know this id when
  // the <select>'s option value (or a data-var-id/data-*-id attribute) is
  // itself numeric — eBay doesn't always render that on the static page,
  // so this is frequently null. It is never guessed/fabricated.
  url: string | null
  // Static HTML does NOT carry per-option pricing — see the block
  // comment above extractEbayVariantDimensions. This is only ever
  // non-null for the option that happens to be the currently-selected
  // one, because that price is the page's own displayed price (picked up
  // separately by parseHtml()'s JSON-LD/OpenGraph merge, not by this
  // function) — everyone else's is unknown from a single static fetch.
  price: string | null
  selected: boolean
}

export type EbayLegacyVariantDimension = {
  dimension: string
  options: EbayLegacyVariantOption[]
}



// Mirrors the consumeXMeta(parsed) pattern used by Meesho/Myntra/Ajio/etc
// in parsers.ts — those extractors stash warning/unavailable flags as
// private keys on the parsed object for scrapeProduct() to pull off after
// the fact. eBay's legacy scraper doesn't currently set any such flags
// (its warnings come from the generic "no price found" / "no title found"
// checks in scrapeProduct instead), so this is a no-op placeholder kept
// for interface symmetry — safe to extend later if eBay-specific parsing
// signals (e.g. "listing ended" text on the page) are added.
export function consumeEbayMeta(_parsed: Record<string, any>): { warning?: string; unavailable?: boolean } {
  return {}
}

// Non-variant selects that legitimately show up as <select> elements on
// an eBay item page but aren't a product option (quantity, shipping
// speed, etc.) — filtered out so they don't show up as a bogus "variant
// dimension".
const EBAY_NON_VARIANT_SELECT_RE = /qty|quantity|ship|deliver|zip|postal|country/i

function buildEbayVariantUrl(pageUrl: string, varId: string): string | null {
  try {
    const u = new URL(pageUrl)
    u.searchParams.set('var', varId)
    return u.toString()
  } catch {
    return null
  }
}

// Reuses EbayApiVariantDimension/EbayApiVariantOption (the same shape the
// credentialed Browse API path returns) rather than a parallel "legacy"
// type — so EbayProductView and the generic VariantPicker can render
// either path's output identically. The one real difference: static HTML
// carries no per-option price or image, so those fields come back `null`
// here rather than guessed/backfilled — variantsNote (below) tells the
// caller why.
export function extractEbayVariantDimensions($: CheerioAPI, pageUrl: string): EbayApiVariantDimension[] {
  const dimensions: EbayApiVariantDimension[] = []
  const seenDimensionNames = new Set<string>()

  // ---- Case 1: server-rendered <select> per dimension (most listings) ----
  $('select').each((_, el) => {
    const $el = $(el)
    const rawName = $el.attr('name') || $el.attr('id')
    if (!rawName || EBAY_NON_VARIANT_SELECT_RE.test(rawName)) return

    const dimensionName = rawName.replace(/[_-]/g, ' ').trim()
    const options: EbayApiVariantOption[] = []

    $el.find('option').each((_, opt) => {
      const $opt = $(opt)
      const label = cleanText($opt)
      if (!label || /^(select|choose|please select)/i.test(label)) return

      const value = $opt.attr('value') || null
      const selected = $opt.attr('selected') != null

      // eBay variation selects commonly carry the numeric legacy
      // variation id straight in the option's `value` (or a data-*
      // attribute). Only treated as a variation id — and therefore only
      // used to build a `?var=` redirect URL — when it's actually
      // numeric; a purely descriptive value (e.g. value="Red") gives us
      // no id to redirect to, so `url` stays null rather than pointing
      // somewhere wrong.
      const varId =
        (value && /^\d+$/.test(value) && value) ||
        $opt.attr('data-var-id') ||
        $opt.attr('data-variation-id') ||
        null

      options.push({
        label,
        price: null, // not present in static HTML — see variantsNote
        currencyCode: null,
        image: null, // ditto
        url: varId ? buildEbayVariantUrl(pageUrl, varId) : null,
        selected,
        outOfStock: false, // static HTML doesn't reliably flag this either
      })
    })

    if (options.length) {
      dimensions.push({ dimension: dimensionName, options })
      seenDimensionNames.add(dimensionName.toLowerCase())
    }
  })

  // ---- Case 2: no <select> at all — fall back to the single visible ----
  // ---- selection eBay server-renders as a ux-labels-values block, so ----
  // ---- at minimum the currently-active choice on each known axis is ----
  // ---- still reported (as a one-option "dimension") rather than lost. ----
  $('.ux-labels-values__labels').each((_, el) => {
    const label = cleanText($(el))
    if (!label || !/^(size|colou?r|style|material)$/i.test(label)) return
    if (seenDimensionNames.has(label.toLowerCase())) return // already covered by a <select> above

    const value = cleanText($(el).closest('.ux-labels-values').find('.ux-labels-values__values').first())
    if (!value) return

    dimensions.push({
      dimension: label,
      options: [
        {
          label: value,
          price: null,
          currencyCode: null,
          image: null,
          url: null, // no id to derive a redirect from in this markup shape
          selected: true,
          outOfStock: false,
        },
      ],
    })
    seenDimensionNames.add(label.toLowerCase())
  })

  return dimensions
}

export function extractEbayOptions($: CheerioAPI): Record<string, string> | null {
  const options: Record<string, string> = {}

  $('select').each((_, el) => {
    const $el = $(el)
    const name = $el.attr('name') || $el.attr('id')
    if (!name) return
    const selectedText =
      cleanText($el.find('option[selected]').first()) || cleanText($el.find('option:checked').first())
    if (selectedText && !/^(select|choose|please select)/i.test(selectedText)) {
      options[name.replace(/[_-]/g, ' ').trim()] = selectedText
    }
  })

  $('.ux-labels-values__labels').each((_, el) => {
    const label = cleanText($(el))
    if (!label || !/^(size|colou?r|style|material)$/i.test(label)) return
    const value = cleanText($(el).closest('.ux-labels-values').find('.ux-labels-values__values').first())
    if (value) options[label] = value
  })

  return Object.keys(options).length ? options : null
}

export function parseEbay($: CheerioAPI, url: string): Record<string, any> {
  const domainHint = domainCurrency(url)
  const variants = extractEbayVariantDimensions($, url)
  return {
    title: cleanText($('h1').first()) || cleanText($('title')),
    price: null as string | null,
    mrp: null as string | null,
    currencyCode: domainHint,
    rating: null,
    review_count: null,
    availability: null,
    seller: null,
    images: [] as string[],
    options: extractEbayOptions($),
    variants,
    // Flagged whenever we found a dimension/option to pick from but
    // couldn't attach real per-option pricing/images (static HTML doesn't
    // carry it — see extractEbayVariantDimensions). Downstream UI can use
    // this to prompt "configure EBAY_APP_ID/EBAY_CERT_ID for real
    // per-variant pricing" instead of silently showing blanks.
    variantsNote: variants.length
      ? 'Per-variant prices/images are not available without EBAY_APP_ID/EBAY_CERT_ID configured — only option labels and (where derivable) "?var=" redirect URLs were scraped from the static page.'
      : null,
  }
}