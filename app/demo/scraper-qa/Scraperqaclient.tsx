// app/demo/scraper-qa/Scraperqaclient.tsx
//
// Scraper QA — runs a link through the EXACT customer item-screen flow.
//
// The old page had its own copies of every platform view, its own fetch
// (320 s timeout, no retry, no preview, no fallback) and always skipped the
// cache, so "works on QA" didn't mean "works for customers". This page
// instead mounts the real pieces:
//
//   DashboardProvider   beginRequestForUrl → quick preview (/api/og-lookup)
//                       + useProductLookup (same retry, waits, time limits,
//                       preview fallback, store redirect)
//   ProductRequestOverlay → the real ItemInfoModal and platform views
//
// So the screen, the outcome and the time taken are what a customer gets.
// The only differences, all opt-in:
//   - "Skip cache" adds fresh=1 (staff only): a real read, not the 1-hour
//     cached copy, so timing is honest for a link pasted for the first time.
//   - Add to cart / wishlist / chat request are logged instead of done, so
//     testing doesn't fill your real cart or create requests.
//   - A store redirect is shown instead of followed.
//
// Network timing comes from watching the page's own requests (window.fetch
// is wrapped, read-only, while a run is active) — nothing in the flow is
// changed to measure it.
//
// Saved links: table scraper_qa_links via /api/admin/scraper-qa/links
// (data/wishdrop-scraper-qa-links.sql). Until that's run, links are kept in
// this browser.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  ExternalLink,
  Loader2,
  Play,
  Search,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react'
import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext'
import ProductRequestOverlay from '@/components/stores/ProductRequestOverlay'
import type { ItemSandboxAction } from '@/components/dashboard/ItemInfoModal'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { ScraperTestLink as PresetLink } from '@/data/stores/demo'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Outcome = 'product' | 'needs_check' | 'unreadable' | 'redirect'
type Verdict = 'untested' | 'pass' | 'fail'

type SavedLink = {
  id: string
  url: string
  label: string | null
  note: string | null
  status: Verdict
  last_outcome: Outcome | null
  last_ms: number | null
  last_site: string | null
  last_title: string | null
  last_price: string | null
  last_error: string | null
  last_fresh: boolean | null
  last_run_at: string | null
}

type NetEvent = {
  id: number
  kind: 'lookup' | 'preview' | 'other'
  path: string
  startMs: number
  endMs: number | null
  status: number | null
  summary: string | null
}

type LogEvent = { atMs: number; text: string; tone?: 'info' | 'warn' | 'good' }

type Run = {
  url: string
  startedAt: number
  fresh: boolean
  sawLoading: boolean
  firstContentMs: number | null
  doneMs: number | null
  outcome: Outcome | null
  redirect: string | null
  result: ScrapeResult | null
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  product: 'Product page',
  needs_check: 'Partial — chat screen',
  unreadable: 'Couldn’t load — chat screen',
  redirect: 'Our store page',
}
const OUTCOME_TONE: Record<Outcome, string> = {
  product: 'bg-teal/10 text-teal-deep ring-teal/25',
  needs_check: 'bg-gold/15 text-gold-deep ring-gold/30',
  unreadable: 'bg-rose-50 text-rose-700 ring-rose-200',
  redirect: 'bg-indigo/10 text-indigo ring-indigo/20',
}
const OUTCOME_HELP: Record<Outcome, string> = {
  product: 'The customer sees the product with a price and can add it to the cart.',
  needs_check: 'Name/photo only — the customer is asked to chat so the team confirms price and options.',
  unreadable: 'Nothing usable — the customer gets “We couldn’t load this listing” and the chat button.',
  redirect: 'This link is one of our own stores — the customer is taken to our store page.',
}

// Sites with their own product view in ItemInfoModal (anything else falls
// to the generic chat view even with a price). Keep in step with its switch.
const BRANDED_SITES = new Set([
  'amazon', 'flipkart', 'meesho', 'myntra', 'ebay', 'ajio', 'jiomart', 'snapdeal', 'firstcry', 'tatacliq',
  'nykaa', 'hopscotch', 'westside', 'shopify', 'boat', 'woocommerce', 'seleqt', 'lenskart', 'croma',
])

