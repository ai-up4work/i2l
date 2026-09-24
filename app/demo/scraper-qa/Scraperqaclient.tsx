// app/demo/scraper-qa/ScraperQaClient.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
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
  Search,
  X,
  Clock,
  RotateCcw,
  Copy,
  Check,
  Tag,
} from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import { SITE_LOGOS } from '@/lib/platform-logos'
// NOTE: the canonical source of truth for affiliatedStores / SITE_LOGOS_SQUARE /
// scraperTestLinks is data/stores/data.ts (components/dashboard/data.ts is the
// re-export shim in the other direction). Pointing these imports at
// '@/data/stores/data' rather than a '@/data/stores/demo' module that doesn't
// appear to exist per the documented file layout. If your repo does have a
// legitimate '@/data/stores/demo' re-export, revert this import back to it.
import { SITE_LOGOS_SQUARE, scraperTestLinks as PRESET_LINKS, type ScraperTestLink as PresetLink } from '@/data/stores/demo'
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

// ---------------------------------------------------------------------
// Site helpers (client-safe)
//
// parsers.ts's detectSite() can't be imported here — it pulls cheerio,
// Playwright and every extractor into the client bundle. This is a small
// hostname-only mirror of its SITE_HOST_MAP, used ONLY to pick a logo and
// a display name for a URL before/without a scrape result. Keep the
// needles in sync with SITE_HOST_MAP when a platform is added.
// ---------------------------------------------------------------------

const HOST_NEEDLES: Array<[string, string]> = [
  ['amazon', 'amazon'],
  ['flipkart', 'flipkart'],
  ['meesho', 'meesho'],
  ['myntra', 'myntra'],
  ['ebay', 'ebay'],
  ['ajio', 'ajio'],
  ['snapdeal', 'snapdeal'],
  ['jiomart', 'jiomart'],
  ['firstcry', 'firstcry'],
  ['nykaa', 'nykaa'],
  ['hopscotch', 'hopscotch'],
  ['tatacliq', 'tatacliq'],
  ['aliexpress', 'aliexpress'],
  ['westside', 'westside'],
  ['boat-lifestyle', 'boat'],
  ['seleqt', 'seleqt'],
]

const SITE_NAMES: Record<string, string> = {
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  meesho: 'Meesho',
  myntra: 'Myntra',
  ebay: 'eBay',
  ajio: 'Ajio',
  snapdeal: 'Snapdeal',
  jiomart: 'JioMart',
  firstcry: 'FirstCry',
  nykaa: 'Nykaa',
  hopscotch: 'Hopscotch',
  tatacliq: 'Tata CLiQ',
  aliexpress: 'AliExpress',
  westside: 'Westside',
  boat: 'boAt Lifestyle',
  seleqt: 'Seleqt',
  shopify: 'Shopify store',
  woocommerce: 'WooCommerce store',
  generic: 'Unrecognised site',
}

