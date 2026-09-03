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
// Docs:
//   OAuth (client credentials): https://developer.ebay.com/api-docs/static/oauth-client-credentials-grant.html
//   Browse API getItemByLegacyId: https://developer.ebay.com/api-docs/buy/browse/resources/item/methods/getItemByLegacyId

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

const EBAY_OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope'

// ---------- Site identity (used by parsers.ts's site-routing tables) ----------

export const SITE_ID = 'ebay'

// The legacy scraper's variant picker is a plain server-rendered <select>/
// label-value block, not a client-side-hydrated widget — so unlike
// Flipkart/Meesho/etc it does NOT need a JS-rendering fetch tier for
// variant data to show up in a static HTML fetch.
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
  condition: string | null
  images: string[]
  seller: string | null
  sellerFeedbackScore: number | null
  sellerFeedbackPercent: string | null
  availability: string | null
  quantityAvailable: number | null
  shipping: string | null
  itemWebUrl: string
  buyingOptions: string[]
  itemEndDate: string | null
  variants: EbayApiVariantDimension[]
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

// NOTE ON VARIANTS: getItemByLegacyId returns full detail for the ONE
// item/variation you requested — it does not return a full sibling-variant
// picker (that requires the Browse API's item-group / search endpoints,
// a separate call this function deliberately doesn't make). So rather than
// fake a clickable picker the way the old scraper attempted to, this
// surfaces the properties that vary (color/size/etc, from
// `localizedAspects`) as read-only info. This is a real scope reduction
// vs. the old (unverified) scraper — call it out to reviewers.
function buildVariantDimensions(item: any): EbayApiVariantDimension[] {
  const aspects: { name: string; value: string }[] = (item.localizedAspects ?? []).map((a: any) => ({
    name: a.name,
    value: a.value,
  }))
  const variantAspectNames = ['Color', 'Size', 'Style', 'Storage Capacity', 'Model']
  return aspects
    .filter((a) => variantAspectNames.includes(a.name))
    .map((a) => ({
      dimension: a.name,
      options: [
        {
          label: a.value,
          price: money(item.price),
          currencyCode: item.price?.currency ?? null,
          image: item.image?.imageUrl ?? null,
          url: null, // no sibling-variant URL available from this endpoint
          selected: true,
        },
      ],
    }))
}

export async function fetchEbayItemByLegacyId(
  legacyItemId: string,
  legacyVariationId: string | null,
  marketplaceId = process.env.EBAY_MARKETPLACE_ID || 'EBAY_US'
): Promise<EbayApiProduct> {
  const token = await getEbayAccessToken()

  const params = new URLSearchParams({ legacy_item_id: legacyItemId })
  if (legacyVariationId) params.set('legacy_variation_id', legacyVariationId)

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

  return {
    itemId: item.itemId,
    legacyItemId: item.legacyItemId ?? legacyItemId,
    title: item.title ?? null,
    price: money(item.price),
    currencyCode: item.price?.currency ?? null,
    originalPrice: money(item.marketingPrice?.originalPrice),
    condition: item.condition ?? null,
    images,
    seller: item.seller?.username ?? null,
    sellerFeedbackScore: item.seller?.feedbackScore ?? null,
    sellerFeedbackPercent: item.seller?.feedbackPercentage ?? null,
    availability: normalizeAvailability(item.itemEndDate, item.estimatedAvailabilities?.[0]),
    quantityAvailable: item.estimatedAvailabilities?.[0]?.estimatedAvailableQuantity ?? null,
    shipping: formatShipping(item.shippingOptions),
    itemWebUrl: item.itemWebUrl ?? '',
    buyingOptions: item.buyingOptions ?? [],
    itemEndDate: item.itemEndDate ?? null,
    variants: buildVariantDimensions(item),
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
// JSON-LD is missing, and (2) selected variant options actually visible
// in the static HTML (a plain <select> or the ux-labels-values blocks eBay
// server-renders for the currently selected variant).

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
  }
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