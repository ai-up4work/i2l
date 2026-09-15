// data/scrape-health/data.ts

// ---------------------------------------------------------------------------
// Scrape / Extractor Health — shared display helpers
//
// Used by both the Scrape health page (full editor/table view) and the
// Sales dashboard (read-only "needs a decision" attention list) — both
// need to agree on the same threshold/labels/flagged-definition.
//
// Real data (previously INITIAL_DOMAINS, a hardcoded mock array) now
// lives in lib/supabase/scrape-health-admin.ts — fetchDomainHealth()
// reads it from the real `requests` + `scrape_health` tables. This file
// keeps only the pure display helpers that don't depend on where the
// data came from.
// ---------------------------------------------------------------------------

import type { DomainDecision, DomainHealthRecord } from '@/lib/supabase/scrape-health-admin'

export type { DomainDecision, DomainHealthRecord }

export const MANUAL_REQUEST_THRESHOLD = 8 // requests / 30 days — crossing this flags the domain

export const STATUS_LABEL: Record<DomainDecision, string> = {
  not_started: 'Not started',
  extractor_in_progress: 'Building extractor',
  affiliate_pursued: 'Pursuing affiliate',
  dismissed: 'Dismissed',
}

export const STATUS_STYLE: Record<DomainDecision, string> = {
  not_started: 'bg-ink/8 text-ink/70',
  extractor_in_progress: 'bg-teal-deep/15 text-teal-deep',
  affiliate_pursued: 'bg-indigo/15 text-indigo',
  dismissed: 'bg-ink/5 text-ink/35',
}

// A domain is "flagged" when it's crossed the manual-work threshold and
// nobody has made a build/affiliate/dismiss decision on it yet. Shared
// definition — both pages must agree on what counts as flagged.
export function isDomainFlagged(d: DomainHealthRecord): boolean {
  return d.requests30d >= MANUAL_REQUEST_THRESHOLD && d.decision === 'not_started'
}

export function daysAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}