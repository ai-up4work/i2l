import { NextResponse } from 'next/server'
import { detectSite, scrapeProduct, type ScrapeResult } from '@/lib/scrape/parsers'
import { matchAffiliatedSellerUrl } from '@/lib/store-config-db'
import { extractProductIdentifier } from '@/lib/store-providers/product-id'
import { fetchStoreProductForRedirectCheck } from '@/lib/store-providers/product'
import { upsertScrapeHealth } from '@/lib/supabase/scrape-health-write'
import { looksLikeShortlink, resolveFinalUrl } from '@/lib/scrape/resolve-redirect'
import { isRateLimited } from '@/lib/rate-limit'
import { isPublicHttpUrl } from '@/lib/url-safety'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { recordPriceObservation } from '@/lib/checkout/server'
import { fallbackWorthTrying, isWeakRead, mergeWeakRead, scrapeViaUniversalFallback, universalFallbackConfigured } from '@/lib/scrape/universal-fallback'

// FIX: checkout prices a pasted link from what our scraper saw for that URL
// in the last 24 h (price_observations). Only the old /api/scrape route —
// which nothing calls any more — wrote those, so every checkout and every
// cart total re-read each link live (up to 20 s each), and a slow store
// came back as "price couldn't be confirmed". The item screen's own
// lookup now records what the customer was shown.
function rememberPrice(urls: (string | undefined)[], result: ScrapeResult) {
  const price = result.price != null ? Number(String(result.price).replace(/[^0-9.]/g, '')) : NaN
  // A price from the backup (third-party) scraper is never stored as a trusted observation.
  if (result.error || result.ogOnly || result.source === 'universal_fallback' || !result.currencyCode || !Number.isFinite(price) || price <= 0) return
  try {
    const admin = createServiceRoleClient()
    for (const url of new Set(urls.filter((u): u is string => !!u))) {
      void recordPriceObservation(admin, { url, site: result.site, price, currency: result.currencyCode, weightKg: result.weightKg ?? null })
    }
  } catch (err) {
    console.error('[product-lookup] could not record price', err)
  }
}

// Must be >= the ScraperAPI TOTAL_BUDGET_MS (5 min) or the platform
// will kill the function before scrapeProduct() gets a chance to
// finish and return — silently reintroducing the exact "server
// finished but nobody was listening" problem this whole fix is for.
// Was 300. With LOOKUP_DEADLINE_MS below the lookup always answers well
// before this; it only needs room for the deadline plus the reply.
export const maxDuration = 90 // seconds

