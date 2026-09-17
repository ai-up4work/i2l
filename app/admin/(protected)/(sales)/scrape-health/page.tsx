// app/admin/(sales)/scrape-health/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Gauge,
  Globe,
  ImageIcon,
  Link2,
  Search,
  Store,
} from 'lucide-react'
import {
  MANUAL_REQUEST_THRESHOLD,
  STATUS_LABEL,
  STATUS_STYLE,
  daysAgo,
  isDomainFlagged,
  type DomainDecision,
  type DomainHealthRecord,
} from '@/data/scrape-health/data'
import {
  fetchDomainHealth,
  fetchSellerFeedHealth,
  updateDomainDecision,
  type SellerFeedHealth,
} from '@/lib/supabase/scrape-health-admin'

// ---------------------------------------------------------------------------
// Scrape / Extractor Health
//
// Purpose (per spec, §4 Channel 3 + §6 open items): every time a link fails
// to scrape and falls into the manual request form, we log the domain. This
// page turns that log into a prioritized backlog: which domains are costing
// ops the most manual work right now, and which of those have crossed the
// volume where it's worth building a real extractor or chasing an affiliate
// deal instead of continuing to handle them by hand.
//
// Two tabs, because "scrape health" genuinely means two different things
// depending on channel:
//   - Customer links (Channel 2 & 3): a shopper pastes a link, it can't be
//     auto-priced, it becomes manual work. Backlog/decision UX — this is
//     the page's original design, now fed by real data (see below).
//   - Store feeds (Channel 1): an ONBOARDED SELLER's own Shopify/WooCommerce
//     feed sync failing — a completely different failure mode (nothing to
//     do with a customer's pasted link) that needed its own, simpler UX
//     rather than being crammed into the same backlog table.
//
// DATA: real, as of this page's last rewrite —
//   - Customer links come straight from the `requests` table
//     (fetchDomainHealthFromRequests) — every unpriced/ogOnly link already
//     creates a real request row (see confirmRequest's unpriced branch in
//     DashboardContext.tsx), so grouping those by source_domain IS this
//     backlog, no separate event-logging pipeline needed.
//   - The real `scrape_health` table (fail_count/success_count/decision/
//     ops_note) overlays on top — see lib/supabase/scrape-health-admin.ts's
//     header comment for the full picture, including the one thing this
//     page can't fix on its own: sellers.feed_healthy/last_sync (Channel 1)
//     are real columns that nothing in this codebase writes yet, since
//     there's no automated feed-sync job — that tab reads them honestly,
//     which mostly means "never synced" until that job exists.
//
// DESIGN NOTES (this pass):
//   - The insight strip is no longer four identical cards. Three are plain
//     numbers (things you scan); the fourth — busiest domain — isn't a
//     number, so it's built as its own compact profile chip rather than
//     forcing a domain name into a metric-sized slot.
//   - Every card/pill/control in this page now shares one radius scale
//     (lg for inline controls, xl for surfaces, 2xl for empty states)
//     instead of drifting between ad-hoc values.
//   - The volume chart draws its own value at the end of each bar instead
//     of a separate right-aligned column, so the eye reads one row instead
//     of jumping between a bar and a number.
//   - Flagged rows are marked with a small dot *and* red, not color alone —
//     the red bar/red text carries meaning, so it's reserved for that.
//   - Tabs (page-level nav) use the teal-deep accent; status filter chips
//     (content-level filtering) use ink — same shape language, different
//     weight, so it stays clear which control changes what you're looking
//     at versus which page you're on.
// ---------------------------------------------------------------------------

type Tab = 'links' | 'feeds'
type StatusFilter = 'all' | 'flagged' | DomainDecision

