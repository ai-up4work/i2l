// app/admin/(sales)/scrape-health/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  ImageIcon,
  Inbox,
  Link2,
  Search,
  SearchX,
  Store,
} from "lucide-react"

import {
  MANUAL_REQUEST_THRESHOLD,
  STATUS_LABEL,
  STATUS_STYLE,
  daysAgo,
  isDomainFlagged,
  type DomainDecision,
  type DomainHealthRecord,
} from "@/data/scrape-health/data"
import {
  fetchDomainHealth,
  fetchSellerFeedHealth,
  updateDomainDecision,
  type SellerFeedHealth,
} from "@/lib/supabase/scrape-health-admin"

// Scrape health: two different failure modes, one tab each.
//
//   Customer links (Channel 2 and 3): a shopper pastes a link, it can't be
//   auto-priced, it becomes a manual request. The log of those domains is a
//   prioritised backlog: which domains cost ops the most manual work, and which
//   have crossed the volume where a real extractor or an affiliate deal beats
//   handling them by hand. Fed by the `requests` table grouped by
//   source_domain, with the `scrape_health` table (fail_count, success_count,
//   decision, ops_note) overlaid.
//
//   Store feeds (Channel 1): an onboarded seller's own Shopify or WooCommerce
//   feed failing to sync. Nothing to decide, just a status to notice and go
//   fix. sellers.feed_healthy and last_sync are real columns that nothing
//   writes yet (no automated sync job), so "Never synced" is expected for now.
//
// Same list recipe as the other admin pages. Flagged domains and unhealthy
// feeds get the red left edge; everything else stays quiet. The page-level
// tabs and the decision filter are the same segmented control, separated by the
// volume chart so it stays clear which one changes the page and which one
// changes the list.

type Tab = "links" | "feeds"
type StatusFilter = "all" | "flagged" | DomainDecision

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "flagged", label: "Flagged" },
  { key: "not_started", label: STATUS_LABEL.not_started },
  { key: "extractor_in_progress", label: STATUS_LABEL.extractor_in_progress },
  { key: "affiliate_pursued", label: STATUS_LABEL.affiliate_pursued },
  { key: "dismissed", label: STATUS_LABEL.dismissed },
]

const inFilter = (d: DomainHealthRecord, f: StatusFilter) =>
  f === "all" ? true : f === "flagged" ? isDomainFlagged(d) : d.decision === f

const PILL = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold"
const ROSE_PILL = "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
const PANEL = "overflow-clip rounded-2xl border border-ink/10 bg-card"
const HEAD =
  "sticky top-0 z-10 hidden items-center gap-3 border-b border-ink/10 bg-parchment/80 px-5 py-3 text-xs font-medium text-ink/50 backdrop-blur sm:grid"
const STATE_SHELL = "flex flex-col items-center gap-3 px-4 py-16 text-center"
const LINK_BUTTON = "text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
const FIELD =
  "rounded-lg border border-ink/10 bg-card text-ink outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15 disabled:opacity-50"

const LINKS_GRID =
  "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,1.5fr)]"
const FEEDS_GRID = "sm:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]"

type Patch = Partial<Pick<DomainHealthRecord, "decision" | "opsNote">>

