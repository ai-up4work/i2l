// lib/supabase/scrape-health-write.ts
//
// SERVER-ONLY. Never import this into a 'use client' file — it uses the
// service-role client (see lib/supabase/server.ts's own doc comment on
// createServiceRoleClient), because this is called from
// /api/product-lookup on behalf of ANY visitor — not an authenticated
// admin session — and scrape_health has no user_id to scope an "own
// row" RLS policy against in the first place (it's cross-customer,
// domain-level operational data, not anyone's own data).
//
// This is the missing half of scrape-health-admin.ts's own story: that
// file's header comment already documented the intent ("upsertScrapeHealth
// is also the hook meant to be called from the scrape pipeline") and
// even named this exact file — but it was never actually written, so
// every domain's real fail_count/success_count has sat at zero this
// whole time regardless of how many scrapes actually ran against it.
// See data/wishdrop-scrape-health-increment-fn.sql for why the actual
// increment happens inside a single atomic SQL statement (an RPC call)
// rather than a plain client-side upsert with a JS-computed "+1", which
// would lose counts under concurrent requests against the same domain.

import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * Same hostname normalization as DashboardContext.tsx's sourceDomainFor
 * — kept identical on purpose so scrape_health.domain values line up
 * with requests.source_domain for the same site, rather than two
 * subtly different domain strings (one with "www.", one without) never
 * matching each other when this page eventually cross-references them.
 */
function domainFor(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

/**
 * Records one real scrape attempt's outcome for `url`'s domain. Called
 * from /api/product-lookup after every scrapeProduct() call — success
 * defined the same way the client already does (hooks/useProductLookup.ts:
 * `!data.error`), so "success" here means exactly what it means there.
 *
 * `sample` is only meaningful (and only ever written) on a real
 * success — see wishdrop-scrape-health-success-sample.sql for why this
 * exists: a bare count told ops a domain scrapes fine, but never showed
 * what actually came back. A sample field left undefined doesn't erase
 * a previously-recorded one (see the RPC's own comment on why), so a
 * success that couldn't extract every field still doesn't blank out an
 * otherwise-good example.
 *
 * `error`, symmetrically, is only meaningful (and only ever written) on
 * a real FAILURE — see wishdrop-scrape-health-last-error.sql. This is
 * scrapeProduct()'s own full diagnostic string (BLOCKED/JS_SHELL/a
 * specific HTTP status, which fallback tier was tried and how, vendor-
 * fingerprinted block-page markers, ...) — the same detail the customer
 * deliberately never sees (see useProductLookup.ts's own comment on
 * why), made durable here specifically so *someone* can still see it,
 * on the Scrape Health admin page, without needing to catch it in
 * server logs at the exact moment it happened.
 *
 * Fire-and-forget by design: the caller should not `await` this inline
 * in the critical path of returning a scrape result to the customer —
 * see this function's call site in product-lookup/route.ts for the
 * "don't let a health-tracking failure or slowdown affect the actual
 * product lookup" pattern. Failures here are logged, never thrown.
 */
export async function upsertScrapeHealth(
  url: string,
  success: boolean,
  sample?: { title?: string | null; imageUrl?: string | null; price?: string | null },
  error?: string | null,
): Promise<void> {
  const domain = domainFor(url)
  if (domain === 'unknown') return // nothing meaningful to attribute this attempt to

  try {
    const supabase = createServiceRoleClient()
    const { error: rpcError } = await supabase.rpc('increment_scrape_health', {
      p_domain: domain,
      p_success: success,
      p_title: sample?.title ?? undefined,
      p_image_url: sample?.imageUrl ?? undefined,
      p_price: sample?.price ?? undefined,
      p_error: error ?? undefined,
    })
    if (rpcError) console.error('[upsertScrapeHealth]', domain, rpcError)
  } catch (err) {
    console.error('[upsertScrapeHealth] threw', domain, err)
  }
}