/** What ItemInfoModal shows for this result — same rules as that file. */
function outcomeOf(r: ScrapeResult | null): Outcome {
  if (!r) return 'unreadable'
  if (r.internalRedirect) return 'redirect'
  const hasPrice = r.price != null && String(r.price).trim() !== ''
  if (r.error || (!r.title && !hasPrice && !r.images?.length)) return 'unreadable'
  const price = Number(r.price)
  if (r.ogOnly || !r.site || !BRANDED_SITES.has(r.site) || !(price > 0)) return 'needs_check'
  return 'product'
}

const secs = (ms: number | null | undefined) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`)

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function ago(iso: string | null): string {
  if (!iso) return 'never run'
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}

function summarise(path: string, body: unknown, status: number): string {
  if (!body || typeof body !== 'object') return status >= 400 ? `HTTP ${status} (not JSON — likely a platform timeout)` : 'no body'
  const b = body as Record<string, unknown>
  if (path.includes('/api/og-lookup')) {
    return b.title || b.image ? `preview: ${b.title ? `“${String(b.title).slice(0, 60)}”` : 'no title'}${b.image ? ' + image' : ''}` : 'preview: nothing found'
  }
  if (b.internalRedirect) return `our store → ${b.internalRedirect}`
  if (b.error) return `error: ${String(b.error).slice(0, 140)}`
  const bits = [
    b.site ? String(b.site) : null,
    b.price ? `price ${b.currencyCode ?? ''} ${b.price}`.trim() : 'no price',
    b.ogOnly ? 'preview only' : null,
    b.cachedAt ? `cached ${String(b.cachedAt).slice(11, 16)}` : null,
    b.stale ? 'older copy' : null,
    b.source ? `via ${b.source}` : null,
  ].filter(Boolean)
  return bits.join(' · ')
}

// ---------------------------------------------------------------------------
// Saved links — server, or this browser until the table exists
// ---------------------------------------------------------------------------

const LOCAL_KEY = 'wishdrop:scraper-qa:links'

function readLocal(): SavedLink[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as SavedLink[]) : []
  } catch {
    return []
  }
}
function writeLocal(links: SavedLink[]) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(links))
  } catch {
    // storage full / blocked — the list still works for this visit
  }
}

function useSavedLinks() {
  const [links, setLinks] = useState<SavedLink[]>([])
  const [local, setLocal] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/scraper-qa/links')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Could not load saved links')
        if (body.needsMigration) {
          setLocal(true)
          setLinks(readLocal())
        } else setLinks(body.links as SavedLink[])
      })
      .catch((e: Error) => {
        setError(e.message)
        setLocal(true)
        setLinks(readLocal())
      })
      .finally(() => setLoaded(true))
  }, [])

  const apply = useCallback(
    (next: SavedLink[]) => {
      setLinks(next)
      if (local) writeLocal(next)
    },
    [local],
  )

  const save = useCallback(
    async (url: string, label?: string | null, run?: Record<string, unknown>): Promise<SavedLink | null> => {
      if (local) {
        const existing = links.find((l) => l.url === url)
        const row: SavedLink = existing
          ? { ...existing, label: label ?? existing.label }
          : {
              id: `local-${Date.now()}`,
              url,
              label: label ?? null,
              note: null,
              status: 'untested',
              last_outcome: null,
              last_ms: null,
              last_site: null,
              last_title: null,
              last_price: null,
              last_error: null,
              last_fresh: null,
              last_run_at: null,
            }
        const merged = run ? localRun(row, run) : row
        apply([merged, ...links.filter((l) => l.url !== url)])
        return merged
      }
      const res = await fetch('/api/admin/scraper-qa/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, label, run }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Could not save the link')
        return null
      }
      const row = body.link as SavedLink
      setLinks((prev) => [row, ...prev.filter((l) => l.url !== row.url)])
      return row
    },
    [apply, links, local],
  )

  const patch = useCallback(
    async (id: string, changes: { status?: Verdict; run?: Record<string, unknown>; note?: string | null }) => {
      if (local) {
        apply(links.map((l) => (l.id !== id ? l : localRun({ ...l, ...(changes.status ? { status: changes.status } : {}), ...(changes.note !== undefined ? { note: changes.note } : {}) }, changes.run))))
        return
      }
      const res = await fetch('/api/admin/scraper-qa/links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...changes }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return setError(body.error ?? 'Could not update the link')
      setLinks((prev) => prev.map((l) => (l.id === id ? (body.link as SavedLink) : l)))
    },
    [apply, links, local],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!local) {
        const res = await fetch(`/api/admin/scraper-qa/links?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        if (!res.ok) return setError('Could not delete the link')
      }
      apply(links.filter((l) => l.id !== id))
    },
    [apply, links, local],
  )

  return { links, local, loaded, error, setError, save, patch, remove }
}

