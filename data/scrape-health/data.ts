// data/scrape-health/data.ts

// ---------------------------------------------------------------------------
// Scrape / Extractor Health — shared data + helpers
//
// Single source of truth for domain fallback-request tracking, used by both
// the Scrape health page (full editor/table view) and the Sales dashboard
// (read-only "needs a decision" attention list).
//
// NOTE: This is a local mock (INITIAL_DOMAINS is a plain array, not a
// context), so edits made on the Scrape health page's local useState won't
// propagate here. Once a real ScrapeHealthContext exists to share live
// state the way AdminDataContext does for orders, swap this file's
// INITIAL_DOMAINS export for that context's live state.
// ---------------------------------------------------------------------------

export type DomainStatus = 'not_started' | 'extractor_in_progress' | 'affiliate_pursued' | 'dismissed'

export type FallbackSubmission = {
  id: string
  submittedAt: string // ISO
  customerInitials: string
  note: string
  link: string
  hasScreenshot: boolean
}

export type DomainRecord = {
  domain: string
  requests30d: number
  requestsAllTime: number
  lastSeen: string // ISO
  status: DomainStatus
  opsNote: string
  submissions: FallbackSubmission[]
}

export const MANUAL_REQUEST_THRESHOLD = 8 // requests / 30 days — crossing this flags the domain

export const STATUS_LABEL: Record<DomainStatus, string> = {
  not_started: 'Not started',
  extractor_in_progress: 'Building extractor',
  affiliate_pursued: 'Pursuing affiliate',
  dismissed: 'Dismissed',
}

export const STATUS_STYLE: Record<DomainStatus, string> = {
  not_started: 'bg-ink/8 text-ink/70',
  extractor_in_progress: 'bg-teal-deep/15 text-teal-deep',
  affiliate_pursued: 'bg-indigo/15 text-indigo',
  dismissed: 'bg-ink/5 text-ink/35',
}

// A domain is "flagged" when it's crossed the manual-work threshold and
// nobody has made a build/affiliate/dismiss decision on it yet. Shared
// definition — both pages must agree on what counts as flagged.
export function isDomainFlagged(d: DomainRecord): boolean {
  return d.requests30d >= MANUAL_REQUEST_THRESHOLD && d.status === 'not_started'
}

export function daysAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}

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
// Mock data — stand-in for the real per-domain fallback log described in the
// spec. Wire this up to whatever table stores fallback submissions
// (request.domain, grouped + counted) once that exists.
// ---------------------------------------------------------------------------

export const INITIAL_DOMAINS: DomainRecord[] = [
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