import { NextResponse } from 'next/server'
import { scrapeProduct } from '@/lib/scrape/parsers'
import { matchAffiliatedSellerUrl } from '@/lib/store-config-db'
import { extractProductIdentifier } from '@/lib/store-providers/product-id'
import { fetchStoreProduct } from '@/lib/store-providers/product'

// Must be >= the ScraperAPI TOTAL_BUDGET_MS (5 min) or the platform
// will kill the function before scrapeProduct() gets a chance to
// finish and return — silently reintroducing the exact "server
// finished but nobody was listening" problem this whole fix is for.
export const maxDuration = 300 // seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  const needVariants = searchParams.get('needVariants') === 'true'

  if (!url) {
    return NextResponse.json({ error: 'Missing required query param: url' }, { status: 400 })
  }

  // Cheap, cached check (see matchAffiliatedSellerUrl — 24h platform-wide
  // cache) before ever spending scraper budget: is this actually one of
  // our own affiliated sellers' storefront URLs? If so, we already have
  // this seller's real config/pricing in our own DB — no need to run
  // their storefront through the external scraper like an unknown site.
  const matchedSeller = await matchAffiliatedSellerUrl(url)

  if (matchedSeller) {
    // Best-effort extraction of which specific product this URL points
    // to, per that provider's own path convention (see
    // extractProductIdentifier) — then VALIDATED against the real
    // catalog via fetchStoreProduct before we ever redirect to it. A
    // guessed id that doesn't resolve (wrong convention, jsonapi/mock
    // store, product removed, etc.) falls back to the store's catalog
    // page rather than sending the customer to a 404 product route.
    const productId = extractProductIdentifier(url, matchedSeller.config.type)

    if (productId) {
      try {
        const product = await fetchStoreProduct(matchedSeller.platform, productId)
        if (product) {
          // NOTE: this app's product detail route is singular
          // "/product/[productId]", not "/products/[productId]" — do
          // not pluralize this segment.
          return NextResponse.json({
            internalRedirect: `/stores/${matchedSeller.platform}/product/${encodeURIComponent(productId)}`,
          })
        }
      } catch (err) {
        console.error('[product-lookup] failed to validate matched product', matchedSeller.platform, productId, err)
      }
    }

    // No identifier extracted, or it didn't resolve to a real product —
    // send the customer to the store's catalog page instead.
    return NextResponse.json({ internalRedirect: `/stores/${matchedSeller.platform}` })
  }

  // request.signal fires if the client disconnects — threading it down
  // means an abandoned request actually stops the upstream ScraperAPI
  // call instead of running to completion (and billing) with nobody
  // there to receive the result.
  const result = await scrapeProduct(url, { needVariants, signal: request.signal })
  return NextResponse.json(result)
}