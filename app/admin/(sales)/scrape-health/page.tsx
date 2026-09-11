'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ExternalLink, ImageIcon, Search } from 'lucide-react'

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
// This page owns a decision, not just a report: for every domain past the
// threshold, someone needs to pick "build extractor," "pursue affiliate," or
// "dismiss" (one-offs, spam, not worth building for). That decision is the
// whole point of tracking this data, so it's inline on every row rather than
// buried in a separate screen.
// ---------------------------------------------------------------------------

type DomainStatus = 'not_started' | 'extractor_in_progress' | 'affiliate_pursued' | 'dismissed'

type FallbackSubmission = {
  id: string
  submittedAt: string // ISO
  customerInitials: string
  note: string
  link: string
  hasScreenshot: boolean
}

type DomainRecord = {
  domain: string
  requests30d: number
  requestsAllTime: number
  lastSeen: string // ISO
  status: DomainStatus
  opsNote: string
  submissions: FallbackSubmission[]
}

const MANUAL_REQUEST_THRESHOLD = 8 // requests / 30 days — crossing this flags the domain

const STATUS_LABEL: Record<DomainStatus, string> = {
  not_started: 'Not started',
  extractor_in_progress: 'Building extractor',
  affiliate_pursued: 'Pursuing affiliate',
  dismissed: 'Dismissed',
}

const STATUS_STYLE: Record<DomainStatus, string> = {
  not_started: 'bg-ink/8 text-ink/70',
  extractor_in_progress: 'bg-teal-deep/15 text-teal-deep',
  affiliate_pursued: 'bg-indigo/15 text-indigo',
  dismissed: 'bg-ink/5 text-ink/35',
}

function daysAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}

// ---------------------------------------------------------------------------
// Mock data — stand-in for the real per-domain fallback log described in the
// spec. Wire this up to whatever table stores fallback submissions
// (request.domain, grouped + counted) once that exists.
// ---------------------------------------------------------------------------

const INITIAL_DOMAINS: DomainRecord[] = [
  {
    domain: 'instagram.com',
    requests30d: 34,
    requestsAllTime: 112,
    lastSeen: daysIso(0),
    status: 'extractor_in_progress',
    opsNote: 'Boutique sellers posting product photos with price in caption. Extractor would need OCR on the caption, not just post metadata.',
    submissions: mockSubs('instagram.com', 3),
  },
  {
    domain: 'trendloop.lk',
    requests30d: 19,
    requestsAllTime: 41,
    lastSeen: daysIso(0),
    status: 'not_started',
    opsNote: '',
    submissions: mockSubs('trendloop.lk', 3),
  },
  {
    domain: 'glowcosmetics.in',
    requests30d: 14,
    requestsAllTime: 22,
    lastSeen: daysIso(1),
    status: 'not_started',
    opsNote: '',
    submissions: mockSubs('glowcosmetics.in', 3),
  },
  {
    domain: 'etsy.com',
    requests30d: 11,
    requestsAllTime: 58,
    lastSeen: daysIso(2),
    status: 'affiliate_pursued',
    opsNote: 'Reached out to Etsy affiliate program Aug 28 — waiting on approval.',
    submissions: mockSubs('etsy.com', 3),
  },
  {
    domain: 'meesho.com',
    requests30d: 9,
    requestsAllTime: 15,
    lastSeen: daysIso(1),
    status: 'not_started',
    opsNote: '',
    submissions: mockSubs('meesho.com', 2),
  },
  {
    domain: 'boutiquehive.com',
    requests30d: 6,
    requestsAllTime: 9,
    lastSeen: daysIso(4),
    status: 'not_started',
    opsNote: '',
    submissions: mockSubs('boutiquehive.com', 2),
  },
  {
    domain: 'kadai.store',
    requests30d: 5,
    requestsAllTime: 6,
    lastSeen: daysIso(9),
    status: 'dismissed',
    opsNote: 'Site went offline mid-Aug, likely defunct.',
    submissions: mockSubs('kadai.store', 1),
  },
  {
    domain: 'pinterest.com',
    requests30d: 4,
    requestsAllTime: 20,
    lastSeen: daysIso(3),
    status: 'not_started',
    opsNote: '',
    submissions: mockSubs('pinterest.com', 2),
  },
  {
    domain: 'facebook.com',
    requests30d: 3,
    requestsAllTime: 11,
    lastSeen: daysIso(6),
    status: 'not_started',
    opsNote: '',
    submissions: mockSubs('facebook.com', 1),
  },
  {
    domain: 'randomseller.xyz',
    requests30d: 1,
    requestsAllTime: 1,
    lastSeen: daysIso(14),
    status: 'dismissed',
    opsNote: 'Single request, looked like spam link.',
    submissions: mockSubs('randomseller.xyz', 1),
  },
]

