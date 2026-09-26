// lib/wishdrop-mall/sourcing.ts
//
// SERVER-ONLY. Turns "a product somewhere else" into a MallDraft — the
// neutral, cost-priced shape the Wishdrop Mall admin previews, edits and
// finally saves into our own `products` table. Two ways in:
//
//   1. draftFromStore(platform, handle) — a product picked while browsing
//      one of our affiliated stores' live feeds in the admin panel. Goes
//      through the same fetchStoreProduct() the storefront uses, so it
//      gets full variants, images and stock exactly as shoppers see them.
//
//   2. draftFromLink(url) — any pasted product URL. If the link belongs
//      to one of our own affiliated sellers we resolve it through that
//      seller's feed (same short-circuit /api/product-lookup does);
//      otherwise it goes through the external scraper (lib/scrape/parsers).
//      Scraped links carry no per-variant pricing, so they're saved as a
//      single-price product — staff can check price/currency in the
//      preview before saving.
//
// Also used by the "Refresh from source" action to re-price an existing
// Mall product against its source.

import { fetchStoreProduct } from '@/lib/store-providers/product'
import { extractProductIdentifier } from '@/lib/store-providers/product-id'
import { matchAffiliatedSellerUrl, getSellerAndConfig } from '@/lib/store-config-db'
import { scrapeProduct } from '@/lib/scrape/parsers'
import { looksLikeShortlink, resolveFinalUrl } from '@/lib/scrape/resolve-redirect'
import type { StoreProduct } from '@/lib/store.types'
import { WISHDROP_MALL_SLUG, type MallDraft, type MallDraftVariant } from '@/lib/wishdrop-mall'

export class SourcingError extends Error {
  constructor(message: string, public status = 422) {
    super(message)
  }
}

/** "₹1,299.00" / "1299" / "Rs. 1,299" -> 1299. Null when nothing numeric. */
export function parseMoney(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  if (typeof value !== 'string') return null
  // Start at the first digit so a currency prefix like "Rs." doesn't
  // contribute its dot ("Rs. 1,299" -> "1299", not ".1299").
  const firstDigit = value.search(/\d/)
  if (firstDigit === -1) return null
  const cleaned = value.slice(firstDigit).replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return 'link'
  }
}

function storeProductToDraft(p: StoreProduct, source: MallDraft['source']): MallDraft {
  const axisNames = (p.options ?? []).map((o) => o.name)

  const variants: MallDraftVariant[] =
    p.variants && p.variants.length > 1
      ? p.variants.map((v) => {
          const options: Record<string, string> = {}
          v.options.forEach((value, i) => {
            const axis = axisNames[i] ?? `Option ${i + 1}`
            if (value) options[axis] = value
          })
          return {
            label: v.title || Object.values(options).join(' / ') || 'Default',
            options,
            costPrice: v.price ?? p.price,
            compareAtCost: v.compareAtPrice ?? null,
            available: v.available,
            imageUrl: v.fullImage ?? v.image ?? null,
            sku: null,
          }
        })
      : []

  return {
    name: p.name,
    description: p.description ?? '',
    fullDescription: p.fullDescription ?? null,
    category: p.category || 'General',
    images: (p.images?.length ? p.images : [p.image]).filter(Boolean),
    costPrice: Number.isFinite(p.price) && p.price > 0 ? p.price : null,
    compareAtCost: p.compareAtPrice ?? null,
    currency: p.currency || 'INR',
    tags: p.tags ?? [],
    gender: p.gender ?? null,
    sku: p.sku ?? null,
    weightKg: p.weightKg ?? null,
    stockCount: p.stockCount ?? null,
    inStock: p.inStock,
    variants,
    source,
  }
}

export async function draftFromStore(platform: string, handle: string): Promise<MallDraft> {
  if (platform === WISHDROP_MALL_SLUG) {
    throw new SourcingError('That product is already in Wishdrop Mall.', 400)
  }

  const seller = await getSellerAndConfig(platform)
  if (!seller) throw new SourcingError(`Store "${platform}" wasn't found or isn't active.`, 404)

  const product = await fetchStoreProduct(platform, handle)
  if (!product) throw new SourcingError("That product couldn't be loaded from the store's feed anymore.", 404)

  return storeProductToDraft(product, {
    platform,
    handle,
    url: product.url ?? (seller.url ? seller.url : null),
    name: seller.name,
  })
}

export async function draftFromLink(rawUrl: string, signal?: AbortSignal): Promise<MallDraft> {
  let url: string
  try {
    const parsed = new URL(rawUrl.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad protocol')
    url = parsed.toString()
  } catch {
    throw new SourcingError('Paste a full product link starting with https://', 400)
  }

  if (looksLikeShortlink(url)) url = await resolveFinalUrl(url)

  // One of our own affiliated sellers? Use its real feed (variants,
  // exact prices) instead of scraping it like an unknown site.
  const matched = await matchAffiliatedSellerUrl(url)
  if (matched && matched.platform !== WISHDROP_MALL_SLUG) {
    const handle = extractProductIdentifier(url, matched.config.type)
    if (handle) {
      const product = await fetchStoreProduct(matched.platform, handle).catch(() => null)
      if (product) {
        return storeProductToDraft(product, {
          platform: matched.platform,
          handle,
          url,
          name: matched.name,
        })
      }
    }
  }

  const result = await scrapeProduct(url, { needVariants: false, signal })
  if (result.error && !result.title) {
    throw new SourcingError(`Couldn't read that product page: ${result.error}`, 422)
  }
  if (!result.title) {
    throw new SourcingError("Couldn't find a product on that page. Check the link and try again.", 422)
  }

  const price = parseMoney(result.price)
  const mrp = parseMoney(result.mrp)
  const host = hostnameOf(result.url || url)

  return {
    name: result.title,
    description: result.description ?? '',
    fullDescription: null,
    category: 'General',
    images: (result.images ?? []).filter(Boolean),
    costPrice: price,
    compareAtCost: mrp && price && mrp > price ? mrp : null,
    currency: result.currencyCode || 'INR',
    tags: result.brand ? [result.brand] : [],
    gender: null,
    sku: null,
    weightKg: null,
    stockCount: result.quantityAvailable ?? null,
    inStock: !result.unavailable,
    variants: [],
    source: {
      platform: result.site ?? host,
      handle: null,
      url: result.url || url,
      name: host,
    },
  }
}