/** Lowercased logo/name key for a URL, or null when nothing matches. */
function siteKeyForUrl(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  for (const [needle, key] of HOST_NEEDLES) if (host.includes(needle)) return key
  if (/\/products\/[^/?#]+/i.test(u.pathname)) return 'shopify'
  if (/\/product\/[^/?#]+\/?$/i.test(u.pathname)) return 'woocommerce'
  return null
}

/** ScrapeResult['site'] -> the lowercase key SITE_LOGOS/SITE_NAMES use
 * ('tataCliq' and 'Aliexpress' are mixed-case in the SiteId union). */
function normalizeSite(site: string | null | undefined): string | null {
  return site ? site.toLowerCase() : null
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Brand tile: the platform's logo from SITE_LOGOS, or an initial when
 * no logo file exists for that key (e.g. aliexpress today). */
function SiteLogo({ site, size = 'md' }: { site: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const src = site ? SITE_LOGOS[site] : undefined
  const name = (site && SITE_NAMES[site]) || site || 'Unknown'
  const box = size === 'lg' ? 'h-12 w-16' : size === 'sm' ? 'h-7 w-9' : 'h-9 w-12'
  return (
    <span
      className={`relative grid flex-none place-items-center overflow-hidden rounded-lg border border-ink/10 bg-white ${box}`}
    >
      {src ? (
        <Image src={src} alt={name} fill sizes="64px" className="object-contain p-1" />
      ) : (
        <span className="text-xs font-bold text-ink/35">{name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  )
}

// FIX: this was previously declared/used as `siteLogoSquared` (lowercase
// first letter). JSX treats a lowercase-leading tag name as a literal DOM
// element, not a component reference — so `<siteLogoSquared ... />` was
// never actually calling this function. React just tried to mount an
// unknown custom element `<sitelogosquared>` and passed `site`/`size`/
// `className` through as raw (nonsensical) DOM attributes. Renamed to
// `SiteLogoSquared` so JSX resolves it as a component, and added the
// `className` prop it's called with at the usage site below (previously
// undeclared and silently dropped).
function SiteLogoSquared({
  site,
  size = 'md',
  className = '',
}: {
  site: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const src = site ? SITE_LOGOS_SQUARE[site] : undefined
  const name = (site && SITE_NAMES[site]) || site || 'Unknown'
  const box = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  return (
    <span
      className={`relative grid flex-none place-items-center overflow-hidden bg-white ${box} ${className}`}
    >
      {src ? (
        <Image src={src} alt={name} fill sizes="64px" className="object-contain" />
      ) : (
        <span className="text-xs font-bold text-ink/35">{name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  )
}

// ---------- Fetch-tier labels ----------
// `tone` flags cost: 'paid' = a metered fallback tier was needed, which is
// exactly what a reviewer wants to notice when a platform "works".
type ChipTone = 'neutral' | 'teal' | 'gold' | 'red'

const SOURCE_INFO: Record<NonNullable<ScrapeResult['source']>, { label: string; tone: ChipTone }> = {
  direct: { label: 'Direct fetch', tone: 'neutral' },
  shopify_api: { label: "Shopify's product API", tone: 'teal' },
  woocommerce_api: { label: "WooCommerce's Store API", tone: 'teal' },
  ebay_api: { label: "eBay's Browse API", tone: 'teal' },
  parsebot: { label: 'Parse.bot API', tone: 'teal' },
  scraperapi: { label: 'ScraperAPI proxy (paid)', tone: 'gold' },
  scrapingdog: { label: 'Scrapingdog (paid)', tone: 'gold' },
  scrape_do: { label: 'scrape.do (paid)', tone: 'gold' },
  fingerprint_fetch: { label: 'TLS-fingerprint fetch', tone: 'gold' },
}

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'bg-ink/5 text-ink/60 ring-ink/10',
  teal: 'bg-teal/10 text-teal-deep ring-teal/20',
  gold: 'bg-gold/15 text-gold-deep ring-gold/30',
  red: 'bg-red-50 text-red-600 ring-red-200',
}

function Chip({ tone = 'neutral', icon, children }: { tone?: ChipTone; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${CHIP_TONES[tone]}`}
    >
      {icon}
      {children}
    </span>
  )
}

// ---------- QA review state (per test case) ----------
type TestStatus = 'untested' | 'pass' | 'fail'
type StatusFilter = 'all' | TestStatus

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

/** Sits above the skeleton while a scrape is in flight: which site, and a
 * live seconds counter — scrapes can take a minute or more once they fall
 * through to a paid fallback tier, and a silent skeleton looks hung. */
function LoadingBanner({ url }: { url: string }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const site = siteKeyForUrl(url)
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3">
      <SiteLogo site={site} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Loader2 size={14} className="animate-spin text-teal-deep" />
          Scraping {hostnameOf(url)}
        </p>
        <p className="mt-0.5 text-xs text-ink/45">
          {secs >= 20
            ? 'Taking a while — it has probably fallen through to a hosted fallback tier.'
            : 'Fetching, then falling back tier by tier if the site blocks us.'}
        </p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-ink/50">
        <Clock size={12} />
        {secs}s
      </span>
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

function FeedbackBox({
  entry,
  onVerdict,
  onComment,
  onSubmit,
}: {
  entry: FeedbackEntry
  onVerdict: (verdict: FeedbackVerdict) => void
  onComment: (comment: string) => void
  onSubmit: () => void
}) {
  return (
    <section className="mt-6 rounded-2xl border border-ink/10 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Flag size={14} className="text-ink/40" />
          <p className="text-sm font-semibold text-ink">Is this result accurate?</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onVerdict('correct')}
            aria-pressed={entry.verdict === 'correct'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ring-1 ring-inset transition-colors ${
              entry.verdict === 'correct'
                ? 'bg-teal/15 text-teal-deep ring-teal/40'
                : 'bg-white text-ink/55 ring-ink/10 hover:text-teal-deep hover:ring-teal/30'
            }`}
          >
            <ThumbsUp size={13} /> Looks right
          </button>
          <button
            type="button"
            onClick={() => onVerdict('incorrect')}
            aria-pressed={entry.verdict === 'incorrect'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ring-1 ring-inset transition-colors ${
              entry.verdict === 'incorrect'
                ? 'bg-red-50 text-red-600 ring-red-300'
                : 'bg-white text-ink/55 ring-ink/10 hover:text-red-500 hover:ring-red-200'
            }`}
          >
            <ThumbsDown size={13} /> Something&apos;s off
          </button>
        </div>
      </div>

      {entry.verdict && (
        <div className="mt-3">
          <textarea
            value={entry.comment}
            onChange={(e) => onComment(e.target.value)}
            rows={2}
            placeholder={
              entry.verdict === 'incorrect'
                ? 'What is wrong — price, sizes, images, availability…?'
                : 'Optional note'
            }
            className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs text-ink outline-none placeholder:text-ink/35 focus:border-teal"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-teal-deep">
              {entry.submitted ? (
                <span className="inline-flex items-center gap-1">
                  <Check size={12} /> Saved — thanks
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={onSubmit}
              disabled={entry.submitted}
              className="rounded-lg bg-teal px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send feedback
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/** Small badge row for the variant options currently selected in the view. */
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
 * Tiles the extractor flagged `outOfStock` are likewise disabled,
 * desaturated, and labeled distinctly from a merely-linkless tile, so a
 * reviewer can tell "this option is genuinely sold out" apart from "the
 * scraper just didn't find a URL".
 *
 * Only used by the last-resort fallback below (a `site` with no
 * dedicated view here). Every platform routed in renderPlatformView()
 * has its own view under ./platforms instead. */
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
          <p className="mb-1.5 text-xs font-semibold text-ink/50">{dim.dimension}</p>
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

/** Plain layout for a site with no dedicated view (e.g. westside, seleqt,
 * or a truly unrecognised store). */
function GenericResult({
  result,
  siteKey,
  onSelectVariant,
}: {
  result: ScrapeResult
  siteKey: string | null
  onSelectVariant: (url: string) => void
}) {
  return (
    <div className="grid gap-8 rounded-2xl border border-ink/10 bg-white p-5 sm:grid-cols-2">
      <ImageStrip images={result.images ?? []} alt={result.title ?? 'Product image'} />

      <div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
          <SiteLogo site={siteKey} size="sm" />
          <span>{(siteKey && SITE_NAMES[siteKey]) ?? result.site ?? 'unknown'}</span>
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

        {result.seller && <p className="mt-1 text-xs text-ink/45">Sold by {result.seller}</p>}
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
          <p className="mt-2 inline-block rounded-md bg-card px-2 py-0.5 text-[11px] font-semibold text-ink/55 ring-1 ring-inset ring-ink/10">
            {result.availability}
          </p>
        )}

        {result.variants && result.variants.length > 0 && (
          <VariantPicker variants={result.variants} onSelect={onSelectVariant} />
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
  )
}

// ---------- Result header + field coverage ----------

type RunMeta = { ms: number; attempts: number }

function CoverageStrip({ result }: { result: ScrapeResult }) {
  const checks: { label: string; ok: boolean; detail?: string }[] = [
    { label: 'Title', ok: !!result.title },
    { label: 'Price', ok: result.price != null && result.price !== '' },
    { label: 'MRP', ok: !!result.mrp },
    {
      label: 'Images',
      ok: (result.images?.length ?? 0) > 0,
      detail: result.images?.length ? String(result.images.length) : undefined,
    },
    {
      label: 'Variants',
      ok: (result.variants?.length ?? 0) > 0,
      detail: result.variants?.length
        ? result.variants.map((d) => `${d.dimension} ×${d.options.length}`).join(', ')
        : undefined,
    },
    { label: 'Rating', ok: !!result.rating },
    { label: 'Seller', ok: !!result.seller },
  ]

  return (
    <div className="flex flex-wrap gap-1.5">
      {checks.map((c) => (
        <span
          key={c.label}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
            c.ok ? 'bg-teal/10 text-teal-deep' : 'bg-ink/5 text-ink/40'
          }`}
        >
          {c.ok ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
          {c.label}
          {c.detail && <span className="font-medium opacity-70">· {c.detail}</span>}
        </span>
      ))}
    </div>
  )
}

function ResultHeader({
  result,
  meta,
  selection,
  isPreset,
  caseStatus,
  onSetStatus,
  onRerun,
}: {
  result: ScrapeResult
  meta: RunMeta | null
  selection: Record<string, string>
  isPreset: boolean
  caseStatus: TestStatus
  onSetStatus: (status: 'pass' | 'fail') => void
  onRerun: () => void
}) {
  const key = normalizeSite(result.site)
  const name = (key && SITE_NAMES[key]) ?? result.site ?? 'Unknown site'
  const source = result.source ? SOURCE_INFO[result.source] : null
  const selectionEntries = Object.entries(selection)

  return (
    <div className="mb-5 rounded-2xl border border-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <SiteLogo site={key} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold leading-tight text-ink">{name}</p>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 truncate text-xs text-ink/45 transition-colors hover:text-ink"
          >
            <span className="truncate">{hostnameOf(result.url)}</span>
            <ExternalLink size={11} className="flex-none" />
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRerun}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-ink/60 ring-1 ring-inset ring-ink/15 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <RotateCcw size={12} /> Re-run
          </button>

          {isPreset && (
            <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-inset ring-ink/15" role="group" aria-label="Mark test case">
              <button
                type="button"
                onClick={() => onSetStatus('pass')}
                aria-pressed={caseStatus === 'pass'}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold transition-colors ${
                  caseStatus === 'pass' ? 'bg-teal text-white' : 'text-ink/55 hover:bg-teal/10 hover:text-teal-deep'
                }`}
              >
                <CheckCircle2 size={12} /> Pass
              </button>
              <button
                type="button"
                onClick={() => onSetStatus('fail')}
                aria-pressed={caseStatus === 'fail'}
                className={`inline-flex items-center gap-1 border-l border-ink/15 px-3 py-1.5 text-xs font-bold transition-colors ${
                  caseStatus === 'fail' ? 'bg-red-500 text-white' : 'text-ink/55 hover:bg-red-50 hover:text-red-500'
                }`}
              >
                <XCircle size={12} /> Fail
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {source && <Chip tone={source.tone}>{source.label}</Chip>}
        {meta && (
          <Chip icon={<Clock size={11} />}>
            {(meta.ms / 1000).toFixed(1)}s{meta.attempts > 1 ? ' · retried once' : ''}
          </Chip>
        )}
        {result.ogOnly && <Chip tone="gold">OG tags only — no variants / MRP / rating</Chip>}
        {result.unavailable && (
          <Chip tone="red" icon={<PackageX size={11} />}>
            Unavailable
          </Chip>
        )}
        {selectionEntries.length > 0 && (
          <Chip tone="teal" icon={<Tag size={11} />}>
            Selected in view: {selectionEntries.map(([k, v]) => `${k} ${v}`).join(' · ')}
          </Chip>
        )}
      </div>

      <div className="mt-3 border-t border-ink/10 pt-3">
        <CoverageStrip result={result} />
      </div>
    </div>
  )
}

function errorHint(message: string): string | null {
  if (/403|cloudflare|attention required|BLOCKED|captcha/i.test(message)) {
    return 'The site blocked the request. Datacenter IPs are often refused — check that the hosted-render fallback (scrape.do / Scrapingdog) is configured for this platform.'
  }
  if (/timed out|timeout/i.test(message)) {
    return 'The site, or a fallback tier, took too long. Re-run once — first calls to a fallback can be slow.'
  }
  if (/JS_SHELL/i.test(message)) {
    return 'The page only fills in after JavaScript runs, and no rendering tier produced real markup.'
  }
  return null
}

function ErrorCard({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  const hint = errorHint(message)
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-red-300/40 bg-red-50 p-5">
      <XCircle size={18} className="mt-0.5 flex-none text-red-500" strokeWidth={1.8} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 break-words text-xs text-ink/60">{message}</p>
        {hint && <p className="mt-2 text-xs font-medium text-ink/70">{hint}</p>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-ink/70 ring-1 ring-inset ring-red-200 transition-colors hover:text-ink"
          >
            <RotateCcw size={12} /> Try again
          </button>
        )}
      </div>
    </div>
  )
}

function CopyJsonButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable — the JSON is still selectable by hand.
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold text-ink/50 ring-1 ring-inset ring-ink/15 transition-colors hover:text-ink"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy JSON'}
    </button>
  )
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'untested', label: 'Untested' },
  { key: 'pass', label: 'Passed' },
  { key: 'fail', label: 'Failed' },
]

export default function ScraperQaClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlFromQuery = searchParams.get('url') ?? ''

  const [inputValue, setInputValue] = useState(urlFromQuery)
  const [activeUrl, setActiveUrl] = useState(urlFromQuery)
  // Bumped on every lookup so "Re-run" on the SAME url still re-fires the
  // fetch effect (activeUrl alone wouldn't change).
  const [runId, setRunId] = useState(0)
  const [result, setResult] = useState<ScrapeResult | null>(null)
  const [runMeta, setRunMeta] = useState<RunMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  const [reviewState, setReviewState] = useState<Record<string, CaseState>>({})
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())
  const [openNotesFor, setOpenNotesFor] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [caseQuery, setCaseQuery] = useState('')

  const [feedbackState, setFeedbackState] = useState<Record<string, FeedbackEntry>>({})

  // Demo commerce state handed to whichever platform view renders, so the
  // qty stepper / wishlist / add-to-cart in those views actually respond
  // on this page instead of getting undefined props. Purely local — no
  // real cart or wishlist is touched.
  const [qty, setQty] = useState(1)
  const [inWishlist, setInWishlist] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  // Variant options (e.g. { Size: 'M' }) reported by views that support it.
  const [selection, setSelection] = useState<Record<string, string>>({})

  // Gates prefillUnavailableNote (called from inside an async fetch
  // .then, well after mount) so it doesn't fire before the load effect
  // below has had a chance to populate reviewState from localStorage.
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
  // there. A per-effect "skip my first run" ref sidesteps this
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

  // Reset the demo cart state when a different product loads.
  useEffect(() => {
    setQty(1)
    setInWishlist(false)
    setJustAdded(false)
  }, [result?.url])

  useEffect(() => {
    if (!justAdded) return
    const t = setTimeout(() => setJustAdded(false), 1600)
    return () => clearTimeout(t)
  }, [justAdded])

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

  /** Explicit pass/fail from the result header; pressing the active one
   * again clears it back to untested. */
  function setStatus(url: string, status: 'pass' | 'fail') {
    setReviewState((prev) => {
      const current = prev[url] ?? DEFAULT_CASE_STATE
      return { ...prev, [url]: { ...current, status: current.status === status ? 'untested' : status } }
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
      // Always derive `current` from `prev` inside a setState updater —
      // reading the closure's reviewState here would be a stale snapshot
      // from whenever the enclosing effect last re-ran, and would
      // silently overwrite any edit made while the network call was in
      // flight.
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
      [url]: { ...(prev[url] ?? DEFAULT_FEEDBACK_ENTRY), comment, submitted: false },
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
  const totalCount = PRESET_LINKS.length

  const filterCounts: Record<StatusFilter, number> = {
    all: totalCount,
    untested: untestedCount,
    pass: passCount,
    fail: failCount,
  }

  const q = caseQuery.trim().toLowerCase()
  const visiblePresets = PRESET_LINKS.filter((p) => {
    if (statusFilter !== 'all' && getCase(p.url).status !== statusFilter) return false
    if (!q) return true
    return `${p.label} ${p.product}`.toLowerCase().includes(q)
  })
  const allVisibleSelected = visiblePresets.length > 0 && visiblePresets.every((p) => selectedUrls.has(p.url))

  function toggleSelectAllVisible() {
    setSelectedUrls((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visiblePresets.forEach((p) => next.delete(p.url))
      else visiblePresets.forEach((p) => next.add(p.url))
      return next
    })
  }

  /** `keepSelection` is set by a variant-tile click: that's a re-scrape of
   * the SAME product family, so the shopper's chosen size should carry
   * over. A fresh lookup (form, preset, re-run) starts clean. */
  function runLookup(targetUrl: string, opts?: { keepSelection?: boolean }) {
    const trimmed = targetUrl.trim()
    if (!trimmed) return
    setInputValue(trimmed)
    setActiveUrl(trimmed)
    setRunId((n) => n + 1)
    if (!opts?.keepSelection) setSelection({})
    router.push(`${pathname}?url=${encodeURIComponent(trimmed)}`, { scroll: false })
  }

  const SCRAPE_TIMEOUT_MS = 320_000

  useEffect(() => {
    if (!activeUrl) return
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS)
    const startedAt = performance.now()
    let attempts = 1

    setLoading(true)
    setRequestError(null)
    // NOTE: `result` is deliberately not cleared here. While `loading`
    // is true we always render the skeleton (see below), so it doesn't
    // matter that the old result is still in state — but keeping it
    // means that if this fetch fails, the `.catch` below can leave the
    // last good result in place instead of wiping it.

    // needVariants=true: this QA tool exists to inspect size/color
    // pickers, so it always requests them. Today this only affects the
    // RESPONSE, not the fetch strategy: scrapeProduct() (see parsers.ts)
    // doesn't currently use needVariants to trigger any extra render/proxy
    // tier — it's used purely to attach a warning to the result when a
    // site's picker is known to render client-side (VARIANT_REQUIRES_RENDER)
    // and no variant data came back.
    //
    // Mirrors the real customer-facing paste-a-link flow
    // (hooks/useProductLookup.ts) in ONE respect only: it retries once
    // after a 5s delay before giving up, so a platform that "flakily
    // works" isn't judged here on a single attempt. It does NOT mirror
    // that flow's OG-metadata fallback or blanket "unreadable" message —
    // this page's purpose is showing whether the REAL scraper got real
    // data, so it reports the true scraper error text.
    const RETRY_DELAY_MS = 5000
    const fetchUrl = `/api/product-lookup?url=${encodeURIComponent(activeUrl)}&needVariants=true`

    async function attemptLookup(): Promise<ScrapeResult> {
      const res = await fetch(fetchUrl, { signal: controller.signal })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status})`)
      return body as ScrapeResult
    }

    async function run() {
      let data: ScrapeResult
      try {
        data = await attemptLookup()
        if (data.error) throw new Error(data.error)
      } catch (firstErr) {
        if (cancelled) return
        try {
          attempts = 2
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
          if (cancelled) return
          data = await attemptLookup()
          if (data.error) throw new Error(data.error)
        } catch (secondErr) {
          if (!cancelled) {
            const err = secondErr instanceof Error ? secondErr : firstErr
            const isTimeout = err instanceof DOMException && err.name === 'AbortError'
            setRequestError(
              isTimeout
                ? `Scrape timed out after ${Math.round(SCRAPE_TIMEOUT_MS / 1000)}s — the target site took too long to respond.`
                : err instanceof Error
                  ? err.message
                  : 'Request failed'
            )
            // Intentionally not clearing `result` here — if a variant
            // re-fetch fails we keep showing the last successful result
            // rather than wiping the whole panel; the error surfaces as
            // an inline banner above the (still visible) stale result.
          }
          return
        }
      }

      if (!cancelled) {
        setResult(data)
        setRunMeta({ ms: Math.round(performance.now() - startedAt), attempts })
        if (data.unavailable) {
          prefillUnavailableNote(activeUrl)
        }
      }
    }

    run().finally(() => {
      clearTimeout(timeoutId)
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUrl, runId])

  // Props handed to every platform view. These views take the same
  // PlatformViewProps as in ItemInfoModal; the commerce ones are wired to
  // local demo state here so the buttons respond.
  function renderPlatformView(r: ScrapeResult) {
    const props = {
      result: r,
      onSelectVariant: (url: string) => runLookup(url, { keepSelection: true }),
      onSelectionChange: setSelection,
      initialSelection: selection,
      qty,
      onQtyChange: setQty,
      inWishlist,
      onToggleWishlist: () => setInWishlist((w) => !w),
      onAddToCart: () => setJustAdded(true),
      justAdded,
      onRequestReview: () => {},
      loading: false,
      canAct: true,
    }

    switch (normalizeSite(r.site)) {
      case 'amazon':
        return <AmazonProductView {...props} />
      case 'flipkart':
        return <FlipkartProductView {...props} />
      case 'meesho':
        return <MeeshoProductView {...props} />
      case 'myntra':
        return <MyntraProductView {...props} />
      case 'ebay':
        return <EbayProductView {...props} />
      case 'ajio':
        return <AjioProductView {...props} />
      case 'jiomart':
        return <JioMartProductView {...props} />
      case 'snapdeal':
        return <SnapdealProductView {...props} />
      // boAt is Shopify-backed and reuses the Shopify view (which picks
      // the boAt logo from result.site).
      case 'shopify':
      case 'boat':
        return <ShopifyProductView {...props} />
      case 'woocommerce':
        return <WooCommerceProductView {...props} />
      case 'firstcry':
        return <FirstCryProductView {...props} />
      case 'nykaa':
        return <NykaaProductView {...props} />
      case 'hopscotch':
        return <HopscotchProductView {...props} />
      // parsers.ts's detectSite() returns lowercase 'tatacliq'; the old
      // check here compared against 'tataCliq', which never matched, so
      // every Tata CLiQ result fell through to the generic layout.
      // normalizeSite() lowercases both spellings.
      case 'tatacliq':
        return <TataCliqProductView {...props} />
      case 'aliexpress':
        return <AliExpressProductView {...props} />
      default:
        return null
    }
  }

  const resultSiteKey = result ? normalizeSite(result.site) : null
  const typedSiteKey = siteKeyForUrl(inputValue)
  const isPreset = PRESET_LINKS.some((p) => p.url === activeUrl)
  const warnings = result?.warning ? result.warning.split(' | ').filter(Boolean) : []
  const pct = (n: number) => (totalCount ? (n / totalCount) * 100 : 0)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-20 pt-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Scrape test
          </h1>
          <p className="mt-1 max-w-xl text-sm text-ink/55">
            Calls <code className="rounded bg-card px-1.5 py-0.5 text-xs">/api/product-lookup</code> against a real
            URL, live, right now. Nothing here is cached or mocked.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-ink/50">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-teal-deep" /> {passCount} passed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <XCircle size={14} className="text-red-500" /> {failCount} failed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Circle size={14} className="text-ink/30" /> {untestedCount} untested
          </span>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          runLookup(inputValue)
        }}
        className="mt-6 flex gap-2"
      >
        <div className="relative flex-1">
          {/* Live platform detection: the logo appears as soon as the
              pasted URL's host is recognised. */}
          {typedSiteKey && (
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
              <SiteLogoSquared site={typedSiteKey} size="sm" />
            </span>
          )}
          <input
            type="url"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Paste a product URL — Amazon, Flipkart, Ajio, boAt, Tata CLiQ…"
            className={`w-full rounded-xl border border-ink/15 bg-card py-3 pr-10 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-teal ${
              typedSiteKey ? 'pl-14' : 'pl-4'
            }`}
            required
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => setInputValue('')}
              aria-label="Clear URL"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink/35 hover:bg-ink/5 hover:text-ink/70"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex flex-none items-center gap-2 rounded-xl bg-teal px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Scrape
        </button>
      </form>

      <div className="mt-6 grid gap-8 lg:grid-cols-[380px_1fr] lg:items-start">
        {/* Left rail: test cases. Sticky with its own scroll so a long
            result on the right never pushes the list out of reach. */}
        <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1">
          <div className="rounded-2xl border border-ink/10 bg-white p-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-sm font-bold text-ink">Test cases</p>
              <p className="text-[11px] font-semibold text-ink/40">
                {passCount + failCount} of {totalCount} tested
              </p>
            </div>

            {/* Progress: passed / failed / untested share of all cases. */}
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
              <div className="bg-teal-deep transition-all" style={{ width: `${pct(passCount)}%` }} />
              <div className="bg-red-400 transition-all" style={{ width: `${pct(failCount)}%` }} />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  aria-pressed={statusFilter === f.key}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    statusFilter === f.key
                      ? 'bg-ink text-white'
                      : 'bg-ink/5 text-ink/55 hover:bg-ink/10 hover:text-ink'
                  }`}
                >
                  {f.label} <span className="opacity-60">{filterCounts[f.key]}</span>
                </button>
              ))}
            </div>

            <div className="relative mt-3">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
              <input
                type="search"
                value={caseQuery}
                onChange={(e) => setCaseQuery(e.target.value)}
                placeholder="Filter platforms or products"
                className="w-full rounded-lg border border-ink/12 bg-card py-2 pl-8 pr-3 text-xs text-ink outline-none placeholder:text-ink/35 focus:border-teal"
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 px-1">
              <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-ink/50">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  className="h-3.5 w-3.5 rounded border-ink/30 accent-teal"
                />
                Select all shown
              </label>
              {selectedUrls.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedUrls(new Set())}
                  className="text-[11px] font-semibold text-ink/35 hover:text-ink/60"
                >
                  Clear ({selectedUrls.size})
                </button>
              )}
            </div>

            {selectedUrls.size > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-card px-3 py-2">
                <span className="text-[11px] font-semibold text-ink/50">{selectedUrls.size} selected</span>
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
              </div>
            )}

            <div className="mt-3 flex flex-col gap-1.5">
              {visiblePresets.length === 0 && (
                <p className="rounded-xl border border-dashed border-ink/15 px-3 py-6 text-center text-xs text-ink/40">
                  No test cases match this filter.
                </p>
              )}

              {visiblePresets.map((preset: PresetLink) => {
                const active = activeUrl === preset.url
                const caseState = getCase(preset.url)
                const isSelected = selectedUrls.has(preset.url)
                const notesOpen = openNotesFor.has(preset.url)
                const siteKey = siteKeyForUrl(preset.url) ?? normalizeSite(preset.label)

                return (
                  <div
                    key={preset.url}
                    className={`rounded-xl border px-2.5 py-2 transition-colors ${
                      active
                        ? 'border-teal bg-teal/10'
                        : isSelected
                          ? 'border-teal/40 bg-teal/5'
                          : 'border-ink/10 bg-card hover:border-ink/20'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(preset.url)}
                        className="h-3.5 w-3.5 flex-none rounded border-ink/30 accent-teal"
                        aria-label={`Select ${preset.label} test case`}
                      />

                      <button
                        type="button"
                        onClick={() => runLookup(preset.url)}
                        disabled={loading}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {/* FIX: was `<siteLogoSquared ... />` (lowercase
                            tag) — JSX rendered it as a literal unknown DOM
                            element instead of calling the component; the
                            logo never appeared and `site`/`size` were
                            being dumped onto the DOM as invalid attributes. */}
                        <SiteLogoSquared site={siteKey} size="sm" className="flex-none" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-ink/85">
                            {preset.label}
                            {active && loading && (
                              <Loader2 size={12} className="animate-spin text-teal-deep" />
                            )}
                          </span>
                          <span className="block truncate text-[11px] font-medium text-ink/45">
                            {preset.product}
                          </span>
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
                        className="mt-2 w-full rounded-lg border border-ink/15 bg-white/70 px-2.5 py-2 text-xs text-ink outline-none placeholder:text-ink/35 focus:border-teal"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* Right column: result of the active scrape. Flows naturally
            (not sticky) — a tall platform view scrolls with the page. */}
        <main className="min-w-0">
          {!activeUrl && !result && !loading && (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink/15 bg-card/60 px-6 text-center">
              <div className="flex -space-x-2">
                {['amazon', 'flipkart', 'myntra', 'ajio', 'boat'].map((k) => (
                  <span key={k} className="rounded-lg ring-2 ring-white">
                    <SiteLogo site={k} />
                  </span>
                ))}
              </div>
              <p className="text-sm font-semibold text-ink/60">Nothing scraped yet</p>
              <p className="max-w-xs text-xs text-ink/40">
                Paste any marketplace product URL above, or pick a platform from the test cases.
              </p>
            </div>
          )}

          {/* Skeleton covers both the very first lookup AND every
              variant/size re-fetch. */}
          {loading && (
            <>
              <LoadingBanner key={`${activeUrl}-${runId}`} url={activeUrl} />
              <ProductSkeleton />
            </>
          )}

          {/* Hard failure with nothing to fall back on (first load failed). */}
          {!loading && requestError && !result && (
            <ErrorCard title="Request failed" message={requestError} onRetry={() => runLookup(activeUrl)} />
          )}

          {!loading && result && result.error && (
            <ErrorCard title="Scrape failed" message={result.error} onRetry={() => runLookup(activeUrl)} />
          )}

          {!loading && result && !result.error && (
            <div>
              <ResultHeader
                result={result}
                meta={runMeta}
                selection={selection}
                isPreset={isPreset}
                caseStatus={getCase(activeUrl).status}
                onSetStatus={(status) => setStatus(activeUrl, status)}
                onRerun={() => runLookup(activeUrl)}
              />

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

              {warnings.length > 0 && !result.unavailable && (
                <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
                  <AlertTriangle size={15} className="mt-0.5 flex-none text-gold-deep" strokeWidth={1.8} />
                  {warnings.length === 1 ? (
                    <p className="text-xs leading-relaxed text-ink/70">{warnings[0]}</p>
                  ) : (
                    <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink/70">
                      {warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Every recognized platform gets its own look-alike layout
                  so a reviewer can eyeball a match against the real site.
                  Only a site with no dedicated view falls through to the
                  plain layout. */}
              {renderPlatformView(result) ?? (
                <GenericResult
                  result={result}
                  siteKey={resultSiteKey}
                  onSelectVariant={(url) => runLookup(url, { keepSelection: true })}
                />
              )}

              <FeedbackBox
                entry={getFeedback(activeUrl)}
                onVerdict={(v) => setFeedbackVerdict(activeUrl, v)}
                onComment={(c) => setFeedbackComment(activeUrl, c)}
                onSubmit={() => handleFeedbackSubmit(activeUrl, result)}
              />

              <details className="group mt-6 rounded-2xl border border-ink/10 bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-bold text-ink/55">
                  <span>
                    Raw response
                    <span className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span>
                  </span>
                </summary>
                <div className="border-t border-ink/10 px-4 py-3">
                  <div className="mb-2 flex justify-end">
                    <CopyJsonButton text={JSON.stringify(result, null, 2)} />
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-ink/60">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              </details>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}