function daysIso(back: number) {
  const d = new Date()
  d.setDate(d.getDate() - back)
  return d.toISOString()
}

function mockSubs(domain: string, count: number): FallbackSubmission[] {
  const notes = [
    'Wanted the blue one, size M — couldn\u2019t tell if it\u2019s in stock.',
    'Saw this in a story, no price shown anywhere on the page.',
    'Link goes to a product page but variants load in JS, scraper got nothing.',
  ]
  const initials = ['S.P.', 'R.K.', 'A.F.', 'N.D.', 'M.J.']
  return Array.from({ length: count }).map((_, i) => ({
    id: `${domain}-${i}`,
    submittedAt: daysIso(i * 2 + 1),
    customerInitials: initials[i % initials.length],
    note: notes[i % notes.length],
    link: `https://${domain}/...`,
    hasScreenshot: i % 2 === 0,
  }))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | 'flagged' | DomainStatus

export default function ScrapeHealthPage() {
  const [domains, setDomains] = useState<DomainRecord[]>(INITIAL_DOMAINS)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const isFlagged = (d: DomainRecord) =>
    d.requests30d >= MANUAL_REQUEST_THRESHOLD && d.status === 'not_started'

  const updateDomain = (domain: string, patch: Partial<DomainRecord>) => {
    setDomains((prev) => prev.map((d) => (d.domain === domain ? { ...d, ...patch } : d)))
  }

  const filtered = useMemo(() => {
    return domains
      .filter((d) => d.domain.toLowerCase().includes(search.trim().toLowerCase()))
      .filter((d) => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'flagged') return isFlagged(d)
        return d.status === statusFilter
      })
      .sort((a, b) => b.requests30d - a.requests30d)
  }, [domains, search, statusFilter])

  const totalRequests30d = domains.reduce((sum, d) => sum + d.requests30d, 0)
  const flaggedCount = domains.filter(isFlagged).length
  const topDomains = domains.slice().sort((a, b) => b.requests30d - a.requests30d).slice(0, 6)
  const maxVolume = Math.max(...topDomains.map((d) => d.requests30d), 1)

  return (
    <div className="mx-auto max-w-8xl px-6 pb-20 pt-8 lg:px-10">
      <header className="max-w-xl">
        <h1 className="font-display text-3xl text-ink">Scrape health</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/60">
          Every link the scraper can&rsquo;t parse falls back to a manual request, and we log the
          domain. This is that log, sorted into a backlog: which sites are costing the most manual
          work, and which ones have crossed the point where it&rsquo;s worth building a real
          extractor or chasing an affiliate deal.
        </p>
      </header>

      {/* Summary strip */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-ink/10 bg-card px-4 py-3">
          <p className="text-2xl font-semibold text-ink">{domains.length}</p>
          <p className="mt-0.5 text-xs text-ink/50">domains tracked</p>
        </div>
        <div className="rounded-xl border border-ink/10 bg-card px-4 py-3">
          <p className="text-2xl font-semibold text-ink">{totalRequests30d}</p>
          <p className="mt-0.5 text-xs text-ink/50">fallback requests, 30d</p>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            flaggedCount > 0 ? 'border-red-600/25 bg-red-600/5' : 'border-ink/10 bg-card'
          }`}
        >
          <p className={`text-2xl font-semibold ${flaggedCount > 0 ? 'text-red-700' : 'text-ink'}`}>
            {flaggedCount}
          </p>
          <p className={`mt-0.5 text-xs ${flaggedCount > 0 ? 'text-red-700/70' : 'text-ink/50'}`}>
            past threshold, no decision
          </p>
        </div>
        <div className="rounded-xl border border-ink/10 bg-card px-4 py-3">
          <p className="truncate text-2xl font-semibold text-ink">{topDomains[0]?.domain}</p>
          <p className="mt-0.5 text-xs text-ink/50">busiest domain</p>
        </div>
      </div>

      {/* Volume chart — where the backlog concentrates */}
      <div className="mt-6 rounded-xl border border-ink/10 bg-card p-5">
        <p className="text-xs font-semibold text-ink/50">Fallback requests by domain, last 30 days</p>
        <div className="mt-4 flex flex-col gap-2.5">
          {topDomains.map((d) => (
            <div key={d.domain} className="flex items-center gap-3">
              <span className="w-32 flex-none truncate font-mono text-xs text-ink/70 sm:w-40">
                {d.domain}
              </span>
              <div className="h-5 flex-1 overflow-hidden rounded-full bg-ink/5">
                <div
                  className={`h-full rounded-full ${
                    isFlagged(d) ? 'bg-red-500/70' : 'bg-teal-deep/60'
                  }`}
                  style={{ width: `${(d.requests30d / maxVolume) * 100}%` }}
                />
              </div>
              <span className="w-6 flex-none text-right text-xs font-semibold text-ink/70">
                {d.requests30d}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink/40">
          Red bars have crossed {MANUAL_REQUEST_THRESHOLD}/30d with no decision made yet.
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
                  statusFilter === f
                    ? 'bg-ink text-white'
                    : 'bg-ink/5 text-ink/60 hover:bg-ink/10'
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
            className="w-full rounded-lg border border-ink/15 bg-white py-1.5 pl-8 pr-3 text-sm text-ink outline-none focus:border-teal/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-ink/10 bg-card">
        <div className="hidden grid-cols-[1.6fr_0.9fr_0.9fr_0.9fr_1.3fr_1.6fr] gap-2 border-b border-ink/10 px-4 py-2.5 text-xs font-semibold text-ink/45 sm:grid">
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
          return (
            <div key={d.domain} className="border-b border-ink/10 last:border-b-0">
              <div className="grid grid-cols-2 items-center gap-2 px-4 py-3 sm:grid-cols-[1.6fr_0.9fr_0.9fr_0.9fr_1.3fr_1.6fr]">
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

                <span className="text-right text-sm text-ink/70 sm:text-right">{d.requests30d}</span>
                <span className="hidden text-right text-sm text-ink/50 sm:block">{d.requestsAllTime}</span>
                <span className="hidden text-xs text-ink/50 sm:block">{daysAgo(d.lastSeen)}</span>

                <span className="hidden sm:block">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[d.status]}`}
                  >
                    {STATUS_LABEL[d.status]}
                  </span>
                </span>

                <select
                  value={d.status}
                  onChange={(e) => updateDomain(d.domain, { status: e.target.value as DomainStatus })}
                  className="hidden rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-teal/50 sm:block"
                >
                  <option value="not_started">Not started</option>
                  <option value="extractor_in_progress">Build extractor</option>
                  <option value="affiliate_pursued">Pursue affiliate</option>
                  <option value="dismissed">Dismiss</option>
                </select>

                {/* Mobile: status + decision stacked under domain row */}
                <div className="col-span-2 flex items-center gap-2 sm:hidden">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[d.status]}`}>
                    {STATUS_LABEL[d.status]}
                  </span>
                  <select
                    value={d.status}
                    onChange={(e) => updateDomain(d.domain, { status: e.target.value as DomainStatus })}
                    className="ml-auto rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-teal/50"
                  >
                    <option value="not_started">Not started</option>
                    <option value="extractor_in_progress">Build extractor</option>
                    <option value="affiliate_pursued">Pursue affiliate</option>
                    <option value="dismissed">Dismiss</option>
                  </select>
                </div>
              </div>

              {open && (
                <div className="border-t border-ink/10 bg-parchment/40 px-4 py-4">
                  <label className="text-xs font-semibold text-ink/50">Ops note</label>
                  <textarea
                    value={d.opsNote}
                    onChange={(e) => updateDomain(d.domain, { opsNote: e.target.value })}
                    placeholder="Why this decision, who to follow up with, what's blocking it..."
                    rows={2}
                    className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
                  />

                  <p className="mt-4 text-xs font-semibold text-ink/50">
                    Recent fallback submissions ({d.submissions.length})
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    {d.submissions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-ink/10 bg-card px-3 py-2.5"
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
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}