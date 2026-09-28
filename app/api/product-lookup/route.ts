import { NextResponse } from 'next/server'
import { scrapeProduct } from '@/lib/scrape/parsers'
import { matchAffiliatedSellerUrl } from '@/lib/store-config-db'
import { extractProductIdentifier } from '@/lib/store-providers/product-id'
import { fetchStoreProductForRedirectCheck } from '@/lib/store-providers/product'
import { upsertScrapeHealth } from '@/lib/supabase/scrape-health-write'
import { looksLikeShortlink, resolveFinalUrl } from '@/lib/scrape/resolve-redirect'

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

  // Internal QA testing traffic (app/demo/scraper-qa) sends this header
  // (see ScraperQaClient's attemptLookup). It is excluded from Scrape
  // health, AND it must never take the affiliated-seller shortcut below:
  // that shortcut returns `{ internalRedirect }`, which is an instruction
  // for the customer flow, not a scrape result — the QA page would render
  // it as an empty "Unknown site". QA exists to exercise the real scraper,
  // so an affiliated store's URL is scraped like any other.
  const isQaTraffic =
    request.headers.get('x-scrape-source') === 'qa-tool' || searchParams.get('qa') === 'true'
  console.log('[product-lookup] qa-traffic check', {
    isQaTraffic,
    header: request.headers.get('x-scrape-source'),
    qaParam: searchParams.get('qa'),
  })

  // A shortlink's own domain (bit.ly, amzn.to, a WhatsApp-shared
  // affiliate link, ...) has nothing to do with the real product —
  // resolve it to the real destination BEFORE anything below keys off
  // the URL's hostname (matchAffiliatedSellerUrl, scrapeProduct,
  // upsertScrapeHealth's domain attribution). Cheap heuristic gate
  // first (looksLikeShortlink) so the common case — a customer pastes
  // an already-real store URL — never pays for an extra round trip.
  // Best-effort: resolveFinalUrl returns the original url unchanged on
  // any failure, so a shortener having a bad day never blocks the
  // request.
  const resolvedUrl = looksLikeShortlink(url) ? await resolveFinalUrl(url) : url
  if (resolvedUrl !== url) {
    console.log('[product-lookup] resolved shortlink', { original: url, resolved: resolvedUrl })
  }

  // Cheap, cached check (see matchAffiliatedSellerUrl — 24h platform-wide
  // cache) before ever spending scraper budget: is this actually one of
  // our own affiliated sellers' storefront URLs? If so, we already have
  // this seller's real config/pricing in our own DB — no need to run
  // their storefront through the external scraper like an unknown site.
  // Skipped for QA traffic (see isQaTraffic above).
  const matchedSeller = isQaTraffic ? null : await matchAffiliatedSellerUrl(resolvedUrl)

  if (matchedSeller) {
    // Best-effort extraction of which specific product this URL points
    // to, per that provider's own path convention (see
    // extractProductIdentifier) — then VALIDATED against the real
    // catalog via fetchStoreProduct before we ever redirect to it. A
    // guessed id that doesn't resolve (wrong convention, jsonapi/mock
    // store, product removed, etc.) falls back to the store's catalog
    // page rather than sending the customer to a 404 product route.
    const productId = extractProductIdentifier(resolvedUrl, matchedSeller.config.type)

    if (productId) {
      try {
        const product = await fetchStoreProductForRedirectCheck(matchedSeller.platform, productId)
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
  const result = await scrapeProduct(resolvedUrl, { needVariants, signal: request.signal })
  if (resolvedUrl !== url) result.resolvedFromShortlink = true

  // FIX: every real diagnostic detail scrapeProduct() computes (which
  // tier failed, BLOCKED vs JS_SHELL vs a specific HTTP status, vendor-
  // fingerprinted block-page markers, per-key ScraperAPI errors, ...)
  // used to be thrown away the moment this response left the server —
  // returned to the client, never logged server-side. This one line is
  // what actually answers "why did this platform fail in production": a
  // clear, greppable log line per failure, with the site, URL, and the
  // FULL error text all in one place. See upsertScrapeHealth below for
  // the second, PERSISTENT half of this fix.
  if (result.error) {
    console.error(`[product-lookup] FAILED site=${result.site ?? 'unknown'} url=${resolvedUrl} — ${result.error}`)
  }

  if (!isQaTraffic) {
    // Fire-and-forget: this is the one real call site the Scrape health
    // panel's fail_count/success_count depend on (see
    // scrape-health-write.ts's own header for the gap this closes) —
    // intentionally NOT awaited, so a slow or failing health-tracking
    // write can never add latency to, or break, the actual response the
    // customer is waiting on. On a success, also carries the real
    // title/image/price through so ops can see an actual example of what
    // this domain's product pages look like. On a FAILURE, carries the
    // full error text through instead.
    upsertScrapeHealth(
      resolvedUrl,
      !result.error,
      {
        title: result.title,
        imageUrl: result.images?.[0],
        price: result.price,
      },
      result.error,
    )
  }

  return NextResponse.json(result)
}