export default function ScrapeHealthPage() {
  const [tab, setTab] = useState<Tab>("links")
  const [domains, setDomains] = useState<DomainHealthRecord[]>([])
  const [sellers, setSellers] = useState<SellerFeedHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [savingDomain, setSavingDomain] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    Promise.all([fetchDomainHealth(), fetchSellerFeedHealth()])
      .then(([d, s]) => {
        if (cancelled) return
        setDomains(d)
        setSellers(s)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load scrape health")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // Optimistic local update plus a real write. It awaits and rolls back on
  // failure, since a silently lost decision is exactly the bug the move off
  // mock data exists to fix (see updateDomainDecision).
  const updateDomain = async (domain: string, patch: Patch) => {
    const previous = domains.find((d) => d.domain === domain)
    setDomains((prev) => prev.map((d) => (d.domain === domain ? { ...d, ...patch } : d)))
    setSavingDomain(domain)
    const result = await updateDomainDecision(domain, patch)
    setSavingDomain(null)
    if (!result.ok && previous) {
      setDomains((prev) => prev.map((d) => (d.domain === domain ? previous : d)))
    }
  }

  const settled = !loading && !loadError
  const totalRequests30d = domains.reduce((sum, d) => sum + d.requests30d, 0)
  const flaggedCount = domains.filter(isDomainFlagged).length
  const unhealthyCount = sellers.filter((s) => s.feedHealthy === false).length
  const neverSyncedCount = sellers.filter((s) => s.lastSync == null).length

  const stats: { label: string; value: number; warn?: boolean; hint?: string }[] =
    tab === "links"
      ? [
          { label: "Domains tracked", value: domains.length },
          { label: "Fallback requests, 30d", value: totalRequests30d },
          {
            label: "Past threshold",
            value: flaggedCount,
            warn: flaggedCount > 0,
            hint: "Crossed the volume threshold with no decision yet",
          },
        ]
      : [
          { label: "Feed-integrated stores", value: sellers.length },
          { label: "Unhealthy", value: unhealthyCount, warn: unhealthyCount > 0 },
          { label: "Never synced", value: neverSyncedCount },
        ]

  const TABS: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "links", label: "Customer links", icon: <Link2 size={13} aria-hidden />, count: domains.length },
    { key: "feeds", label: "Store feeds", icon: <Store size={13} aria-hidden />, count: sellers.length },
  ]

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <Activity size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Scrape health</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Customer links that couldn&rsquo;t be auto-priced, and store feeds that fell out of sync. Two failure
                modes, tracked separately.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            {stats.map((s) => (
              <div key={s.label} className="px-5 py-3" title={s.hint}>
                <dt className="whitespace-nowrap text-xs font-medium text-ink/45">{s.label}</dt>
                <dd className={`mt-0.5 font-display text-xl ${settled && s.warn ? "text-rose-700" : "text-ink"}`}>
                  {settled ? s.value : "\u2014"}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── Page tabs ── */}
        <div className="mt-9">
          <div role="tablist" aria-label="Scrape health view" className="inline-flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
                  tab === t.key ? "bg-teal-deep text-parchment" : "text-ink/55 hover:text-ink/80"
                }`}
              >
                {t.icon}
                {t.label}
                {settled && <span className={tab === t.key ? "text-parchment/70" : "text-ink/35"}>{t.count}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Both tabs stay mounted so search, filter and expanded rows survive a tab switch. */}
        {loading ? (
          <div className={`mt-4 ${PANEL}`} aria-busy>
            {[1, 2, 3].map((i) => (
              <div key={i} className="border-b border-ink/[0.06] px-5 py-4 last:border-b-0">
                <div className="h-4 w-48 animate-pulse rounded bg-ink/10" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className={`mt-4 ${PANEL}`}>
            <div className={STATE_SHELL}>
              <div>
                <p className="text-sm font-semibold text-rose-700">{loadError}</p>
                <p className="mt-1 text-xs text-ink/50">Scrape health couldn&rsquo;t be loaded.</p>
              </div>
              <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={LINK_BUTTON}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            <div hidden={tab !== "links"}>
              <CustomerLinksTab domains={domains} updateDomain={updateDomain} savingDomain={savingDomain} />
            </div>
            <div hidden={tab !== "feeds"}>
              <StoreFeedsTab sellers={sellers} neverSyncedCount={neverSyncedCount} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Channel 2 and 3: customer links backlog
// ---------------------------------------------------------------------------

function CustomerLinksTab({
  domains,
  updateDomain,
  savingDomain,
}: {
  domains: DomainHealthRecord[]
  updateDomain: (domain: string, patch: Patch) => void
  savingDomain: string | null
}) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [expanded, setExpanded] = useState<string | null>(null)

  // Search scopes everything, including the filter counts, so a count always
  // matches what the filter would show.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? domains.filter((d) => d.domain.toLowerCase().includes(q)) : domains
  }, [domains, search])

  const counts = useMemo(() => {
    const base = {} as Record<StatusFilter, number>
    for (const f of STATUS_FILTERS) base[f.key] = searched.filter((d) => inFilter(d, f.key)).length
    return base
  }, [searched])

  const filtered = useMemo(
    () => searched.filter((d) => inFilter(d, statusFilter)).sort((a, b) => b.requests30d - a.requests30d),
    [searched, statusFilter],
  )

  const topDomains = useMemo(() => domains.slice().sort((a, b) => b.requests30d - a.requests30d).slice(0, 6), [domains])
  const maxVolume = Math.max(...topDomains.map((d) => d.requests30d), 1)
  const hasSearch = search.trim() !== ""

  if (domains.length === 0) {
    return (
      <div className={`mt-4 ${PANEL}`}>
        <div className={STATE_SHELL}>
          <Link2 size={22} className="text-ink/25" />
          <div>
            <p className="text-sm font-semibold text-ink/70">No unscrapable links logged yet</p>
            <p className="mt-1 max-w-sm text-xs text-ink/50">
              This fills in the moment a customer&rsquo;s pasted link can&rsquo;t be auto-priced and becomes a Channel 3
              request.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Volume chart: where the backlog concentrates. Each bar carries its own value. */}
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium text-ink/50">Fallback requests by domain, last 30 days</p>
          <p className="text-xs text-ink/40">Top {topDomains.length}</p>
        </div>
        <div className="mt-4 flex flex-col gap-2.5">
          {topDomains.map((d) => {
            const flagged = isDomainFlagged(d)
            const pct = Math.max((d.requests30d / maxVolume) * 100, 4)
            return (
              <div key={d.domain} className="flex items-center gap-3">
                <span className="flex w-32 flex-none items-center gap-1.5 font-mono text-xs text-ink/70 sm:w-44">
                  {flagged && <span className="h-1.5 w-1.5 flex-none rounded-full bg-rose-500" aria-hidden />}
                  <span className="truncate">{d.domain}</span>
                </span>
                <div className="h-2 flex-1 rounded-full bg-ink/[0.06]" aria-hidden>
                  <div
                    className={`h-full rounded-full ${flagged ? "bg-rose-500/75" : "bg-teal-deep/55"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 flex-none text-right text-xs font-semibold tabular-nums text-ink/60">
                  {d.requests30d}
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-4 text-xs text-ink/45">
          Domains marked with a dot have crossed {MANUAL_REQUEST_THRESHOLD}/30d with no decision yet.
        </p>
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Filter by decision" className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={statusFilter === f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
                statusFilter === f.key ? "bg-teal-deep text-parchment" : "text-ink/55 hover:text-ink/80"
              }`}
            >
              {f.label}
              <span className={statusFilter === f.key ? "text-parchment/70" : "text-ink/35"}>{counts[f.key]}</span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search domain"
            aria-label="Search domain"
            className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
          />
        </div>
      </div>

      <p className="mt-4 text-xs text-ink/45">
        {filtered.length} of {domains.length} domains shown
        {hasSearch && (
          <button type="button" onClick={() => setSearch("")} className={`ml-2 ${LINK_BUTTON}`}>
            Clear search
          </button>
        )}
      </p>

      {/* ── List ── */}
      <div className={`mt-3 ${PANEL}`}>
        <div className={`${HEAD} ${LINKS_GRID}`}>
          <span>Domain</span>
          <span className="text-right">30 days</span>
          <span className="text-right">All time</span>
          <span>Last seen</span>
          <span>Status</span>
          <span>Decision</span>
        </div>

        {filtered.length === 0 ? (
          hasSearch ? (
            <div className={STATE_SHELL}>
              <SearchX size={22} className="text-ink/25" />
              <div>
                <p className="text-sm font-semibold text-ink/70">No domains match this search</p>
                <p className="mt-1 text-xs text-ink/50">Check the domain name.</p>
              </div>
              <button type="button" onClick={() => setSearch("")} className={LINK_BUTTON}>
                Clear search
              </button>
            </div>
          ) : (
            <div className={STATE_SHELL}>
              <Inbox size={22} className="text-ink/25" />
              <div>
                <p className="text-sm font-semibold text-ink/70">
                  No domains in &ldquo;{STATUS_FILTERS.find((f) => f.key === statusFilter)?.label}&rdquo;
                </p>
                <p className="mt-1 text-xs text-ink/50">Other domains are tracked under a different decision.</p>
              </div>
              <button type="button" onClick={() => setStatusFilter("all")} className={LINK_BUTTON}>
                Show all domains
              </button>
            </div>
          )
        ) : (
          filtered.map((d) => {
            const flagged = isDomainFlagged(d)
            const open = expanded === d.domain
            const saving = savingDomain === d.domain
            const statusPill = (
              <span className={`${PILL} ${STATUS_STYLE[d.decision]}`}>{STATUS_LABEL[d.decision]}</span>
            )

            return (
              <div key={d.domain} className="relative border-b border-ink/[0.06] last:border-b-0">
                {flagged && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-rose-500" />}

                <div
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-5 py-4 transition-colors hover:bg-ink/[0.02] sm:gap-y-0 sm:py-3.5 ${LINKS_GRID}`}
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : d.domain)}
                    className="col-span-2 flex min-w-0 items-center gap-1.5 rounded text-left font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal/40 sm:col-span-1"
                  >
                    <ChevronDown
                      size={14}
                      className={`flex-none text-ink/40 transition-transform ${open ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                    <span className="truncate">{d.domain}</span>
                    {flagged && (
                      <span className={`${PILL} ml-1 flex-none ${ROSE_PILL}`}>
                        <AlertTriangle size={11} aria-hidden />
                        Flagged
                      </span>
                    )}
                  </button>

                  <span className="hidden justify-self-end text-sm tabular-nums text-ink/70 sm:block">{d.requests30d}</span>
                  <span className="hidden justify-self-end text-sm tabular-nums text-ink/50 sm:block">{d.requestsAllTime}</span>
                  <span className="hidden text-sm tabular-nums text-ink/50 sm:block">{daysAgo(d.lastSeen)}</span>
                  <span className="hidden sm:block">{statusPill}</span>
                  <DecisionSelect
                    domain={d.domain}
                    value={d.decision}
                    disabled={saving}
                    onChange={(v) => updateDomain(d.domain, { decision: v })}
                    className="hidden sm:block"
                  />

                  {/* mobile-only details */}
                  <span className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink/55 sm:hidden">
                    <span className="tabular-nums">{d.requests30d} in 30d</span>
                    {statusPill}
                    <DecisionSelect
                      domain={d.domain}
                      value={d.decision}
                      disabled={saving}
                      onChange={(v) => updateDomain(d.domain, { decision: v })}
                      className="ml-auto w-40"
                    />
                  </span>
                </div>

                {open && (
                  <div className="border-t border-ink/[0.06] bg-parchment/40 px-5 py-4">
                    {(d.failCount != null || d.successCount != null) && (
                      <div className="mb-4 flex items-center gap-4 rounded-xl border border-ink/10 bg-card px-3.5 py-2 text-xs text-ink/50">
                        <span>
                          <span className="font-semibold tabular-nums text-ink/70">{d.successCount ?? 0}</span> succeeded
                        </span>
                        <span className="h-3 w-px bg-ink/10" aria-hidden />
                        <span>
                          <span className="font-semibold tabular-nums text-ink/70">{d.failCount ?? 0}</span> failed
                        </span>
                        <span className="ml-auto hidden text-ink/45 sm:inline">
                          Pipeline attempts, distinct from the requests above. A &ldquo;succeeded&rdquo; attempt can still
                          be ogOnly or unpriced and become a request.
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <label htmlFor={`note-${d.domain}`} className="text-xs font-medium text-ink/50">
                        Ops note
                      </label>
                      {saving && <span className="text-xs text-ink/40">Saving&hellip;</span>}
                    </div>
                    <OpsNoteField
                      id={`note-${d.domain}`}
                      value={d.opsNote}
                      onSave={(note) => updateDomain(d.domain, { opsNote: note })}
                    />

                    {d.submissions.length > 0 && (
                      <>
                        <p className="mt-4 text-xs font-medium text-ink/50">
                          Recent fallback submissions ({d.submissions.length})
                        </p>
                        <div className="mt-2 flex flex-col gap-2">
                          {d.submissions.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-start justify-between gap-3 rounded-xl border border-ink/10 bg-card px-3.5 py-2.5 transition-colors hover:border-ink/20"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-xs text-ink/50">
                                  <span className="font-semibold text-ink/60">{s.customerInitials}</span>
                                  <span>{daysAgo(s.submittedAt)}</span>
                                  {s.hasScreenshot && (
                                    <span className="flex items-center gap-1">
                                      <ImageIcon size={11} aria-hidden /> Screenshot
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 truncate text-sm text-ink/80">{s.note}</p>
                              </div>
                              <a
                                href={s.link}
                                target="_blank"
                                rel="noreferrer"
                                className="flex flex-none items-center gap-1 rounded text-xs font-semibold text-teal-deep outline-none hover:underline focus-visible:ring-2 focus-visible:ring-teal/40"
                              >
                                Open link <ExternalLink size={11} aria-hidden />
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
          })
        )}
      </div>
    </>
  )
}

function DecisionSelect({
  domain,
  value,
  onChange,
  disabled,
  className = "",
}: {
  domain: string
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
        aria-label={`Decision for ${domain}`}
        onChange={(e) => onChange(e.target.value as DomainDecision)}
        className={`w-full appearance-none py-1.5 pl-2.5 pr-7 text-xs font-medium ${FIELD}`}
      >
        <option value="not_started">Not started</option>
        <option value="extractor_in_progress">Build extractor</option>
        <option value="affiliate_pursued">Pursue affiliate</option>
        <option value="dismissed">Dismiss</option>
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/35" aria-hidden />
    </div>
  )
}

/**
 * Keeps the note in local state and saves once, on blur. Saving on every
 * keystroke fired a database write per character and disabled the textarea
 * while each one was in flight, which dropped focus after every letter typed.
 * If a save fails, updateDomain rolls `value` back and the effect resets the draft.
 */
function OpsNoteField({ id, value, onSave }: { id: string; value: string; onSave: (note: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  return (
    <textarea
      id={id}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft)
      }}
      placeholder="Why this decision, who to follow up with, what's blocking it..."
      rows={2}
      className={`mt-1.5 w-full px-3 py-2 text-sm placeholder:text-ink/35 ${FIELD}`}
    />
  )
}

// ---------------------------------------------------------------------------
// Channel 1: store feeds
//
// A simpler shape than the backlog: there's no decision to make (you can't
// "dismiss" a seller's broken feed), just a health status to notice and go fix.
// Sorted unhealthy first, then never-synced, since that's what someone opening
// this tab needs to see immediately.
// ---------------------------------------------------------------------------

function StoreFeedsTab({ sellers, neverSyncedCount }: { sellers: SellerFeedHealth[]; neverSyncedCount: number }) {
  const sorted = useMemo(() => {
    const rank = (s: SellerFeedHealth) => (s.feedHealthy === false ? 0 : s.feedHealthy == null ? 1 : 2)
    return sellers.slice().sort((a, b) => rank(a) - rank(b))
  }, [sellers])

  if (sellers.length === 0) {
    return (
      <div className={`mt-4 ${PANEL}`}>
        <div className={STATE_SHELL}>
          <Store size={22} className="text-ink/25" />
          <div>
            <p className="text-sm font-semibold text-ink/70">No feed-integrated stores yet</p>
            <p className="mt-1 max-w-sm text-xs text-ink/50">
              Only affiliated stores with a Shopify or WooCommerce provider configured show up here. Manually managed
              catalogues have nothing to sync.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <p className="mt-4 text-xs text-ink/45">
        {sellers.length} feed-integrated store{sellers.length === 1 ? "" : "s"}.
        {neverSyncedCount > 0 &&
          " \u201CNever synced\u201D is expected for most stores right now: no automated feed-sync job populates this yet, so it reads as unknown rather than a guess."}
      </p>

      <div className={`mt-3 ${PANEL}`}>
        <div className={`${HEAD} ${FEEDS_GRID}`}>
          <span>Store</span>
          <span>Provider</span>
          <span>Feed status</span>
          <span>Last synced</span>
        </div>

        {sorted.map((s) => (
          <div
            key={s.id}
            className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-ink/[0.06] px-5 py-4 transition-colors last:border-b-0 hover:bg-ink/[0.02] sm:gap-y-0 sm:py-3.5 ${FEEDS_GRID}`}
          >
            {s.feedHealthy === false && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-rose-500" />}

            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{s.name}</span>
              <span className="block truncate font-mono text-xs text-ink/50">{s.platformSlug}</span>
            </span>

            {/* mobile: feed status sits beside the store */}
            <span className="sm:hidden">
              <FeedStatusPill feedHealthy={s.feedHealthy} />
            </span>

            <span className="hidden text-sm text-ink/60 sm:block">{s.providerType ?? "\u2014"}</span>
            <span className="hidden sm:block">
              <FeedStatusPill feedHealthy={s.feedHealthy} />
            </span>
            <span className="hidden text-sm tabular-nums text-ink/50 sm:block">
              {s.lastSync ? daysAgo(s.lastSync) : "Never"}
            </span>

            {/* mobile-only details */}
            <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/55 sm:hidden">
              <span>{s.providerType ?? "No provider"}</span>
              <span>{s.lastSync ? `Synced ${daysAgo(s.lastSync)}` : "Never synced"}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function FeedStatusPill({ feedHealthy }: { feedHealthy: boolean | null }) {
  const tone =
    feedHealthy === true
      ? { pill: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200", dot: "bg-emerald-600", label: "Healthy" }
      : feedHealthy === false
        ? { pill: ROSE_PILL, dot: "bg-rose-600", label: "Unhealthy" }
        : { pill: "bg-ink/[0.04] text-ink/60 ring-1 ring-inset ring-ink/10", dot: "bg-ink/30", label: "Unknown" }

  return (
    <span className={`${PILL} ${tone.pill}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
      {tone.label}
    </span>
  )
}