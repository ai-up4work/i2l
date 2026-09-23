// lib/supabase/scrape-health-admin.ts
//
// Real data behind /admin/scrape-health — previously the whole page ran
// on a hardcoded mock array (data/scrape-health/data.ts's
// INITIAL_DOMAINS) despite a real `scrape_health` table already
// existing in the schema. This file connects it, across all three
// channels:
//
//   - Channel 2 & 3 (customer-pasted links): every link that couldn't
//     be auto-priced already creates a real `requests` row (see
//     confirmRequest's unpriced branch in DashboardContext.tsx) — that
//     IS this page's core data source, no new instrumentation needed.
//     A link that scraped fine never creates a request at all, so
//     "requests grouped by source_domain" already means exactly what
//     this page has always wanted to show: which domains are costing
//     ops the most manual work.
//   - Channel 1 (affiliated store feeds): a completely different kind
//     of "scrape health" — not a customer's pasted link failing, but an
//     onboarded seller's own Shopify/WooCommerce feed sync failing.
//     Reads sellers.feed_healthy/last_sync directly. Worth knowing
//     going in: nothing in this codebase currently WRITES those columns
//     either (no automated feed-sync job exists yet) — so this reads
//     real columns, honestly, but most sellers will show "never
//     synced" until that job exists. Not faked here.
//   - The `scrape_health` table itself (fail_count/success_count/
//     last_failure/decision/ops_note) is what makes ops' decisions
//     (build extractor / pursue affiliate / dismiss) persist for real
//     instead of resetting on every reload — see
//     data/wishdrop-scrape-health-decision-columns.sql, which this file
//     assumes has been run. upsertScrapeHealth (lib/supabase/
//     scrape-health-write.ts) is the hook called from the actual scrape
//     pipeline (/api/product-lookup) so fail_count/success_count now
//     reflect every real attempt, not just ones that gave up and became
//     a request.

import { createClient } from '@/lib/supabase/client'

export type DomainDecision = 'not_started' | 'extractor_in_progress' | 'affiliate_pursued' | 'dismissed'

export type FallbackSubmission = {
  id: string
  submittedAt: string
  customerInitials: string
  note: string
  link: string
  hasScreenshot: boolean
}