function localRun(row: SavedLink, run?: Record<string, unknown>): SavedLink {
  if (!run) return row
  return {
    ...row,
    last_outcome: (run.outcome as Outcome) ?? null,
    last_ms: typeof run.ms === 'number' ? Math.round(run.ms) : null,
    last_site: (run.site as string) ?? null,
    last_title: (run.title as string) ?? null,
    last_price: (run.price as string) ?? null,
    last_error: (run.error as string) ?? null,
    last_fresh: run.fresh === true,
    last_run_at: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ScraperQaClient({ presetLinks }: { presetLinks: PresetLink[] }) {
  // Lives outside DashboardProvider: the provider takes these as props.
  const [fresh, setFresh] = useState(true)
  const redirectRef = useRef<(path: string) => void>(() => {})
  const onInternalRedirect = useCallback((path: string) => redirectRef.current(path), [])

  return (
    <DashboardProvider freshLookups={fresh} onInternalRedirect={onInternalRedirect}>
      <Workbench presetLinks={presetLinks} fresh={fresh} setFresh={setFresh} redirectRef={redirectRef} />
    </DashboardProvider>
  )
}

function Workbench({
  presetLinks,
  fresh,
  setFresh,
  redirectRef,
}: {
  presetLinks: PresetLink[]
  fresh: boolean
  setFresh: (v: boolean) => void
  redirectRef: React.MutableRefObject<(path: string) => void>
}) {
  const { beginRequestForUrl, lookupLoading, scrapeResult, modalOpen, closeModal } = useDashboard()
  const saved = useSavedLinks()

  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'saved' | 'presets' | 'failing'>('all')
  const [run, setRun] = useState<Run | null>(null)
  const [net, setNet] = useState<NetEvent[]>([])
  const [log, setLog] = useState<LogEvent[]>([])
  const [hudOpen, setHudOpen] = useState(true)
  const [now, setNow] = useState(0)
  const [copied, setCopied] = useState(false)

  const runRef = useRef<Run | null>(null)
  runRef.current = run

  const at = () => (runRef.current ? performance.now() - runRef.current.startedAt : 0)
  const note = useCallback((text: string, tone?: LogEvent['tone']) => {
    if (!runRef.current) return
    setLog((l) => [...l, { atMs: performance.now() - runRef.current!.startedAt, text, tone }])
  }, [])

  // A store redirect: shown, not followed.
  redirectRef.current = (path: string) => {
    note(`Store redirect: the customer would be taken to ${path}`, 'good')
    setRun((r) => (r ? { ...r, redirect: path, outcome: r.doneMs != null ? 'redirect' : r.outcome } : r))
    // Customers leave the item screen here; so do we (without navigating).
    closeModal()
  }

  // ---- Watch the page's own requests (read-only) while a run is on ----
  useEffect(() => {
    const original = window.fetch
    let seq = 0
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const current = runRef.current
      const watched = current && (href.includes('/api/product-lookup') || href.includes('/api/og-lookup'))
      if (!watched) return original(input, init)
      const id = ++seq
      const kind: NetEvent['kind'] = href.includes('/api/og-lookup') ? 'preview' : 'lookup'
      const path = href.replace(/^https?:\/\/[^/]+/, '')
      const startMs = performance.now() - current!.startedAt
      setNet((n) => [...n, { id, kind, path, startMs, endMs: null, status: null, summary: null }])
      try {
        const res = await original(input, init)
        const body = await res.clone().json().catch(() => null)
        const endMs = performance.now() - current!.startedAt
        setNet((n) => n.map((e) => (e.id === id ? { ...e, endMs, status: res.status, summary: summarise(path, body, res.status) } : e)))
        return res
      } catch (err) {
        const endMs = performance.now() - current!.startedAt
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : 'failed'
        setNet((n) => n.map((e) => (e.id === id ? { ...e, endMs, status: 0, summary: msg } : e)))
        throw err
      }
    }
    return () => {
      window.fetch = original
    }
  }, [])

  // ---- Ticking clock while running ----
  useEffect(() => {
    if (!run || run.doneMs != null) return
    const t = setInterval(() => setNow(performance.now()), 200)
    return () => clearInterval(t)
  }, [run])

  // ---- Follow the real flow's state ----
  useEffect(() => {
    const r = runRef.current
    if (!r || r.doneMs != null) return
    // One combined update, so nothing set here overwrites anything else.
    const next: Run = { ...r }
    if (lookupLoading) next.sawLoading = true
    if (scrapeResult && !scrapeResult.internalRedirect && next.firstContentMs == null) {
      next.firstContentMs = at()
      note(scrapeResult.title ? `First thing on screen: “${scrapeResult.title.slice(0, 70)}”` : 'First thing on screen')
    }
    // Finished: the lookup was running and has stopped.
    if (next.sawLoading && !lookupLoading) {
      const doneMs = at()
      const outcome: Outcome = next.redirect || scrapeResult?.internalRedirect ? 'redirect' : outcomeOf(scrapeResult)
      Object.assign(next, { doneMs, outcome, result: scrapeResult, redirect: next.redirect ?? scrapeResult?.internalRedirect ?? null })
      runRef.current = next
      setRun(next)
      note(`Done — ${OUTCOME_LABEL[outcome]}`, outcome === 'product' || outcome === 'redirect' ? 'good' : 'warn')
      const existing = saved.links.find((l) => l.url === r.url)
      if (existing) {
        void saved.patch(existing.id, {
          run: {
            outcome,
            ms: doneMs,
            site: scrapeResult?.site ?? null,
            title: scrapeResult?.title ?? null,
            price: scrapeResult?.price ? `${scrapeResult.currencyCode ?? ''} ${scrapeResult.price}`.trim() : null,
            error: scrapeResult?.error ?? null,
            fresh: r.fresh,
          },
        })
      }
      return
    }
    if (next.sawLoading !== r.sawLoading || next.firstContentMs !== r.firstContentMs) {
      runRef.current = next
      setRun(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupLoading, scrapeResult])

  const start = useCallback(
    (url: string) => {
      const clean = url.trim()
      if (!/^https?:\/\//i.test(clean)) return
      setNet([])
      setLog([])
      setHudOpen(true)
      const r: Run = { url: clean, startedAt: performance.now(), fresh, sawLoading: false, firstContentMs: null, doneMs: null, outcome: null, redirect: null, result: null }
      runRef.current = r
      setRun(r)
      setLog([{ atMs: 0, text: `Pasted ${hostOf(clean)}${fresh ? ' (skipping cache)' : ' (cache allowed, like customers)'}` }])
      void beginRequestForUrl(clean)
    },
    [beginRequestForUrl, fresh],
  )

  const sandbox = useCallback(
    (action: ItemSandboxAction, detail?: unknown) => {
      if (action === 'add-to-cart') {
        const d = detail as { product?: { title?: string; weightKg?: number | null; weightSource?: string | null }; qty?: number } | undefined
        const w = d?.product?.weightKg != null ? ` at ${d.product.weightKg} kg (${d.product.weightSource ?? 'estimate'})` : ''
        note(`Customer pressed Add to cart — would add ${d?.qty ?? 1} × “${(d?.product?.title ?? 'item').slice(0, 50)}”${w}. Not added (QA).`, 'good')
      } else if (action === 'wishlist') note('Customer pressed the wishlist heart. Not saved (QA).')
      else note('Customer pressed Go to cart — would open /account/cart.')
    },
    [note],
  )

  const fakeRequest = useCallback(
    async (opts?: { itemName?: string; photoUrl?: string; chat?: boolean }) => {
      note(
        `Customer pressed Chat about this item — would create a request${opts?.itemName ? ` named “${opts.itemName}”` : ''}${opts?.photoUrl ? ' with their photo' : ''}. Not created (QA).`,
        'good',
      )
      return { ok: true }
    },
    [note],
  )

  // ---- List ----
  const savedUrls = new Set(saved.links.map((l) => l.url))
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const savedRows = saved.links.map((l) => ({ key: l.id, url: l.url, label: l.label || l.last_title || hostOf(l.url), saved: l, preset: null as PresetLink | null }))
    const presetRows = presetLinks
      .filter((p) => !savedUrls.has(p.url))
      .map((p) => ({ key: `p:${p.url}`, url: p.url, label: `${p.label} — ${p.product}`, saved: null as SavedLink | null, preset: p }))
    let all = [...savedRows, ...presetRows]
    if (filter === 'saved') all = savedRows
    if (filter === 'presets') all = presetRows
    if (filter === 'failing') all = savedRows.filter((r) => r.saved!.status === 'fail' || r.saved!.last_outcome === 'unreadable')
    if (q) all = all.filter((r) => r.url.toLowerCase().includes(q) || r.label.toLowerCase().includes(q))
    return all
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.links, presetLinks, query, filter])

  const current = run ? saved.links.find((l) => l.url === run.url) ?? null : null
  const elapsed = run ? (run.doneMs ?? (now ? Math.max(0, now - run.startedAt) : 0)) : 0
  const resultJson = run?.result ?? scrapeResult

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-deep">Super Admin · QA</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Scraper QA</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/60">
            Opens each link in the real item screen with the same requests, retries, time limits and fallback a customer gets — if it works
            here, it works for them, in the same time. Add to cart and chat requests are only logged.
          </p>
        </header>

        {/* Paste a link */}
        <form
          className="mt-6 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            start(input)
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-ink/15 bg-white px-3 focus-within:border-teal/50 focus-within:ring-2 focus-within:ring-teal/15">
            <span className="sr-only">Product link</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a product link, e.g. https://www.myntra.com/…"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink/35"
            />
            {input && (
              <button type="button" aria-label="Clear" onClick={() => setInput('')} className="text-ink/35 hover:text-ink">
                <X size={15} />
              </button>
            )}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!/^https?:\/\//i.test(input.trim())}
              onClick={() => saved.save(input.trim())}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-white px-4 text-sm font-semibold text-ink/70 hover:bg-ink/[0.04] disabled:opacity-40 sm:flex-none"
            >
              <Bookmark size={15} /> Save
            </button>
            <button
              type="submit"
              disabled={!/^https?:\/\//i.test(input.trim())}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-deep px-5 text-sm font-semibold text-white hover:bg-indigo disabled:opacity-40 sm:flex-none"
            >
              <Play size={15} /> Run
            </button>
          </div>
        </form>

        <label className="mt-3 flex items-start gap-2 text-xs text-ink/60">
          <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0b7280]" />
          <span>
            <span className="font-semibold text-ink/75">Skip cache</span> — real timing for a link no one has pasted in the last hour (uses scraper
            credits). Untick to see exactly what a customer gets right now, cached copy included.
          </span>
        </label>

        {saved.local && saved.loaded && (
          <p className="mt-4 rounded-xl bg-gold/10 px-3 py-2 text-xs text-gold-deep ring-1 ring-gold/25">
            Saved links are kept in this browser only. Run <code className="font-mono">data/wishdrop-scraper-qa-links.sql</code> in Supabase to share
            them with the team.
          </p>
        )}
        {saved.error && !saved.local && (
          <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
            {saved.error}{' '}
            <button type="button" onClick={() => saved.setError(null)} className="font-semibold underline">
              Dismiss
            </button>
          </p>
        )}

        {/* Links */}
        <section className="mt-6 rounded-2xl border border-ink/10 bg-card">
          <div className="flex flex-col gap-3 border-b border-ink/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'All'],
                  ['saved', `Saved (${saved.links.length})`],
                  ['presets', 'Store samples'],
                  ['failing', 'Failing'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
                    filter === key ? 'bg-teal-deep text-white ring-teal-deep' : 'bg-white text-ink/60 ring-ink/10 hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-2.5 sm:w-64">
              <Search size={14} className="text-ink/35" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search links" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
          </div>

          {!saved.loaded ? (
            <p className="flex items-center gap-2 p-6 text-sm text-ink/50">
              <Loader2 size={15} className="animate-spin" /> Loading links…
            </p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-ink/50">No links here yet. Paste one above and press Save.</p>
          ) : (
            <ul className="divide-y divide-ink/[0.07]">
              {rows.map((row) => {
                const s = row.saved
                const running = run?.url === row.url && run.doneMs == null
                return (
                  <li key={row.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                    <button type="button" onClick={() => start(row.url)} className="min-w-0 flex-1 text-left">
                      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                        {running ? <Loader2 size={14} className="flex-none animate-spin text-teal-deep" /> : <Play size={13} className="flex-none text-teal-deep" />}
                        <span className="truncate">{row.label}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink/45">{row.url}</p>
                      {s && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink/50">
                          {s.last_outcome && (
                            <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset ${OUTCOME_TONE[s.last_outcome]}`}>{OUTCOME_LABEL[s.last_outcome]}</span>
                          )}
                          {s.last_ms != null && <span className="tabular-nums">{secs(s.last_ms)}</span>}
                          <span>· {ago(s.last_run_at)}</span>
                          {s.last_fresh === false && <span>· cached</span>}
                          {s.last_error && <span className="truncate text-rose-600">· {s.last_error.slice(0, 80)}</span>}
                        </p>
                      )}
                    </button>
                    <div className="flex flex-none items-center gap-1.5">
                      {s ? (
                        <>
                          <button
                            type="button"
                            aria-label="Mark as working"
                            aria-pressed={s.status === 'pass'}
                            onClick={() => saved.patch(s.id, { status: s.status === 'pass' ? 'untested' : 'pass' })}
                            className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ring-inset ${s.status === 'pass' ? 'bg-teal/15 text-teal-deep ring-teal/30' : 'text-ink/35 ring-ink/10 hover:text-teal-deep'}`}
                          >
                            <ThumbsUp size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label="Mark as broken"
                            aria-pressed={s.status === 'fail'}
                            onClick={() => saved.patch(s.id, { status: s.status === 'fail' ? 'untested' : 'fail' })}
                            className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ring-inset ${s.status === 'fail' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'text-ink/35 ring-ink/10 hover:text-rose-600'}`}
                          >
                            <ThumbsDown size={14} />
                          </button>
                          <a href={row.url} target="_blank" rel="noopener noreferrer" aria-label="Open on the store" className="grid h-8 w-8 place-items-center rounded-lg text-ink/35 ring-1 ring-inset ring-ink/10 hover:text-ink">
                            <ExternalLink size={14} />
                          </a>
                          <button
                            type="button"
                            aria-label="Remove saved link"
                            onClick={() => {
                              if (window.confirm('Remove this saved link?')) void saved.remove(s.id)
                            }}
                            className="grid h-8 w-8 place-items-center rounded-lg text-ink/35 ring-1 ring-inset ring-ink/10 hover:text-rose-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => saved.save(row.url, row.label)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-deep ring-1 ring-inset ring-teal/25 hover:bg-teal/5"
                        >
                          <Bookmark size={13} /> Save
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {/* The real item screen, exactly as on store pages and the account. */}
      <ProductRequestOverlay sandbox={sandbox} onSubmitRequestOverride={fakeRequest} />

      {/* Run panel — floats above the item screen. */}
      {run && (
        <aside
          className={`fixed bottom-3 left-3 z-[250] flex w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-ink/15 bg-white shadow-[0_20px_50px_-20px_rgba(32,36,43,0.5)] ${hudOpen ? 'max-h-[70vh]' : ''}`}
          aria-label="QA run"
        >
          <div className="flex items-center gap-2 border-b border-ink/10 px-3.5 py-2.5">
            {run.doneMs == null ? <Loader2 size={15} className="flex-none animate-spin text-teal-deep" /> : <Check size={15} className="flex-none text-teal-deep" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-ink">{hostOf(run.url)}</p>
              <p className="text-[11px] tabular-nums text-ink/50">
                {run.doneMs == null ? `Running… ${secs(elapsed)}` : `Done in ${secs(run.doneMs)}`}
                {run.firstContentMs != null && ` · first content ${secs(run.firstContentMs)}`}
              </p>
            </div>
            <button type="button" aria-label={hudOpen ? 'Collapse' : 'Expand'} onClick={() => setHudOpen((o) => !o)} className="grid h-7 w-7 place-items-center rounded-md text-ink/45 hover:bg-ink/5">
              {hudOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
            <button
              type="button"
              aria-label="Close run"
              onClick={() => {
                closeModal()
                setRun(null)
                runRef.current = null
              }}
              className="grid h-7 w-7 place-items-center rounded-md text-ink/45 hover:bg-ink/5"
            >
              <X size={15} />
            </button>
          </div>

          {hudOpen && (
            <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 text-xs">
              {run.outcome && (
                <div className="mb-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${OUTCOME_TONE[run.outcome]}`}>{OUTCOME_LABEL[run.outcome]}</span>
                  <p className="mt-1.5 text-[11px] leading-snug text-ink/55">{OUTCOME_HELP[run.outcome]}</p>
                </div>
              )}

              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink/40">Requests</p>
              {net.length === 0 ? (
                <p className="text-ink/40">Waiting…</p>
              ) : (
                <ol className="space-y-1.5">
                  {net.map((e, i) => {
                    const prev = net.filter((x) => x.kind === 'lookup' && x.id < e.id).pop()
                    const gap = e.kind === 'lookup' && prev?.endMs != null ? e.startMs - prev.endMs : null
                    const n = net.filter((x) => x.kind === e.kind && x.id <= e.id).length
                    return (
                      <li key={e.id} className="rounded-lg bg-parchment/70 px-2.5 py-1.5">
                        {gap != null && gap > 500 && <p className="mb-1 text-[10px] text-ink/45">waited {secs(gap)} before retrying</p>}
                        <p className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-ink/75">
                            {e.kind === 'preview' ? `Preview ${n > 1 ? `#${n}` : ''}` : `Full read #${n}`}
                            {e.path.includes('refresh=1') ? ' (refresh)' : ''}
                          </span>
                          <span className="tabular-nums text-ink/50">
                            {secs(e.startMs)} → {e.endMs != null ? `${secs(e.endMs)} (${secs(e.endMs - e.startMs)})` : '…'}
                          </span>
                        </p>
                        {e.summary && (
                          <p className={`mt-0.5 break-words ${e.status && e.status >= 400 ? 'text-rose-700' : e.summary.startsWith('error') ? 'text-rose-700' : 'text-ink/55'}`}>
                            {e.status ? `${e.status} · ` : ''}
                            {e.summary}
                          </p>
                        )}
                        {i === 0 && null}
                      </li>
                    )
                  })}
                </ol>
              )}

              <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-ink/40">What happened</p>
              <ol className="space-y-1">
                {log.map((l, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-11 flex-none tabular-nums text-ink/40">{secs(l.atMs)}</span>
                    <span className={l.tone === 'warn' ? 'text-gold-deep' : l.tone === 'good' ? 'text-teal-deep' : 'text-ink/65'}>{l.text}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-ink/10 pt-3">
                {current ? (
                  <>
                    <button
                      type="button"
                      onClick={() => saved.patch(current.id, { status: 'pass' })}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold ring-1 ring-inset ${current.status === 'pass' ? 'bg-teal/15 text-teal-deep ring-teal/30' : 'text-ink/60 ring-ink/10 hover:text-teal-deep'}`}
                    >
                      <ThumbsUp size={13} /> Works
                    </button>
                    <button
                      type="button"
                      onClick={() => saved.patch(current.id, { status: 'fail' })}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold ring-1 ring-inset ${current.status === 'fail' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'text-ink/60 ring-ink/10 hover:text-rose-600'}`}
                    >
                      <ThumbsDown size={13} /> Broken
                    </button>
                    <span className="inline-flex items-center gap-1 px-1 text-ink/45">
                      <BookmarkCheck size={13} /> Saved — this run is recorded
                    </span>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      saved.save(run.url, run.result?.title ?? null, run.doneMs != null && run.outcome
                        ? {
                            outcome: run.outcome,
                            ms: run.doneMs,
                            site: run.result?.site ?? null,
                            title: run.result?.title ?? null,
                            price: run.result?.price ? `${run.result.currencyCode ?? ''} ${run.result.price}`.trim() : null,
                            error: run.result?.error ?? null,
                            fresh: run.fresh,
                          }
                        : undefined)
                    }
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold text-teal-deep ring-1 ring-inset ring-teal/25 hover:bg-teal/5"
                  >
                    <Bookmark size={13} /> Save link{run.doneMs != null ? ' + this result' : ''}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!resultJson}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(JSON.stringify({ url: run.url, ms: run.doneMs, outcome: run.outcome, requests: net, result: resultJson }, null, 2))
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    } catch {
                      // clipboard blocked
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold text-ink/60 ring-1 ring-inset ring-ink/10 hover:text-ink disabled:opacity-40"
                >
                  {copied ? <Check size={13} /> : <Clipboard size={13} />} {copied ? 'Copied' : 'Copy JSON'}
                </button>
                {!modalOpen && run.doneMs != null && (
                  <button type="button" onClick={() => start(run.url)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold text-ink/60 ring-1 ring-inset ring-ink/10 hover:text-ink">
                    <Play size={13} /> Run again
                  </button>
                )}
              </div>
              {run.result?.error && (
                <p className="mt-2 flex items-start gap-1.5 break-words text-[11px] text-rose-700">
                  <AlertTriangle size={12} className="mt-px flex-none" /> {run.result.error}
                </p>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  )
}
