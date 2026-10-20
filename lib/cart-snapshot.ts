// lib/cart-snapshot.ts
//
// Turns a store product (+ the shopper's size/colour choice) into the
// CartProduct line the bag stores. Used by "Add to bag" and by the bag's
// "Change" picker, so both build exactly the same line:
//   - selectedOptions is saved on the line (checkout reads it to price the
//     right variant and to label the order item);
//   - price and photo are the chosen variant's own, when it has them;
//   - the id includes the choice, so two colours of one product are two lines.

import type { CartProduct } from '@/contexts/Cartcontext'
import type { StoreProduct } from '@/lib/store.types'
import { variantFor } from '@/lib/product-selection'

/** Product URL with ?variant=<id> (Shopify's deep-link format). */
export function withVariantParam(url: string | undefined, variantId?: string): string {
  if (!url) return ''
  if (!variantId) return url
  try {
    const u = new URL(url)
    u.searchParams.set('variant', variantId)
    return u.toString()
  } catch {
    return url
  }
}

export function toCartSnapshot(
  product: StoreProduct,
  platform: string,
  selectedOptions?: Record<string, string>,
  variantUrl?: string,
): CartProduct {
  const variant = variantFor(product, selectedOptions)
  const baseUrl = variantUrl || withVariantParam(product.url, variant?.id) || product.url || ''
  const baseId = baseUrl || `${platform}:${product.id}`

  const variantSuffix = selectedOptions
    ? `:${Object.keys(selectedOptions)
        .sort()
        .map((k) => `${k}=${selectedOptions[k]}`)
        .join(',')}`
    : ''

  const id = `${baseId}${variantSuffix}`
  const price = variant?.price != null && variant.price > 0 ? variant.price : product.price

  return {
    id,
    url: baseUrl || id,
    site: platform,
    title: product.name,
    image: variant?.fullImage ?? variant?.image ?? product.images?.[0] ?? product.image ?? null,
    currencyCode: product.currency ?? null,
    sourcePrice: price != null ? String(price) : null,
    estimatedPrice: null,
    weightKg: product.weightKg ?? null,
    origin: product.origin ?? null,
    marginIncluded: product.marginIncluded,
    source: 'catalogue',
    selectedOptions: selectedOptions && Object.keys(selectedOptions).length ? selectedOptions : undefined,
    productHandle: product.handle || product.id,
  }
}

/** Something saved from a store (wishlist / board item, bag line). */
type SavedItem = { id: string; url: string; site?: string | null; productHandle?: string | null }

/**
 * The store product handle for a saved item, if it came from one of our
 * stores: the saved handle, else one recoverable from how it was saved
 * (`<store>:<id>` ids, or a /products/<handle> link). Null for pasted
 * links from marketplaces — those have no variants to choose here.
 */
export function storeHandleFor(item: SavedItem): string | null {
  if (!item.site) return null
  if (item.productHandle) return item.productHandle
  for (const key of [item.id, item.url]) {
    if (key?.startsWith(`${item.site}:`)) return key.slice(item.site.length + 1).split(':')[0] || null
  }
  const m = item.url?.match(/\/products?\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Where a saved item (bag line, wishlist entry, board item) should link.
 *
 * - From one of our affiliated stores → OUR product page, never the
 *   seller's own site. The seller's page shows their raw price; a shopper
 *   comparing it with ours (which includes freight, duty and margin) sees
 *   a "price surge" and complains.
 * - A link the customer pasted themselves (`source: 'link'`) → the
 *   original page, opened in a new tab: they found it there and already
 *   know its price.
 */
export function savedItemHref(
  item: SavedItem & { source?: 'catalogue' | 'link' },
  fallback: string,
): { href: string; external: boolean } {
  if (item.source !== 'link') {
    const handle = storeHandleFor(item)
    if (handle && item.site) {
      return { href: `/stores/${item.site}/product/${encodeURIComponent(handle)}`, external: false }
    }
    // A store item we can't map back to a product page: stay on our site.
    if (item.source === 'catalogue') return { href: fallback, external: false }
  }
  return item.url ? { href: item.url, external: true } : { href: fallback, external: false }
}

/**
 * A saved item as a bag line WITHOUT a size / colour choice. Store items
 * are added as store lines (so checkout prices them from the store and the
 * bag asks for any missing choice); anything else stays a plain link.
 */
export function savedItemToCartLine(
  item: SavedItem & { title: string; image?: string | null; currencyCode?: string | null; price?: string | null },
): CartProduct {
  const handle = storeHandleFor(item)
  return {
    id: item.id,
    url: item.url,
    site: item.site,
    title: item.title,
    image: item.image,
    currencyCode: item.currencyCode,
    sourcePrice: item.price,
    ...(handle ? { source: 'catalogue' as const, productHandle: handle } : { source: 'link' as const }),
  }
}
