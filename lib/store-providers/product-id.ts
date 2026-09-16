// lib/store-providers/product-id.ts
//
// Best-effort extraction of a product identifier from an external
// storefront URL, based on that provider's typical path convention. Used
// by /api/product-lookup to figure out which specific product a pasted
// affiliated-seller link points to, so the redirect can land on that
// product's detail page instead of just the store's catalog.
//
// This is intentionally "best-effort, then validate": callers should
// always confirm the extracted id actually resolves via
// fetchStoreProduct() before redirecting to it — a wrong guess (e.g. a
// jsonapi/mock store, where there's no reliable generic path pattern)
// should fall back to the catalog page, never a 404.

export function extractProductIdentifier(rawUrl: string, providerType: string): string | null {
  let pathname: string
  try {
    pathname = new URL(rawUrl).pathname
  } catch {
    return null
  }

  const segments = pathname.split('/').filter(Boolean)
  if (!segments.length) return null

  switch (providerType) {
    case 'shopify': {
      // e.g. /products/blue-denim-jacket
      const idx = segments.indexOf('products')
      return idx !== -1 && segments[idx + 1] ? decodeURIComponent(segments[idx + 1]) : null
    }
    case 'woocommerce': {
      // e.g. /product/blue-denim-jacket/
      const idx = segments.indexOf('product')
      return idx !== -1 && segments[idx + 1] ? decodeURIComponent(segments[idx + 1]) : null
    }
    default:
      // jsonapi / mock: no reliable generic convention. Best-effort guess
      // at the last path segment, but this is exactly why the caller
      // must validate via fetchStoreProduct() before trusting it.
      return decodeURIComponent(segments[segments.length - 1])
  }
}