// FIX: nothing capped a lookup as a whole. Each method (store feed,
// headless-store check, page fetch, headless browser, paid scrapers) had
// its own limits — some none at all — and they ran one after another, so a
// hard store like row.gymshark.com could run until Vercel killed it at
// 300 s, and the browser then retried the whole thing. Now the lookup is
// stopped here and the shopper gets the preview / chat screen instead.
// CHANGED: 70 s -> 60 s. Past this, our own scraper is abandoned and the
// last-resort universal scraper (lib/scrape/universal-fallback.ts) gets its
// own short window (UNIVERSAL_SCRAPER_TIMEOUT_MS, 15 s) — so the worst case is
// ~75 s (+ shortlink resolve), inside maxDuration (90 s) and the browser's 88 s wait.
const LOOKUP_DEADLINE_MS = Number(process.env.PRODUCT_LOOKUP_DEADLINE_MS) || 60_000

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  const needVariants = searchParams.get('needVariants') === 'true'

  if (!url) {
    return NextResponse.json({ error: 'Missing required query param: url' }, { status: 400 })
  }

  // Lookups cost paid scraper credit — cap them per IP, and never fetch
  // private/internal addresses.
  if (await isRateLimited(request, 'product-lookup', 40, 10 * 60)) {
    return NextResponse.json(
      { error: 'You’re looking up links very quickly. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': '600' } },
    )
  }
  if (!(await isPublicHttpUrl(url))) {
    return NextResponse.json({ error: 'That link can’t be looked up.' }, { status: 400 })
  }

  // Internal QA testing traffic (app/demo/scraper-qa) sends this header
  // (see ScraperQaClient's attemptLookup). It is excluded from Scrape
  // health, AND it must never take the affiliated-seller shortcut below:
  // that shortcut returns `{ internalRedirect }`, which is an instruction
  // for the customer flow, not a scrape result — the QA page would render
  // it as an empty "Unknown site". QA exists to exercise the real scraper,
  // so an affiliated store's URL is scraped like any other.
  // SECURITY FIX: these flags used to be honoured for anyone, so any
  // visitor could skip the cache (and spend paid scraper credits) by adding
  // ?qa=true. They now only count for signed-in staff.
  //   qa=true / x-scrape-source: qa-tool — raw scraper test: fresh read, no
  //     affiliated-store redirect, no scrape-health record.
  //   fresh=1 — the scraper QA page (/demo/scraper-qa): EXACTLY the customer
  //     flow, only without the cache, so timing and results are real.
  const wantsQa = request.headers.get('x-scrape-source') === 'qa-tool' || searchParams.get('qa') === 'true'
  const wantsFresh = searchParams.get('fresh') === '1'
  const isStaff = wantsQa || wantsFresh ? (await requireStaffRole()).ok : false
  const isQaTraffic = wantsQa && isStaff
  const freshRead = isQaTraffic || (wantsFresh && isStaff)
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
  if (resolvedUrl !== url && !(await isPublicHttpUrl(resolvedUrl))) {
    return NextResponse.json({ error: 'That link can’t be looked up.' }, { status: 400 })
  }
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
  // `refresh=1` is the item screen asking for the live result after it was
  // shown an older copy (see `allowStale` in lib/scrape/result-cache.ts).
  const allowStale = !isQaTraffic && searchParams.get('refresh') !== '1'
  const stop = new AbortController()
  const onClientGone = () => stop.abort()
  if (request.signal.aborted) stop.abort()
  else request.signal.addEventListener('abort', onClientGone)
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<ScrapeResult>((resolve) => {
    deadlineTimer = setTimeout(() => {
      stop.abort()
      resolve({
        url: resolvedUrl,
        site: detectSite(resolvedUrl),
        error: `TIMEOUT: no answer from the store within ${Math.round(LOOKUP_DEADLINE_MS / 1000)}s`,
      })
    }, LOOKUP_DEADLINE_MS)
  })
  const scraped = await Promise.race([
    scrapeProduct(resolvedUrl, { needVariants, signal: stop.signal, fresh: freshRead, allowStale: allowStale && !freshRead }),
    deadline,
  ]).finally(() => {
    clearTimeout(deadlineTimer)
    request.signal.removeEventListener('abort', onClientGone)
  })

  // LAST RESORT: our own scraper timed out (60 s) or failed — ask the
  // universal scraper. It is ALSO asked when our read "worked" but was only
  // a generic Open-Graph-level one (an unrecognised store such as soch.com:
  // no confirmed price breakdown, "needs a manual check") — its price and
  // sizes/colours turn that into a normal priced listing. Skipped for staff
  // QA traffic (it must show what OUR scraper really does), when the client
  // already hung up, and for errors no other scraper can fix (bad link, a
  // store's own password wall).
  let result = scraped
  const failed = fallbackWorthTrying(scraped)
  // Say WHY the backup didn't run — otherwise a missing env var looks like
  // "the fallback does nothing".
  const wantsBackup = failed || isWeakRead(scraped)
  const isRetry = searchParams.get('retry') === '1'
  // Settings are read only now, when the backup might actually be used (one
  // in-process cached read; Redis at most every ~15 s).
  const backupReady = wantsBackup && !isQaTraffic && !request.signal.aborted && (await universalFallbackConfigured())
  if (failed && !isQaTraffic) {
    if (!backupReady && !request.signal.aborted) {
      console.warn('[product-lookup] universal fallback skipped: not set up or switched off (Super Admin > Integrations, or UNIVERSAL_SCRAPER_* env)')
    } else if (isRetry) {
      console.log('[product-lookup] universal fallback skipped: this is the silent retry (the first attempt already asked it)')
    }
  }
  if (backupReady && !isRetry) {
    const backup = await scrapeViaUniversalFallback(resolvedUrl, scraped.site ?? detectSite(resolvedUrl), { signal: request.signal })
    const priced = !backup.error && backup.price != null && Number(backup.price) > 0
    if (failed && !backup.error) {
      console.log(`[product-lookup] universal fallback OK site=${backup.site ?? 'unknown'} url=${resolvedUrl} (primary: ${scraped.error})`)
      result = backup
    } else if (failed) {
      console.error(`[product-lookup] universal fallback FAILED url=${resolvedUrl} — ${backup.error}`)
      // The backup's error stays in the server log only — this response goes
      // to the browser, which must learn nothing about the backup service.
      result = scraped
    } else if (priced) {
      console.log(`[product-lookup] universal fallback upgraded weak read site=${scraped.site} url=${resolvedUrl}`)
      result = mergeWeakRead(scraped, backup)
    }
    // Weak read + backup had nothing better: keep our own result untouched.
  }
  if (resolvedUrl !== url) result.resolvedFromShortlink = true
  // A cached copy is at most 1 h old, so it's fine to record too; an older
  // ("stale") copy isn't — the live read that follows will record.
  if (!result.stale) rememberPrice([url, resolvedUrl, result.url], result)

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

  // A cached copy isn't a new scrape attempt — don't count it in Scrape health.
  // Scrape health tracks real customer traffic only, not QA runs.
  if (!isQaTraffic && !freshRead && !result.cachedAt) {
    // Fire-and-forget: this is the one real call site the Scrape health
    // panel's fail_count/success_count depend on (see
    // scrape-health-write.ts's own header for the gap this closes) —
    // intentionally NOT awaited, so a slow or failing health-tracking
    // write can never add latency to, or break, the actual response the
    // customer is waiting on. On a success, also carries the real
    // title/image/price through so ops can see an actual example of what
    // this domain's product pages look like. On a FAILURE, carries the
    // full error text through instead.
    // Health tracks OUR scraper: a result rescued by the backup still counts
    // as a failure here, or a broken store would look healthy.
    upsertScrapeHealth(
      resolvedUrl,
      !scraped.error,
      {
        title: scraped.title,
        imageUrl: scraped.images?.[0],
        price: scraped.price,
      },
      scraped.error,
    )
  }

  return NextResponse.json(result)
}