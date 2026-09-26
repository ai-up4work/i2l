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
//      otherwise it goes through the external scraper (lib/scrape/parsers)
//      with variants on, so Amazon-style pages bring brand, key features,
//      specifications and every colour/size with its own link, price and
//      image. Staff review and edit all of it in the product editor.
//
// Also used by the "Refresh from source" action to re-price an existing
// Mall product against its source.

import { fetchStoreProduct } from '@/lib/store-providers/product'
import { extractProductIdentifier } from '@/lib/store-providers/product-id'
import { matchAffiliatedSellerUrl, getSellerAndConfig } from '@/lib/store-config-db'
import { scrapeProduct } from '@/lib/scrape/parsers'
import { looksLikeShortlink, resolveFinalUrl } from '@/lib/scrape/resolve-redirect'
import type { StoreProduct } from '@/lib/store.types'
import type { AmazonVariantDimension } from '@/lib/scrape/extractors/amazon'
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

export function storeProductToDraft(p: StoreProduct, source: MallDraft['source']): MallDraft {
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
            sourceUrl: null,
          }
        })
      : []

  // Gallery: the product's own photos plus every variant's photo. Some
  // stores (e.g. Anishka Creation) give the product only the FIRST
  // design's photo and attach each other design's photo to its variant.
  const gallery = Array.from(
    new Set(
      [
        ...(p.images?.length ? p.images : [p.image]),
        ...(p.variants ?? []).map((v) => v.fullImage ?? v.image),
      ].filter((u): u is string => !!u),
    ),
  )

  // Sizes the store lists but doesn't model as a variant option.
  const suggestedOptions: Record<string, string[]> = {}
  if (p.sizes?.length && !axisNames.some((n) => n.toLowerCase() === 'size')) {
    suggestedOptions.Size = p.sizes
  }

  return {
    name: p.name,
    brand: p.vendor && p.vendor !== p.seller ? p.vendor : null,
    description: p.description ?? '',
    highlights: [],
    specs: [],
    fullDescription: p.fullDescription ?? null,
    category: p.category || 'General',
    images: gallery,
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
    suggestedOptions: Object.keys(suggestedOptions).length ? suggestedOptions : undefined,
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

  const result = await scrapeProduct(url, { needVariants: true, signal })
  if (result.error && !result.title) {
    throw new SourcingError(`Couldn't read that product page: ${result.error}`, 422)
  }
  if (!result.title) {
    throw new SourcingError("Couldn't find a product on that page. Check the link and try again.", 422)
  }

  const price = parseMoney(result.price)
  const mrp = parseMoney(result.mrp)
  const host = hostnameOf(result.url || url)

  const categoryLeaf = result.categoryPath
    ?.split(/[›>/|]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .pop()

  return {
    name: result.title,
    brand: result.brand?.trim() || null,
    description: result.description ?? '',
    highlights: (result.keyFeatures ?? []).map((f) => f.trim()).filter(Boolean).slice(0, 20),
    specs: (result.itemSpecifics ?? [])
      .map((r) => ({ name: String(r.name ?? '').trim(), value: String(r.value ?? '').trim() }))
      .filter((r) => r.name && r.value)
      .slice(0, 50),
    fullDescription: null,
    category: categoryLeaf || 'General',
    images: (result.images ?? []).filter(Boolean),
    costPrice: price,
    compareAtCost: mrp && price && mrp > price ? mrp : null,
    currency: result.currencyCode || 'INR',
    tags: [],
    gender: null,
    sku: result.mpn ?? null,
    weightKg: null,
    stockCount: result.quantityAvailable ?? null,
    inStock: !result.unavailable,
    variants: variantsFromDimensions(result.variants ?? []),
    source: {
      platform: result.site ?? host,
      handle: null,
      url: result.url || url,
      name: host,
    },
  }
}

/**
 * Amazon-style variant GROUPS -> purchasable variants.
 *
 * The scraper returns each dimension separately — e.g. Color: [Red, Blue]
 * and Size: [S, M, L] — with a link/price/image per option, not per
 * combination. One dimension maps 1:1. Several dimensions become every
 * combination (capped), taking link/price/image from the first option in
 * the combination that has one (on Amazon that's usually the colour).
 * Staff can prune or edit the rows in the editor.
 */
const MAX_GENERATED_VARIANTS = 100

export function variantsFromDimensions(dims: AmazonVariantDimension[]): MallDraftVariant[] {
  const usable = dims
    .filter((d) => d.dimension && d.options?.length)
    .slice(0, 3)
    .map((d) => ({ name: d.dimension.replace(/:$/, '').trim(), options: d.options.filter((o) => o.label?.trim()) }))
    .filter((d) => d.options.length > 0)
  if (usable.length === 0) return []

  type Opt = (typeof usable)[number]['options'][number]
  let combos: { name: string; opt: Opt }[][] = [[]]
  for (const dim of usable) {
    const next: typeof combos = []
    for (const combo of combos) {
      for (const opt of dim.options) {
        next.push([...combo, { name: dim.name, opt }])
        if (next.length >= MAX_GENERATED_VARIANTS) break
      }
      if (next.length >= MAX_GENERATED_VARIANTS) break
    }
    combos = next
  }

  return combos.map((combo) => {
    const options: Record<string, string> = {}
    for (const { name, opt } of combo) options[name] = opt.label.trim()
    const first = <T,>(pick: (o: Opt) => T | null | undefined) => {
      for (const { opt } of combo) {
        const v = pick(opt)
        if (v != null && v !== '') return v
      }
      return null
    }
    return {
      label: Object.values(options).join(' / '),
      options,
      costPrice: parseMoney(first((o) => o.price)),
      compareAtCost: parseMoney(first((o) => o.mrp ?? null)),
      available: !combo.some(({ opt }) => opt.outOfStock),
      imageUrl: first((o) => o.image),
      sku: null,
      sourceUrl: first((o) => o.url),
    }
  })
}