function StatCard({
  icon,
  value,
  label,
  tone = 'default',
}: {
  icon: React.ReactNode
  value: React.ReactNode
  label: string
  tone?: 'default' | 'warn'
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3.5 ${
        tone === 'warn' ? 'border-red-600/20 bg-red-600/[0.04]' : 'border-ink/10 bg-card'
      }`}
    >
      <div className={`flex items-center gap-1.5 ${tone === 'warn' ? 'text-red-700/70' : 'text-ink/40'}`}>
        {icon}
        <p className="text-xs">{label}</p>
      </div>
      <p
        className={`mt-2 text-[26px] font-semibold leading-none tracking-tight tabular-nums ${
          tone === 'warn' ? 'text-red-700' : 'text-ink'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function SpotlightCard({ domain, requests }: { domain: string; requests: number }) {
  return (
    <div className="rounded-xl border border-teal-deep/20 bg-teal-deep/[0.05] px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-teal-deep/70">
        <Globe size={13} />
        <p className="text-xs">busiest domain</p>
      </div>
      <p className="mt-2 truncate font-mono text-base font-semibold leading-tight text-ink">
        {domain || '—'}
      </p>
      <p className="mt-0.5 text-xs text-ink/45">
        {requests ? `${requests} fallback requests, 30d` : 'no data yet'}
      </p>
    </div>
  )
}

function DecisionSelect({
  value,
  onChange,
  disabled,
  className = '',
}: {
  value: DomainDecision
  onChange: (v: DomainDecision) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as DomainDecision)}
        className="w-full appearance-none rounded-lg border border-ink/15 bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-ink outline-none transition-colors focus:border-teal focus:ring-2 focus:ring-teal/15 disabled:opacity-50"
      >
        <option value="not_started">Not started</option>
        <option value="extractor_in_progress">Build extractor</option>
        <option value="affiliate_pursued">Pursue affiliate</option>
        <option value="dismissed">Dismiss</option>
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/35" />
    </div>
  )
}

export default function ScrapeHealthPage() {
  const [tab, setTab] = useState<Tab>('links')
  const [domains, setDomains] = useState<DomainHealthRecord[]>([])
  const [sellers, setSellers] = useState<SellerFeedHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [savingDomain, setSavingDomain] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchDomainHealth(), fetchSellerFeedHealth()]).then(([d, s]) => {
      setDomains(d)
      setSellers(s)
      setLoading(false)
    })
  }, [])

  const isFlagged = isDomainFlagged

  // Optimistic local update + real write, same pattern as every other
  // admin mutator in this app (update UI immediately, persist for real
  // in the background) — but this one actually awaits and rolls back on
  // failure, since a silently-lost decision is exactly the bug this
  // whole rewrite exists to fix (see updateDomainDecision's doc comment
  // in lib/supabase/scrape-health-admin.ts).
  const updateDomain = async (domain: string, patch: Partial<Pick<DomainHealthRecord, 'decision' | 'opsNote'>>) => {
    const previous = domains.find((d) => d.domain === domain)
    setDomains((prev) => prev.map((d) => (d.domain === domain ? { ...d, ...patch } : d)))
    setSavingDomain(domain)
    const result = await updateDomainDecision(domain, patch)
    setSavingDomain(null)
    if (!result.ok && previous) {
      setDomains((prev) => prev.map((d) => (d.domain === domain ? previous : d)))
    }
  }

  const filtered = useMemo(() => {
    return domains
      .filter((d) => d.domain.toLowerCase().includes(search.trim().toLowerCase()))
      .filter((d) => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'flagged') return isFlagged(d)
        return d.decision === statusFilter
      })
      .sort((a, b) => b.requests30d - a.requests30d)
  }, [domains, search, statusFilter])

  const totalRequests30d = domains.reduce((sum, d) => sum + d.requests30d, 0)
  const flaggedCount = domains.filter(isFlagged).length
  const topDomains = domains.slice().sort((a, b) => b.requests30d - a.requests30d).slice(0, 6)
  const maxVolume = Math.max(...topDomains.map((d) => d.requests30d), 1)

  return (
    <div className="h-full overflow-y-auto bg-parchment/40">
      <div className="mx-auto max-w-8xl px-6 pb-20 pt-8 lg:px-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <header className="max-w-xl">
            <h1 className="font-display text-3xl text-ink">Scrape health</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">
              Links a customer pastes that can&rsquo;t be auto-priced, and an onboarded store&rsquo;s own
              product feed falling out of sync — two different failure modes, tracked separately.
            </p>
          </header>

          <div className="flex gap-1 rounded-full border border-ink/10 bg-card p-1 lg:flex-none">
            <button
              type="button"
              onClick={() => setTab('links')}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                tab === 'links' ? 'bg-teal-deep text-parchment' : 'text-ink/55 hover:text-ink/80'
              }`}
            >
              <Link2 size={14} /> Customer links
            </button>
            <button
              type="button"
              onClick={() => setTab('feeds')}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                tab === 'feeds' ? 'bg-teal-deep text-parchment' : 'text-ink/55 hover:text-ink/80'
              }`}
            >
              <Store size={14} /> Store feeds
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-ink/10 bg-card/60" />
            ))}
          </div>
        ) : tab === 'links' ? (
          <CustomerLinksTab
            domains={domains}
            filtered={filtered}
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            expanded={expanded}
            setExpanded={setExpanded}
            updateDomain={updateDomain}
            savingDomain={savingDomain}
            isFlagged={isFlagged}
            totalRequests30d={totalRequests30d}
            flaggedCount={flaggedCount}
            topDomains={topDomains}
            maxVolume={maxVolume}
          />
        ) : (
          <StoreFeedsTab sellers={sellers} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Channel 2 & 3 — Customer links backlog
// ---------------------------------------------------------------------------

function CustomerLinksTab({
  domains,
  filtered,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  expanded,
  setExpanded,
  updateDomain,
  savingDomain,
  isFlagged,
  totalRequests30d,
  flaggedCount,
  topDomains,
  maxVolume,
}: {
  domains: DomainHealthRecord[]
  filtered: DomainHealthRecord[]
  search: string
  setSearch: (v: string) => void
  statusFilter: StatusFilter
  setStatusFilter: (v: StatusFilter) => void
  expanded: string | null
  setExpanded: (v: string | null) => void
  updateDomain: (domain: string, patch: Partial<Pick<DomainHealthRecord, 'decision' | 'opsNote'>>) => void
  savingDomain: string | null
  isFlagged: (d: DomainHealthRecord) => boolean
  totalRequests30d: number
  flaggedCount: number
  topDomains: DomainHealthRecord[]
  maxVolume: number
}) {
  if (domains.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/15 bg-card px-4 py-16 text-center">
        <Link2 size={22} className="text-ink/25" />
        <p className="text-sm font-semibold text-ink/70">No unscrapable links logged yet</p>
        <p className="max-w-sm text-xs text-ink/45">
          This fills in the moment a customer's pasted link can't be auto-priced and becomes a Channel 3
          request — nothing to show until that happens for real.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Insight strip */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<Link2 size={13} />} value={domains.length} label="domains tracked" />
        <StatCard icon={<Gauge size={13} />} value={totalRequests30d} label="fallback requests, 30d" />
        <StatCard
          icon={<AlertTriangle size={13} />}
          value={flaggedCount}
          label="past threshold, no decision"
          tone={flaggedCount > 0 ? 'warn' : 'default'}
        />
        <SpotlightCard domain={topDomains[0]?.domain ?? ''} requests={topDomains[0]?.requests30d ?? 0} />
      </div>

      {/* Volume chart — where the backlog concentrates */}
      <div className="mt-6 rounded-xl border border-ink/10 bg-card p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold text-ink/50">Fallback requests by domain, last 30 days</p>
          <p className="text-xs text-ink/35">top {topDomains.length}</p>
        </div>
        <div className="mt-4 flex flex-col gap-2.5">
          {topDomains.map((d) => {
            const flagged = isFlagged(d)
            const pct = Math.max((d.requests30d / maxVolume) * 100, 4)
            return (
              <div key={d.domain} className="flex items-center gap-3">
                <span className="flex w-32 flex-none items-center gap-1.5 truncate font-mono text-xs text-ink/70 sm:w-40">
                  {flagged && <span className="h-1.5 w-1.5 flex-none rounded-full bg-red-500" aria-hidden />}
                  <span className="truncate">{d.domain}</span>
                </span>
                <div className="h-2 flex-1 rounded-full bg-ink/[0.06]">
                  <div
                    className={`flex h-full items-center justify-end rounded-full ${
                      flagged ? 'bg-red-500/75' : 'bg-teal-deep/55'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-7 flex-none text-right text-xs font-semibold tabular-nums text-ink/60">
                  {d.requests30d}
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-4 text-xs text-ink/40">
          Domains marked with a dot have crossed {MANUAL_REQUEST_THRESHOLD}/30d with no decision made yet.
        </p>
      </div>

      {/* Filters */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'flagged', 'not_started', 'extractor_in_progress', 'affiliate_pursued', 'dismissed'] as StatusFilter[]).map(
            (f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === f ? 'bg-ink text-white' : 'bg-ink/5 text-ink/60 hover:bg-ink/10'
                }`}
              >
                {f === 'all' ? 'All' : f === 'flagged' ? 'Flagged' : STATUS_LABEL[f]}
              </button>
            )
          )}
        </div>

        <div className="relative w-full sm:w-56">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search domain"
            className="w-full rounded-lg border border-ink/15 bg-white py-1.5 pl-8 pr-3 text-sm text-ink outline-none transition-colors focus:border-teal focus:ring-2 focus:ring-teal/15"
          />
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-ink/10 bg-card">
        <div className="hidden grid-cols-[1.6fr_0.9fr_0.9fr_0.9fr_1.3fr_1.6fr] gap-2 border-b border-ink/10 bg-ink/[0.02] px-4 py-2.5 text-xs font-semibold text-ink/45 sm:grid">
          <span>Domain</span>
          <span className="text-right">30 days</span>
          <span className="text-right">All time</span>
          <span>Last seen</span>
          <span>Status</span>
          <span>Decision</span>
        </div>

        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink/45">No domains match this filter.</p>
        )}

        {filtered.map((d) => {
          const flagged = isFlagged(d)
          const open = expanded === d.domain
          const saving = savingDomain === d.domain
          return (
            <div key={d.domain} className="border-b border-ink/10 last:border-b-0">
              <div className="grid grid-cols-2 items-center gap-2 px-4 py-3 transition-colors hover:bg-ink/[0.02] sm:grid-cols-[1.6fr_0.9fr_0.9fr_0.9fr_1.3fr_1.6fr]">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : d.domain)}
                  className="col-span-2 flex items-center gap-1.5 text-left font-mono text-sm text-ink sm:col-span-1"
                >
                  <ChevronDown
                    size={14}
                    className={`flex-none text-ink/40 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                  <span className="truncate">{d.domain}</span>
                  {flagged && (
                    <span className="ml-1 flex-none rounded-full bg-red-600/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                      Flagged
                    </span>
                  )}
                </button>

                <span className="text-right text-sm tabular-nums text-ink/70">{d.requests30d}</span>
                <span className="hidden text-right text-sm tabular-nums text-ink/50 sm:block">{d.requestsAllTime}</span>
                <span className="hidden text-xs text-ink/50 sm:block">{daysAgo(d.lastSeen)}</span>

                <span className="hidden sm:block">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[d.decision]}`}>
                    {STATUS_LABEL[d.decision]}
                  </span>
                </span>

                <DecisionSelect
                  value={d.decision}
                  disabled={saving}
                  onChange={(v) => updateDomain(d.domain, { decision: v })}
                  className="hidden sm:block"
                />

                {/* Mobile: status + decision stacked under domain row */}
                <div className="col-span-2 flex items-center gap-2 sm:hidden">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[d.decision]}`}>
                    {STATUS_LABEL[d.decision]}
                  </span>
                  <DecisionSelect
                    value={d.decision}
                    disabled={saving}
                    onChange={(v) => updateDomain(d.domain, { decision: v })}
                    className="ml-auto w-40"
                  />
                </div>
              </div>

              {open && (
                <div className="border-t border-ink/10 bg-parchment/50 px-4 py-4">
                  {(d.failCount != null || d.successCount != null) && (
                    <div className="mb-4 flex items-center gap-4 rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-xs text-ink/50">
                      <span>
                        <span className="font-semibold tabular-nums text-ink/70">{d.successCount ?? 0}</span> succeeded
                      </span>
                      <span className="h-3 w-px bg-ink/10" />
                      <span>
                        <span className="font-semibold tabular-nums text-ink/70">{d.failCount ?? 0}</span> failed
                      </span>
                      <span className="ml-auto hidden text-ink/40 sm:inline">
                        Pipeline attempts — distinct from requests above; a "succeeded" attempt can still be
                        ogOnly/unpriced and become a request.
                      </span>
                    </div>
                  )}
                  <label className="text-xs font-semibold text-ink/50">Ops note</label>
                  <textarea
                    value={d.opsNote}
                    onChange={(e) => updateDomain(d.domain, { opsNote: e.target.value })}
                    disabled={saving}
                    placeholder="Why this decision, who to follow up with, what's blocking it..."
                    rows={2}
                    className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-teal focus:ring-2 focus:ring-teal/15 disabled:opacity-60"
                  />

                  {d.submissions.length > 0 && (
                    <>
                      <p className="mt-4 text-xs font-semibold text-ink/50">
                        Recent fallback submissions ({d.submissions.length})
                      </p>
                      <div className="mt-2 flex flex-col gap-2">
                        {d.submissions.map((s) => (
                          <div
                            key={s.id}
                            className="flex items-start justify-between gap-3 rounded-lg border border-ink/10 bg-card px-3 py-2.5 transition-colors hover:border-ink/20"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-xs text-ink/45">
                                <span className="font-semibold text-ink/60">{s.customerInitials}</span>
                                <span>{daysAgo(s.submittedAt)}</span>
                                {s.hasScreenshot && (
                                  <span className="flex items-center gap-1">
                                    <ImageIcon size={11} /> screenshot
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 truncate text-sm text-ink/80">{s.note}</p>
                            </div>
                            <a
                              href={s.link}
                              target="_blank"
                              rel="noreferrer"
                              className="flex flex-none items-center gap-1 text-xs font-semibold text-teal-deep hover:underline"
                            >
                              Link <ExternalLink size={11} />
                            </a>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Channel 1 — Store feeds
//
// Deliberately a different, simpler shape than the backlog table above
// — there's no "decision" to make here (you can't "dismiss" a seller's
// broken feed the way you'd dismiss a one-off scrape domain), just a
// health status per store to notice and go fix. Sorted unhealthy/never-
// synced first, since that's what someone opening this tab needs to see
// immediately.
// ---------------------------------------------------------------------------

function StoreFeedsTab({ sellers }: { sellers: SellerFeedHealth[] }) {
  const sorted = useMemo(() => {
    return sellers.slice().sort((a, b) => {
      const rank = (s: SellerFeedHealth) => (s.feedHealthy === false ? 0 : s.feedHealthy == null ? 1 : 2)
      return rank(a) - rank(b)
    })
  }, [sellers])

  if (sellers.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/15 bg-card px-4 py-16 text-center">
        <Store size={22} className="text-ink/25" />
        <p className="text-sm font-semibold text-ink/70">No feed-integrated stores yet</p>
        <p className="max-w-sm text-xs text-ink/45">
          Only affiliated stores with a Shopify/WooCommerce provider configured show up here —
          manually-managed catalogues have nothing to sync.
        </p>
      </div>
    )
  }

  const unhealthyCount = sellers.filter((s) => s.feedHealthy === false).length
  const neverSyncedCount = sellers.filter((s) => s.lastSync == null).length

  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={<Store size={13} />} value={sellers.length} label="feed-integrated stores" />
        <StatCard
          icon={<AlertTriangle size={13} />}
          value={unhealthyCount}
          label="feed reporting unhealthy"
          tone={unhealthyCount > 0 ? 'warn' : 'default'}
        />
        <StatCard icon={<Gauge size={13} />} value={neverSyncedCount} label="never synced" />
      </div>

      {neverSyncedCount > 0 && (
        <p className="mt-4 text-xs text-ink/40">
          "Never synced" is expected right now for most stores — there's no automated feed-sync job wired
          up yet to populate this, so it reads honestly as unknown rather than guessing.
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-ink/10 bg-card">
        <div className="hidden grid-cols-[1.8fr_1fr_1fr_1.2fr] gap-2 border-b border-ink/10 bg-ink/[0.02] px-4 py-2.5 text-xs font-semibold text-ink/45 sm:grid">
          <span>Store</span>
          <span>Provider</span>
          <span>Feed status</span>
          <span>Last synced</span>
        </div>

        {sorted.map((s) => (
          <div
            key={s.id}
            className="grid grid-cols-2 items-center gap-2 border-b border-ink/10 px-4 py-3 transition-colors last:border-b-0 hover:bg-ink/[0.02] sm:grid-cols-[1.8fr_1fr_1fr_1.2fr]"
          >
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
              <p className="truncate font-mono text-xs text-ink/40">{s.platformSlug}</p>
            </div>
            <span className="hidden text-sm text-ink/60 sm:block">{s.providerType ?? '—'}</span>
            <span className="hidden sm:block">
              <FeedStatusPill feedHealthy={s.feedHealthy} />
            </span>
            <span className="hidden text-xs text-ink/50 sm:block">
              {s.lastSync ? daysAgo(s.lastSync) : 'Never'}
            </span>

            {/* Mobile: status + last-sync stacked under store name */}
            <div className="col-span-2 flex items-center gap-2 sm:hidden">
              <FeedStatusPill feedHealthy={s.feedHealthy} />
              <span className="ml-auto text-xs text-ink/50">{s.lastSync ? daysAgo(s.lastSync) : 'Never synced'}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function FeedStatusPill({ feedHealthy }: { feedHealthy: boolean | null }) {
  if (feedHealthy === true) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Healthy
      </span>
    )
  }
  if (feedHealthy === false) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/10 px-2.5 py-1 text-xs font-semibold text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
        Unhealthy
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold text-ink/45">
      <span className="h-1.5 w-1.5 rounded-full bg-ink/25" aria-hidden />
      Unknown
    </span>
  )
}