export type DomainHealthRecord = {
  domain: string
  requests30d: number
  requestsAllTime: number
  lastSeen: string
  decision: DomainDecision
  opsNote: string
  submissions: FallbackSubmission[]
  /** Real counters from scrape_health (see upsertScrapeHealth in scrape-health-write.ts, now wired into /api/product-lookup) — null only until this domain's first real scrape attempt since instrumentation went live. Distinct from requests30d/AllTime, which count only the attempts that gave up and became a manual request; these count every attempt, successful or not. */
  failCount: number | null
  successCount: number | null
  /** A real example of a successful scrape from this domain — see
   * wishdrop-scrape-health-success-sample.sql. All null until this
   * domain has had at least one real success since instrumentation. */
  lastSuccessTitle: string | null
  lastSuccessImageUrl: string | null
  lastSuccessPrice: string | null
  lastSuccessAt: string | null
  /** scrapeProduct()'s own full diagnostic text for the most recent
   * FAILURE on this domain — see wishdrop-scrape-health-last-error.sql.
   * This is the detail the customer never sees (BLOCKED vs JS_SHELL vs
   * a specific HTTP status, which fallback tier was tried and how, ...),
   * made visible here specifically so "why is this domain failing" is
   * answerable from this page alone. Null until this domain has had at
   * least one real failure since instrumentation; a later success
   * doesn't clear a previously-recorded error — see that file's own
   * comment on why (ops still wants to know what a flaky domain's last
   * real failure looked like, not just that it eventually worked). */
  lastError: string | null
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Channel 2 & 3's real domain-health backlog, built entirely from the
 * `requests` table — see this file's header comment for why that's a
 * complete, honest picture with zero new instrumentation. Grouped
 * client-side rather than via a SQL aggregate: request volume per
 * domain is small enough (this is a manual-work backlog, not raw
 * traffic) that fetching every row and grouping in JS is simpler than a
 * second RPC/view, and keeps the per-submission detail (note,
 * screenshot, customer) available for the same query.
 */
export async function fetchDomainHealthFromRequests(): Promise<DomainHealthRecord[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('requests')
    .select('id, user_id, link, note, screenshot_url, source_domain, submitted_at')
    .order('submitted_at', { ascending: false })
  if (error) {
    console.error('[fetchDomainHealthFromRequests]', error)
    return []
  }
  const rows = data ?? []
  if (!rows.length) return []

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
  const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const byDomain = new Map<string, DomainHealthRecord>()

  for (const r of rows) {
    const domain = r.source_domain
    const existing = byDomain.get(domain)
    const submittedMs = new Date(r.submitted_at).getTime()
    const is30d = submittedMs >= thirtyDaysAgo
    const fullName = nameByUserId.get(r.user_id) ?? 'Unknown'

    const submission: FallbackSubmission = {
      id: r.id,
      submittedAt: r.submitted_at,
      customerInitials: initialsFromName(fullName),
      note: r.note ?? '',
      link: r.link,
      hasScreenshot: !!r.screenshot_url,
    }

    if (existing) {
      existing.requestsAllTime += 1
      if (is30d) existing.requests30d += 1
      // Rows are already ordered newest-first, so the first one seen
      // per domain is the most recent — lastSeen never needs updating
      // after that, and submissions (capped) only take the newest few.
      if (existing.submissions.length < 8) existing.submissions.push(submission)
    } else {
      byDomain.set(domain, {
        domain,
        requests30d: is30d ? 1 : 0,
        requestsAllTime: 1,
        lastSeen: r.submitted_at,
        decision: 'not_started',
        opsNote: '',
        submissions: [submission],
        failCount: null,
        successCount: null,
        lastSuccessTitle: null,
        lastSuccessImageUrl: null,
        lastSuccessPrice: null,
        lastSuccessAt: null,
        lastError: null,
      })
    }
  }

  return [...byDomain.values()]
}

/**
 * Overlays real scrape_health rows (decision, ops_note, and the real
 * attempt counters — see upsertScrapeHealth) onto the requests-derived
 * backlog above. A domain can appear in ONE, the OTHER, or BOTH: a
 * domain ops already made a decision on but that hasn't produced a
 * fresh manual request in a while still needs its decision to show;
 * a domain the scrape pipeline has logged attempts against but that
 * hasn't happened to be searched here yet still needs its counters to
 * show. Merged by domain, not assumed to be the same set.
 */
export async function fetchDomainHealth(): Promise<DomainHealthRecord[]> {
  const supabase = createClient()
  const [fromRequests, { data: healthRows, error }] = await Promise.all([
    fetchDomainHealthFromRequests(),
    supabase
      .from('scrape_health')
      .select(
        'domain, fail_count, success_count, last_failure, decision, ops_note, last_success_title, last_success_image_url, last_success_price, last_success_at, last_error',
      ),
  ])
  if (error) console.error('[fetchDomainHealth] scrape_health read failed', error)

  const byDomain = new Map(fromRequests.map((d) => [d.domain, d]))

  for (const h of healthRows ?? []) {
    const existing = byDomain.get(h.domain)
    if (existing) {
      existing.decision = (h.decision as DomainDecision) ?? 'not_started'
      existing.opsNote = h.ops_note ?? ''
      existing.failCount = h.fail_count
      existing.successCount = h.success_count
      existing.lastSuccessTitle = h.last_success_title
      existing.lastSuccessImageUrl = h.last_success_image_url
      existing.lastSuccessPrice = h.last_success_price
      existing.lastSuccessAt = h.last_success_at
      existing.lastError = h.last_error
    } else {
      byDomain.set(h.domain, {
        domain: h.domain,
        requests30d: 0,
        requestsAllTime: 0,
        lastSeen: h.last_failure ?? new Date(0).toISOString(),
        decision: (h.decision as DomainDecision) ?? 'not_started',
        opsNote: h.ops_note ?? '',
        submissions: [],
        failCount: h.fail_count,
        successCount: h.success_count,
        lastSuccessTitle: h.last_success_title,
        lastSuccessImageUrl: h.last_success_image_url,
        lastSuccessPrice: h.last_success_price,
        lastSuccessAt: h.last_success_at,
        lastError: h.last_error,
      })
    }
  }

  return [...byDomain.values()].sort((a, b) => b.requests30d - a.requests30d)
}

/**
 * Persists ops' decision/note for real — see this file's header
 * comment for why this was the whole missing piece. Upserts rather
 * than requiring an existing row: a domain ops decides on before the
 * scrape pipeline has ever logged an attempt against it (e.g. deciding
 * proactively from a support conversation) still needs somewhere to
 * land.
 */
export async function updateDomainDecision(
  domain: string,
  patch: { decision?: DomainDecision; opsNote?: string }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  // Built as a concretely-typed variable rather than two inline
  // conditional spreads — see orders-admin.ts's reassignOrderSite for
  // why that form collapses Supabase's generic Update<T>/Insert<T>
  // field types to `never`; same shape here since this is an upsert.
  const payload: { domain: string; decision?: DomainDecision; ops_note?: string } = { domain }
  if (patch.decision !== undefined) payload.decision = patch.decision
  if (patch.opsNote !== undefined) payload.ops_note = patch.opsNote
  const { error } = await supabase.from('scrape_health').upsert(payload, { onConflict: 'domain' })
  return error ? { ok: false, error: error.message } : { ok: true }
}

// ---------------------------------------------------------------------
// upsertScrapeHealth lives in a SEPARATE file
// (lib/supabase/scrape-health-write.ts) — this file is imported into
// the 'use client' admin page (fetchDomainHealth, updateDomainDecision,
// fetchSellerFeedHealth all run in the browser), while the write needs
// the service-role client (server-only, must never reach a client
// bundle — see that file's own doc comment for why) since it's called
// from the /api/product-lookup route handler on behalf of ANY visitor,
// not an authenticated admin session, and scrape_health has no user_id
// to scope an "own row" RLS policy against in the first place.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Channel 1 — affiliated store feed health
// ---------------------------------------------------------------------

export type SellerFeedHealth = {
  id: string
  name: string
  platformSlug: string
  providerType: string | null
  status: string
  feedHealthy: boolean | null
  lastSync: string | null
}

/**
 * Real seller feed status — sellers.feed_healthy/last_sync are real
 * columns, read here honestly. Worth knowing: nothing in this codebase
 * currently writes them either (no automated sync job exists yet), so
 * most feed-integrated sellers will show "never synced" until that job
 * is built — this isn't faked to look more populated than it is. Only
 * feed-integrated sellers (provider_type set) are relevant here —
 * manual-catalogue sellers have nothing to "sync" in the first place.
 */
export async function fetchSellerFeedHealth(): Promise<SellerFeedHealth[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('sellers')
    .select('id, name, platform_slug, provider_type, status, feed_healthy, last_sync')
    .not('provider_type', 'is', null)
    .order('name', { ascending: true })
  if (error) {
    console.error('[fetchSellerFeedHealth]', error)
    return []
  }
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    platformSlug: s.platform_slug,
    providerType: s.provider_type,
    status: s.status,
    feedHealthy: s.feed_healthy,
    lastSync: s.last_sync,
  }))
}