// app/demo/scraper-qa/ScraperQaClient.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ExternalLink,
  Loader2,
  Star,
  AlertTriangle,
  XCircle,
  Zap,
  CheckCircle2,
  Circle,
  MessageSquare,
  Flag,
  ThumbsUp,
  ThumbsDown,
  PackageX,
} from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import AmazonProductView from './platforms/AmazonProductView'
import FlipkartProductView from './platforms/FlipkartProductView'
import MeeshoProductView from './platforms/Meeshoproductview'
import MyntraProductView from './platforms/MyntraProductView'
import EbayProductView from './platforms/EbayProductView'
import AjioProductView from './platforms/AjioProductView'
import JioMartProductView from './platforms/JioMartProductView'
import SnapdealProductView from './platforms/SnapdealProductView'
import ShopifyProductView from './platforms/Shopifyproductview'
import WooCommerceProductView from './platforms/Woocommerceproductview'
import FirstCryProductView from './platforms/FirstCryProductView'
import NykaaProductView from './platforms/NykaaProductView'
import HopscotchProductView from './platforms/HopscotchProductView'
import TataCliqProductView from './platforms/TataCliqProductView'
import AliExpressProductView from './platforms/AliExpressProductView'
// PRESET_LINKS used to be a hardcoded array maintained by hand in this
// file. It's now derived from data/stores/data.ts's `affiliatedStores` —
// see `scraperTestLinks` there. To add a platform to this QA tool, set
// `sampleProductUrl` + `sampleProductLabel` on that store's entry in
// affiliatedStores; don't add a preset link here directly.
import { scraperTestLinks as PRESET_LINKS, type ScraperTestLink as PresetLink } from '@/data/stores/data'

//

// ---------- QA review state (per test case) ----------
type TestStatus = 'untested' | 'pass' | 'fail'

type CaseState = {
  status: TestStatus
  comment: string
}

const DEFAULT_CASE_STATE: CaseState = { status: 'untested', comment: '' }

const REVIEW_STORAGE_KEY = 'scraper-qa-review-v1'

function loadReviewState(): Record<string, CaseState> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(REVIEW_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}



function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-ink/10 ${className}`} />
}
 
function ProductSkeleton() {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5" aria-busy="true" aria-live="polite">
      <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Image gallery skeleton */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Bar key={i} className="h-12 w-12 flex-none" />
            ))}
          </div>
          <Bar className="aspect-square flex-1 rounded-lg" />
        </div>
 
        {/* Details skeleton */}
        <div>
          <Bar className="h-3 w-20 rounded-full" />
          <Bar className="mt-3 h-5 w-4/5" />
          <Bar className="mt-2 h-5 w-3/5" />
          <Bar className="mt-3 h-4 w-32" />
 
          <div className="mt-4 h-px w-full bg-ink/10" />
 
          <Bar className="mt-4 h-7 w-28" />
          <Bar className="mt-2 h-4 w-24" />
 
          {/* Variant swatches row */}
          <div className="mt-5">
            <Bar className="h-3 w-16" />
            <div className="mt-2 grid grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Bar key={i} className="aspect-square" />
              ))}
            </div>
          </div>
 
          {/* Size pill row */}
          <div className="mt-4">
            <Bar className="h-3 w-12" />
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Bar key={i} className="h-8 w-12 rounded-md" />
              ))}
            </div>
          </div>
 
          <Bar className="mt-4 h-5 w-20" />
 
          <div className="mt-3 flex flex-col gap-2 sm:max-w-[220px]">
            <Bar className="h-9 w-full rounded-full" />
            <Bar className="h-9 w-full rounded-full" />
          </div>
 
          <Bar className="mt-4 h-3 w-40" />
          <Bar className="mt-2 h-3 w-28" />
        </div>
      </div>
    </div>
  )
}
 

function StatusIcon({ status }: { status: TestStatus }) {
  if (status === 'pass') return <CheckCircle2 size={16} className="text-teal-deep" strokeWidth={2} />
  if (status === 'fail') return <XCircle size={16} className="text-red-500" strokeWidth={2} />
  return <Circle size={16} className="text-ink/25" strokeWidth={2} />
}

// ---------- User feedback on a live scrape result ----------
type FeedbackVerdict = 'correct' | 'incorrect'

type FeedbackEntry = {
  verdict: FeedbackVerdict | null
  comment: string
  submitted: boolean
}

const DEFAULT_FEEDBACK_ENTRY: FeedbackEntry = { verdict: null, comment: '', submitted: false }

const FEEDBACK_STORAGE_KEY = 'scraper-qa-feedback-v1'

function loadFeedbackState(): Record<string, FeedbackEntry> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(FEEDBACK_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

async function submitFeedback(payload: {
  url: string
  verdict: FeedbackVerdict
  comment: string
  result: ScrapeResult
}) {
  try {
    await fetch('/api/product-lookup/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Best-effort only — the local copy in FEEDBACK_STORAGE_KEY is the
    // source of truth for this session even if the network call fails.
  }
}

/** Small badge row for the currently-selected variant (Size, Color, ...). */
function OptionsRow({ options }: { options: Record<string, string> | null | undefined }) {
  if (!options || !Object.keys(options).length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {Object.entries(options).map(([label, value]) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-ink/60 ring-1 ring-inset ring-ink/10"
        >
          <span className="text-ink/40">{label}:</span> {value}
        </span>
      ))}
    </div>
  )
}

/** Renders 1–5 filled/outline stars from the scraper's raw rating string. */
function RatingStars({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  const rounded = Math.round(value)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={13}
            className={i < rounded ? 'fill-gold-deep text-gold-deep' : 'fill-transparent text-ink/20'}
            strokeWidth={1.5}
          />
        ))}
      </span>
      <span className="text-xs font-semibold text-ink/60">
        {value.toFixed(1)}
        {count && <span className="font-normal text-ink/40"> ({count})</span>}
      </span>
    </span>
  )
}

/** Small inline fact list — only renders what the scraper actually returned. */
function SpecRow({ result }: { result: ScrapeResult }) {
  const specs: string[] = []
  if (result.site) specs.push(result.site)
  if (result.source) {
    specs.push(
      result.source === 'direct'
        ? 'fetched directly'
        : result.source === 'shopify_api'
          ? "via Shopify's product API"
          : result.source === 'woocommerce_api'
            ? "via WooCommerce's Store API"
            : 'via ScraperAPI'
    )
  }
  if (result.seller) specs.push(`Sold by ${result.seller}`)
  if (!specs.length) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink/45">
      {specs.map((s, i) => (
        <span key={s} className="inline-flex items-center gap-2.5">
          {i > 0 && <span className="text-ink/20">·</span>}
          {s}
        </span>
      ))}
    </div>
  )
}

/** Simple thumbnail strip + main image. */
function ImageStrip({ images, alt }: { images: string[]; alt: string }) {
  if (!images.length) {
    return (
      <div className="grid aspect-square place-items-center rounded-2xl border border-dashed border-ink/15 bg-card text-xs font-medium text-ink/35">
        No images found
      </div>
    )
  }
  const [main, ...rest] = images
  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-2xl border border-ink/10 bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={main} alt={alt} className="h-full w-full object-contain" />
      </div>
      {rest.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {rest.slice(0, 9).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              className="aspect-square rounded-lg border border-ink/10 bg-card object-contain"
            />
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] font-medium text-ink/35">{images.length} image{images.length === 1 ? '' : 's'} found</p>
    </div>
  )
}

function fmtPrice(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(amount) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'LKR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

/** Amazon-style clickable variant grid — each tile shows the option's
 * thumbnail, label, and price (when the scraper found one). Clicking a
 * non-selected tile re-runs the scrape against THAT variant's own URL,
 * same as clicking a swatch on Amazon itself — a full live re-fetch, not
 * a local price swap. Tiles with no resolvable link are shown but
 * disabled rather than silently omitted, so a reviewer can see the
 * extractor found the option even if it couldn't find a link for it.
 * Tiles the extractor flagged `outOfStock` (currently Flipkart and
 * Myntra — see flipkart.ts's per-tile "Out Of Stock" badge detection and
 * myntra.ts's size-tile disabled/out-of-stock class detection) are
 * likewise disabled, desaturated, and labeled distinctly from a
 * merely-linkless tile, so a reviewer can tell "this option is
 * genuinely sold out" apart from "the scraper just didn't find a URL".
 * Shopify and WooCommerce's tiles (see parsers.ts's
 * buildStoreVariantDimensions) are always linkless by design — their one
 * API call already returns every variant's price/stock, so there's
 * nothing left to re-fetch by "selecting" a tile — and render the same
 * way: visible, informational, non-clickable.
 *
 * This is now only used by the last-resort fallback below (a truly
 * unrecognized `site` value). Every known platform — Amazon, Flipkart,
 * Meesho, Myntra, eBay, Ajio, JioMart, Snapdeal, Shopify, WooCommerce,
 * FirstCry, Nykaa, Hopscotch, Tata CLiQ, and AliExpress — has its own
 * dedicated view under ./platforms instead. */
function VariantPicker({
  variants,
  onSelect,
}: {
  variants: NonNullable<ScrapeResult['variants']>
  onSelect: (url: string) => void
}) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      {variants.map((dim) => (
        <div key={dim.dimension}>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">
            {dim.dimension}
          </p>
          <div className="flex flex-wrap gap-2">
            {dim.options.map((opt) => {
              const priceLabel = fmtPrice(opt.price, opt.currencyCode)
              const clickable = !!opt.url && !opt.selected && !opt.outOfStock
              return (
                <button
                  key={opt.label}
                  type="button"
                  disabled={!clickable}
                  onClick={() => opt.url && onSelect(opt.url)}
                  title={
                    opt.outOfStock
                      ? 'Out of stock'
                      : opt.url
                        ? undefined
                        : 'No direct link found for this option'
                  }
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                    opt.selected
                      ? 'border-teal bg-teal/10'
                      : opt.outOfStock
                        ? 'cursor-not-allowed border-ink/8 bg-card/50 opacity-40 grayscale'
                        : clickable
                          ? 'border-ink/12 bg-card hover:border-teal/50'
                          : 'cursor-not-allowed border-ink/8 bg-card/50 opacity-50'
                  }`}
                >
                  {opt.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={opt.image} alt={opt.label} className="h-10 w-10 rounded-md object-contain" />
                  )}
                  <span className="max-w-[80px] truncate text-[11px] font-semibold text-ink/75">
                    {opt.label}
                  </span>
                  {opt.outOfStock ? (
                    <span className="text-[9px] font-bold uppercase text-red-500">Out of stock</span>
                  ) : (
                    priceLabel && <span className="text-[10px] font-bold text-teal-deep">{priceLabel}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}


export default function ScraperQaClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlFromQuery = searchParams.get('url') ?? ''

  const [inputValue, setInputValue] = useState(urlFromQuery)
  const [activeUrl, setActiveUrl] = useState(urlFromQuery)
  const [result, setResult] = useState<ScrapeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  const [reviewState, setReviewState] = useState<Record<string, CaseState>>({})
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())
  const [openNotesFor, setOpenNotesFor] = useState<Set<string>>(new Set())

  const [feedbackState, setFeedbackState] = useState<Record<string, FeedbackEntry>>({})

  // Gates prefillUnavailableNote (called from inside an async fetch
  // .then, well after mount) so it doesn't fire before the load effect
  // below has had a chance to populate reviewState from localStorage.
  // Not used to gate the save effects anymore — see reviewSaveSkip /
  // feedbackSaveSkip below for why that needs its own, independent
  // ref per effect rather than one shared flag.
  const hydrated = useRef(false)

  // Each save effect must skip its OWN first run, not just check a
  // shared "have we loaded yet" flag. On mount, the load effect below
  // calls setReviewState(loaded)/setFeedbackState(loaded) — both async,
  // batched updates — and sets hydrated.current = true synchronously in
  // the same pass. The two save effects then run in that SAME commit,
  // see hydrated.current already true, and would write their CURRENT
  // closure value (still the original `{}` from the very first render,
  // since the load's setState hasn't been applied yet) straight to
  // localStorage — silently overwriting whatever was already saved
  // there, a heartbeat before the real loaded value gets written back
  // on the next render. Usually invisible, but anything that reads
  // localStorage in that window (another tab, a fast unmount) sees the
  // wipe. A per-effect "skip my first run" ref sidesteps this
  // regardless of effect ordering or how many renders the load takes.
  const reviewSaveSkip = useRef(true)
  const feedbackSaveSkip = useRef(true)

  useEffect(() => {
    setReviewState(loadReviewState())
    setFeedbackState(loadFeedbackState())
    hydrated.current = true
  }, [])

  useEffect(() => {
    if (reviewSaveSkip.current) {
      reviewSaveSkip.current = false
      return
    }
    try {
      window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviewState))
    } catch {
      // best-effort only
    }
  }, [reviewState])

  useEffect(() => {
    if (feedbackSaveSkip.current) {
      feedbackSaveSkip.current = false
      return
    }
    try {
      window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(feedbackState))
    } catch {
      // best-effort only
    }
  }, [feedbackState])

  // Reads from the LIVE reviewState — fine for rendering, where a
  // render always has the current committed state. NOT safe to call
  // from inside a setReviewState updater (its `prev` argument may be
  // newer than this closure's `reviewState`) — every updater below
  // reads `prev[url]` directly instead, for exactly that reason.
  function getCase(url: string): CaseState {
    return reviewState[url] ?? DEFAULT_CASE_STATE
  }

  function getFeedback(url: string): FeedbackEntry {
    return feedbackState[url] ?? DEFAULT_FEEDBACK_ENTRY
  }

  function cycleStatus(url: string) {
    setReviewState((prev) => {
      const current = prev[url] ?? DEFAULT_CASE_STATE
      const next: TestStatus =
        current.status === 'untested' ? 'pass' : current.status === 'pass' ? 'fail' : 'untested'
      return { ...prev, [url]: { ...current, status: next } }
    })
  }

  function setComment(url: string, comment: string) {
    setReviewState((prev) => ({
      ...prev,
      [url]: { ...(prev[url] ?? DEFAULT_CASE_STATE), comment },
    }))
  }

  function prefillUnavailableNote(url: string) {
    // Can fire from inside the fetch `.then` before the load effect has
    // run, on a page opened directly with `?url=...`. At that point
    // reviewState is still empty, so bail rather than stamp a note that
    // the load effect would then appear to "erase" a moment later.
    if (!hydrated.current) return
    setReviewState((prev) => {
      // FIX: was `getCase(url)`, which reads the `reviewState` this
      // closure was created with — a snapshot from whenever the
      // enclosing effect last re-ran (i.e. whenever `activeUrl` last
      // changed), NOT from whenever this fetch actually resolves. If
      // you changed this URL's status or note anywhere in between —
      // easy to do, since this fires from an async .then after a real
      // network round trip — that edit lived only in `prev`, and this
      // update would silently overwrite the whole per-URL object with
      // the stale snapshot plus the new comment, discarding it. Always
      // derive `current` from `prev` inside a setState updater.
      const current = prev[url] ?? DEFAULT_CASE_STATE
      if (current.comment) return prev
      return {
        ...prev,
        [url]: {
          ...current,
          comment: 'Auto-flagged: no buybox/add-to-cart detected — looked like a genuinely unavailable listing, not a scrape failure. Confirm or correct.',
        },
      }
    })
  }

  function setFeedbackVerdict(url: string, verdict: FeedbackVerdict) {
    setFeedbackState((prev) => ({
      ...prev,
      [url]: { ...(prev[url] ?? DEFAULT_FEEDBACK_ENTRY), verdict, submitted: false },
    }))
  }

  function setFeedbackComment(url: string, comment: string) {
    setFeedbackState((prev) => ({
      ...prev,
      [url]: { ...(prev[url] ?? DEFAULT_FEEDBACK_ENTRY), comment },
    }))
  }

  function handleFeedbackSubmit(url: string, currentResult: ScrapeResult) {
    const entry = getFeedback(url)
    if (!entry.verdict) return
    setFeedbackState((prev) => ({
      ...prev,
      [url]: { ...(prev[url] ?? DEFAULT_FEEDBACK_ENTRY), submitted: true },
    }))
    submitFeedback({ url, verdict: entry.verdict, comment: entry.comment, result: currentResult })
  }

  function toggleSelected(url: string) {
    setSelectedUrls((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  function toggleNotesOpen(url: string) {
    setOpenNotesFor((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  function bulkMark(status: TestStatus) {
    setReviewState((prev) => {
      const next = { ...prev }
      selectedUrls.forEach((url) => {
        next[url] = { ...(prev[url] ?? DEFAULT_CASE_STATE), status }
      })
      return next
    })
  }

  const passCount = PRESET_LINKS.filter((p) => getCase(p.url).status === 'pass').length
  const failCount = PRESET_LINKS.filter((p) => getCase(p.url).status === 'fail').length
  const untestedCount = PRESET_LINKS.length - passCount - failCount

  function runLookup(targetUrl: string) {
    const trimmed = targetUrl.trim()
    if (!trimmed) return
    setInputValue(trimmed)
    setActiveUrl(trimmed)
    router.push(`${pathname}?url=${encodeURIComponent(trimmed)}`, { scroll: false })
  }

  const SCRAPE_TIMEOUT_MS = 320_000 

  useEffect(() => {
    if (!activeUrl) return
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS)

    setLoading(true)
    setRequestError(null)
    // NOTE: `result` is deliberately not cleared here. While `loading`
    // is true we always render the skeleton (see below), so it doesn't
    // matter that the old result is still in state — but keeping it
    // means that if this fetch fails, the `.catch` below can leave the
    // last good result in place instead of wiping it.

    // needVariants=true: this QA tool exists to inspect size/color
    // pickers, so it always opts into the extra render-tier fallback in
    // scrapeProduct() for sites (currently Flipkart and Myntra) whose
    // variant data is only present after client-side hydration. Other,
    // non-QA callers of this same endpoint should omit the param to stay
    // on the fast/cheap path — see scrapeProduct()'s ScrapeProductOptions.
    fetch(`/api/product-lookup?url=${encodeURIComponent(activeUrl)}&needVariants=true`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error((body && body.error) || `Request failed (${res.status})`)
        }
        return body as ScrapeResult
      })
      .then((data) => {
        if (!cancelled) {
          setResult(data)
          if (data.unavailable) {
            prefillUnavailableNote(activeUrl)
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const isTimeout = err instanceof DOMException && err.name === 'AbortError'
          setRequestError(
            isTimeout
              ? 'Scrape timed out after 60s — the target site took too long to respond.'
              : err instanceof Error
                ? err.message
                : 'Request failed'
          )
          // Intentionally not clearing `result` here — if a variant
          // re-fetch fails we keep showing the last successful result
          // rather than wiping the whole panel; the error surfaces as
          // an inline banner above the (still visible) stale result.
        }
      })
      .finally(() => {
        clearTimeout(timeoutId)
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [activeUrl])

  const isAmazonResult = !!result && !result.error && result.site === 'amazon'
  const isFlipkartResult = !!result && !result.error && result.site === 'flipkart'
  const isMeeshoResult = !!result && !result.error && result.site === 'meesho'
  const isMyntraResult = !!result && !result.error && result.site === 'myntra'
  const isEbayResult = !!result && !result.error && result.site === 'ebay'
  const isAjioResult = !!result && !result.error && result.site === 'ajio'
  const isJioMartResult = !!result && !result.error && result.site === 'jiomart'
  const isSnapdealResult = !!result && !result.error && result.site === 'snapdeal'
  const isShopifyResult = !!result && !result.error && result.site === 'shopify'
  const isWooCommerceResult = !!result && !result.error && result.site === 'woocommerce'
  // Newer look-alike views — see ./platforms/shared.tsx for the reusable
  // building blocks these five use, and the note on each platform file
  // about the exact ScrapeResult.site casing it matches.
  const isFirstCryResult = !!result && !result.error && result.site === 'firstcry'
  const isNykaaResult = !!result && !result.error && result.site === 'nykaa'
  const isHopscotchResult = !!result && !result.error && result.site === 'hopscotch'
  const isTataCliqResult = !!result && !result.error && result.site === 'tataCliq'
  const isAliExpressResult = !!result && !result.error && result.site === 'Aliexpress'

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-8 lg:px-10">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Scrape test
        </h1>
        <p className="mt-1 text-sm text-ink/55">
          Calls <code className="rounded bg-card px-1.5 py-0.5 text-xs">/api/product-lookup</code> against a real
          URL, live, right now. Nothing here is cached or mocked.
        </p>
      </div>
      <div className="mt-6">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            runLookup(inputValue)
          }}
          className="flex gap-2"
        >
          <input
            type="url"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Paste a product URL — Amazon, Flipkart, Meesho, eBay, Myntra…"
            className="flex-1 rounded-xl border border-ink/15 bg-card px-4 py-3 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-teal"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="flex flex-none items-center gap-2 rounded-xl bg-teal px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Scrape
          </button>
        </form>
      </div>
      <div className="mt-6 grid gap-8 lg:grid-cols-[380px_1fr] lg:items-start">
        {/* Left column: URL input + vertical platform/test-case list */}
        <div>
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">
              Test cases
            </p>
            <div className="flex items-center gap-3 text-[11px] font-semibold text-ink/45">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 size={12} className="text-teal-deep" /> {passCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <XCircle size={12} className="text-red-500" /> {failCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <Circle size={12} className="text-ink/25" /> {untestedCount}
              </span>
            </div>
          </div>

          {selectedUrls.size > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-card px-3 py-2">
              <span className="text-[11px] font-semibold text-ink/50">
                {selectedUrls.size} selected
              </span>
              <button
                type="button"
                onClick={() => bulkMark('pass')}
                className="rounded-lg bg-teal/10 px-2.5 py-1 text-[11px] font-bold text-teal-deep hover:bg-teal/20"
              >
                Mark passed
              </button>
              <button
                type="button"
                onClick={() => bulkMark('fail')}
                className="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-500 hover:bg-red-100"
              >
                Mark failed
              </button>
              <button
                type="button"
                onClick={() => bulkMark('untested')}
                className="rounded-lg bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-ink/50 hover:bg-ink/10"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setSelectedUrls(new Set())}
                className="ml-auto text-[11px] font-semibold text-ink/35 hover:text-ink/60"
              >
                Clear selection
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {PRESET_LINKS.map((preset) => {
              const active = activeUrl === preset.url
              const caseState = getCase(preset.url)
              const isSelected = selectedUrls.has(preset.url)
              const notesOpen = openNotesFor.has(preset.url)

              return (
                <div
                  key={preset.url}
                  className={`rounded-xl border px-3 py-2.5 transition-colors ${
                    active
                      ? 'border-teal bg-teal/10'
                      : isSelected
                        ? 'border-teal/40 bg-teal/5'
                        : 'border-ink/12 bg-card'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(preset.url)}
                      className="h-4 w-4 flex-none rounded border-ink/30 accent-teal"
                      aria-label={`Select ${preset.label} test case`}
                    />

                    <button
                      type="button"
                      onClick={() => runLookup(preset.url)}
                      disabled={loading}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {active && loading ? (
                        <Loader2 size={13} className="flex-none animate-spin text-teal-deep" />
                      ) : (
                        <Zap
                          size={13}
                          className={`flex-none ${active ? 'text-teal-deep' : 'text-ink/35'}`}
                          strokeWidth={2}
                        />
                      )}
                      <span className="flex-none text-xs font-bold text-ink/80">{preset.label}</span>
                      <span className="truncate text-[11px] font-medium text-ink/45">
                        {preset.product}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleNotesOpen(preset.url)}
                      className={`flex-none rounded-md p-1 ${
                        notesOpen || caseState.comment
                          ? 'text-teal-deep'
                          : 'text-ink/30 hover:text-ink/55'
                      }`}
                      title="Add a note about this test case"
                      aria-label="Toggle notes"
                    >
                      <MessageSquare size={14} strokeWidth={2} />
                    </button>

                    <button
                      type="button"
                      onClick={() => cycleStatus(preset.url)}
                      className="flex-none rounded-md p-1 hover:bg-ink/5"
                      title="Click to cycle: untested → pass → fail"
                      aria-label={`Mark ${preset.label} status`}
                    >
                      <StatusIcon status={caseState.status} />
                    </button>
                  </div>

                  {notesOpen && (
                    <textarea
                      value={caseState.comment}
                      onChange={(e) => setComment(preset.url, e.target.value)}
                      placeholder="Notes about this test case — what you saw, what broke, follow-ups…"
                      rows={2}
                      className="mt-2 w-full rounded-lg border border-ink/15 bg-white/70 px-2.5 py-2 text-xs text-ink placeholder:text-ink/35 outline-none focus:border-teal"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
        </div>

        {/* Right column: result of the active scrape */}
        <div className="lg:sticky lg:top-8 mt-6">
        {!activeUrl && !result && !loading && (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-ink/15 bg-card/60 px-6 text-center">
            <p className="text-xs text-ink/40">Paste any marketplace product URL, or pick a platform on the left.</p>
          </div>
        )}

        {/* Skeleton covers both the very first lookup AND every
            variant/size re-fetch — no "Scraping…" text, no spinner
            pill, just the shape of the layout that's about to fill in. */}
        {loading && <ProductSkeleton />}

        {/* Hard failure with nothing to fall back on (first load failed). */}
        {!loading && requestError && !result && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-300/40 bg-red-50 p-5">
            <XCircle size={18} className="mt-0.5 flex-none text-red-500" strokeWidth={1.8} />
            <div>
              <p className="text-sm font-semibold text-ink">Request failed</p>
              <p className="mt-1 text-xs text-ink/60">{requestError}</p>
            </div>
          </div>
        )}

        {!loading && result && result.error && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-300/40 bg-red-50 p-5">
            <XCircle size={18} className="mt-0.5 flex-none text-red-500" strokeWidth={1.8} />
            <div>
              <p className="text-sm font-semibold text-ink">Scrape failed</p>
              <p className="mt-1 text-xs text-ink/60">{result.error}</p>
            </div>
          </div>
        )}
                {!loading && result && !result.error && (
          <div>
            {/* If a variant re-fetch failed, keep the stale result
                visible and surface the failure inline instead of
                wiping the panel. */}
            {requestError && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                <AlertTriangle size={13} className="flex-none" />
                {requestError} — showing the last successful result.
              </div>
            )}

            {/* Distinct amber "unavailable" card — the scraper positively
                reporting "nothing to sell here", not a scrape failure. */}
            {result.unavailable && (
              <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
                <PackageX size={16} className="mt-0.5 flex-none text-gold-deep" strokeWidth={1.8} />
                <div>
                  <p className="text-xs font-bold text-ink/80">Listing appears unavailable</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink/60">
                    No buy button or price block was found on this page at all — likely a
                    retired or out-of-stock variant, not a scraper bug. If this looks wrong,
                    use the feedback box below to flag it.
                  </p>
                </div>
              </div>
            )}

            {result.warning && !result.unavailable && (
              <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
                <AlertTriangle size={15} className="mt-0.5 flex-none text-gold-deep" strokeWidth={1.8} />
                <p className="text-xs leading-relaxed text-ink/70">{result.warning}</p>
              </div>
            )}

            {/* Every recognized platform gets its own look-alike layout so
                a reviewer can eyeball a match against the real site
                (Shopify/WooCommerce's views use the app's own design
                tokens rather than imitating a fake storefront skin — see
                those components' doc comments — but still replace this
                generic layout the same way the others do). Only a true
                `generic` result (a genuinely unrecognized site) falls
                through to the plain layout below. */}
            {isAmazonResult ? (
              <AmazonProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isFlipkartResult ? (
              <FlipkartProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isMeeshoResult ? (
              <MeeshoProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isMyntraResult ? (
              <MyntraProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isEbayResult ? (
              <EbayProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isAjioResult ? (
              <AjioProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isJioMartResult ? (
              <JioMartProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isSnapdealResult ? (
              <SnapdealProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isShopifyResult ? (
              <ShopifyProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isWooCommerceResult ? (
              <WooCommerceProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isFirstCryResult ? (
              <FirstCryProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isNykaaResult ? (
              <NykaaProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isHopscotchResult ? (
              <HopscotchProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isTataCliqResult ? (
              <TataCliqProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : isAliExpressResult ? (
              <AliExpressProductView result={result} onSelectVariant={(url) => runLookup(url)} />
            ) : (
              <div className="grid gap-8 sm:grid-cols-2">
                <ImageStrip images={result.images ?? []} alt={result.title ?? 'Product image'} />

                <div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-0.5 ring-1 ring-inset ring-ink/10">
                      <Zap size={11} className="text-teal-deep" strokeWidth={2} />
                      {result.site ?? 'unknown'}
                    </span>
                    {result.rating && (
                      <>
                        <span className="text-ink/20">·</span>
                        <RatingStars rating={result.rating} count={result.review_count} />
                      </>
                    )}
                  </div>

                  <h2 className="mt-2 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
                    {result.title ?? <span className="italic text-ink/35">No title found</span>}
                  </h2>

                  <SpecRow result={result} />
                  <OptionsRow options={result.options} />

                  <div className="mt-3 flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-teal-deep">
                      {fmtPrice(result.price, result.currencyCode) ?? (
                        <span className="text-base font-semibold text-ink/35">No price found</span>
                      )}
                    </p>
                    {result.mrp && result.mrp !== result.price && (
                      <p className="text-sm font-semibold text-ink/40 line-through">
                        {fmtPrice(result.mrp, result.currencyCode)}
                      </p>
                    )}
                  </div>

                  {result.availability && (
                    <p className="mt-2 inline-block rounded-md bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/55 ring-1 ring-inset ring-ink/10">
                      {result.availability}
                    </p>
                  )}

                  {/* Full variant/swatch picker — Amazon-style, click to
                      re-scrape that variant's own page live. */}
                  {result.variants && result.variants.length > 0 && (
                    <VariantPicker variants={result.variants} onSelect={(url) => runLookup(url)} />
                  )}

                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-ink/45 transition-colors hover:text-ink"
                  >
                    Open original listing <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}

            <details className="group mt-6 rounded-2xl border border-ink/10 bg-card">
              <summary className="cursor-pointer list-none px-4 py-3 text-xs font-bold uppercase tracking-wide text-ink/55">
                Raw response
                <span className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all border-t border-ink/10 px-4 py-3 text-[11px] leading-relaxed text-ink/60">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}