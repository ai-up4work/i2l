'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Minus, Plus, Receipt, TriangleAlert, X } from 'lucide-react'
import { calculateQuote } from '@/lib/quote'
import { convertAmount } from '@/lib/currency/convert'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { Draft } from './types'

// Reuse the same platform-specific "look-alike" layouts the QA page uses,
// so a pasted link shows the real product card (images, rating, variants)
// instead of a dead URL string + blank fields.
import AmazonProductView from '@/app/demo/scraper-qa/platforms/AmazonProductView'
import FlipkartProductView from '@/app/demo/scraper-qa/platforms/FlipkartProductView'
import MeeshoProductView from '@/app/demo/scraper-qa/platforms/Meeshoproductview'
import MyntraProductView from '@/app/demo/scraper-qa/platforms/MyntraProductView'
import EbayProductView from '@/app/demo/scraper-qa/platforms/EbayProductView'
import AjioProductView from '@/app/demo/scraper-qa/platforms/AjioProductView'
import JioMartProductView from '@/app/demo/scraper-qa/platforms/JioMartProductView'
import SnapdealProductView from '@/app/demo/scraper-qa/platforms/SnapdealProductView'
import ShopifyProductView from '@/app/demo/scraper-qa/platforms/Shopifyproductview'
import WooCommerceProductView from '@/app/demo/scraper-qa/platforms/Woocommerceproductview'

type ItemInfoModalProps = {
  draft: Draft
  onChange: (draft: Draft) => void
  onClose: () => void
  onSave: (event: React.FormEvent) => void
  /** True while /api/scrape is fetching product details for the pasted link. */
  loading?: boolean
  /** Set when the scrape failed — the form still works, just unfilled. */
  lookupError?: string | null
  /** True once a scrape has successfully pre-filled the fields below. */
  autoFilled?: boolean
  /**
   * Full scrape payload for the current draft.url (images, rating, variants,
   * options, etc.) — NOT just the name/price already merged into `draft`.
   * When this matches a supported platform we render that platform's rich
   * view instead of the plain URL box / image dropzone. Reference only:
   * the editable Name/Qty/Price/Declaration fields below are still what
   * actually gets saved onto the draft.
   */
  scrapeResult?: ScrapeResult | null
  /**
   * Fired when the shopper clicks a variant/size/color tile inside the
   * rich product view. The parent should re-run the scrape against this
   * URL (same as `runLookup` in the QA page) and feed the new result back
   * in via `scrapeResult`, updating `draft.image`/`draft.unitPrice` etc.
   * as appropriate.
   *
   * NOTE: Shopify and WooCommerce's variant tiles never call this — every
   * option's `url` is always null (see buildStoreVariantDimensions in
   * parsers.ts), since their single API call already returned every
   * variant's price/image/availability. Those two views accept
   * onSelectVariant only for interface parity and never invoke it.
   */
  onSelectVariant?: (url: string) => void
}

// Every label that can appear in draft.currency / the dropdown's
// currencyOptions must map to a real ISO code here, or convertAmount()
// gets called with something like "Rs." and throws "Could not convert
// automatically". Includes: every currencyOptions entry, emptyDraft's
// default ('Rs.'), old symbol-style values from before the LKR-only
// change (in case any old drafts/localStorage/persisted data still has
// them), and common alt-casings/spacings a person or a scraper might send.
const LABEL_TO_ISO: Record<string, string> = {
  // Current dropdown options
  'US$': 'USD',
  'HK$': 'HKD',
  'LKR': 'LKR',
  'INR': 'INR',
  '₹': 'INR',

  // Current app default (emptyDraft.currency)
  'Rs.': 'LKR',
  'Rs': 'LKR',
  'රු': 'LKR',

  // Legacy / alternate symbol forms that may still exist in old data
  'US $': 'USD',
  '$': 'USD',
  'US$ ': 'USD',
  'HK $': 'HKD',
  'HKD': 'HKD',
  '€': 'EUR',
  'EUR': 'EUR',
  '£': 'GBP',
  'GBP': 'GBP',
  'A$': 'AUD',
  'AUD': 'AUD',
  'C$': 'CAD',
  'CAD': 'CAD',
  'S$': 'SGD',
  'SGD': 'SGD',
  '¥': 'JPY',
  'JPY': 'JPY',
}

const LABEL_TO_SYMBOL: Record<string, string> = {
  'US$': '$',
  'HK$': '$',
  'LKR': 'Rs',
  'INR': '₹',
  'Rs.': 'Rs',
  'Rs': 'Rs',
  'රු': 'Rs',
  'US $': '$',
  '$': '$',
  'HK $': '$',
  'HKD': '$',
  '€': '€',
  'EUR': '€',
  '£': '£',
  'GBP': '£',
  'A$': '$',
  'AUD': '$',
  'C$': '$',
  'CAD': '$',
  'S$': '$',
  'SGD': '$',
  '¥': '¥',
  'JPY': '¥',
}

// Normalizes a label before lookup: trims whitespace and uppercases
// 3-letter codes, so slight formatting differences ("lkr", " LKR ", "Lkr")
// still resolve instead of silently falling through to the raw label.
function toIso(label: string): string {
  const trimmed = label.trim()
  if (LABEL_TO_ISO[trimmed]) return LABEL_TO_ISO[trimmed]

  const upper = trimmed.toUpperCase()
  if (LABEL_TO_ISO[upper]) return LABEL_TO_ISO[upper]

  // Already looks like a bare ISO code (e.g. "LKR", "INR") even if it
  // wasn't in the table above — pass it through rather than mangling it.
  if (/^[A-Z]{3}$/.test(upper)) return upper

  // Last resort: unrecognized label. Returning it as-is preserves the old
  // behavior (so callers see exactly what failed), but now this path
  // should only be hit for a genuinely unknown value, not any of the
  // documented ones above.
  return trimmed
}

// Formats a number with thousands separators for display in the price
// input (e.g. 624832 -> "624,832"), and strips separators back out when
// parsing what the user typed.
function formatPrice(value: number): string {
  if (!value) return ''
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function parsePrice(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim()
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : 0
}

// Exit animation duration in ms — must match the transition-duration used on
// the panel/backdrop below, so the modal actually finishes fading out before
// the parent unmounts it.
const CLOSE_ANIM_MS = 180

/**
 * NOTE: this component reads/writes `draft.isLiquid` and `draft.hasBatteries`
 * (each `boolean | null`, defaulting to `null` = unanswered). Add those two
 * fields to the `Draft` type in `./types` if they aren't there yet — the
 * "Any item contains" declaration below is required before Save is enabled.
 */

// Small styled radio pill used for the Yes/No declaration rows below.
function RadioPill({
  name,
  checked,
  onChange,
  label,
}: {
  name: string
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
      <span
        className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-full border transition-colors duration-150 ${
          checked ? 'border-teal' : 'border-ink/25'
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full bg-teal transition-transform duration-150 ${
            checked ? 'scale-100' : 'scale-0'
          }`}
        />
      </span>
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {label}
    </label>
  )
}

// Which platforms have a bespoke look-alike view (mirrors ScraperQaClient's
// list). Everything else — including any not listed here — falls
// through to the plain URL box below, same as it does today.
const SUPPORTED_PLATFORM_VIEWS = new Set([
  'amazon',
  'flipkart',
  'meesho',
  'myntra',
  'ebay',
  'ajio',
  'jiomart',
  'snapdeal',
  'shopify',
  'woocommerce',
])

/** Picks the matching platform view for a successful, non-error scrape result. */
function PlatformProductView({
  result,
  onSelectVariant,
}: {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}) {
  switch (result.site) {
    case 'amazon':
      return <AmazonProductView result={result} onSelectVariant={onSelectVariant} />
    case 'flipkart':
      return <FlipkartProductView result={result} onSelectVariant={onSelectVariant} />
    case 'meesho':
      return <MeeshoProductView result={result} onSelectVariant={onSelectVariant} />
    case 'myntra':
      return <MyntraProductView result={result} onSelectVariant={onSelectVariant} />
    case 'ebay':
      return <EbayProductView result={result} onSelectVariant={onSelectVariant} />
    case 'ajio':
      return <AjioProductView result={result} onSelectVariant={onSelectVariant} />
    case 'jiomart':
      return <JioMartProductView result={result} onSelectVariant={onSelectVariant} />
    case 'snapdeal':
      return <SnapdealProductView result={result} onSelectVariant={onSelectVariant} />
    case 'shopify':
      return <ShopifyProductView result={result} onSelectVariant={onSelectVariant} />
    case 'woocommerce':
      return <WooCommerceProductView result={result} onSelectVariant={onSelectVariant} />
    default:
      return null
  }
}

export default function ItemInfoModal({
  draft,
  onChange,
  onClose,
  onSave,
  loading = false,
  lookupError = null,
  autoFilled = false,
  scrapeResult = null,
  onSelectVariant,
}: ItemInfoModalProps) {
  const { subtotal } = calculateQuote({ unitPrice: draft.unitPrice, qty: draft.qty })
  const currencyOptions = Array.from(new Set(['US$', 'LKR', 'INR', 'HK$', draft.currency].filter(Boolean)))

  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)

  // Drives the open/close transition. Starts false so the panel mounts in
  // its "hidden" position, flips true one frame later so the transition
  // actually animates in, and flips back to trigger the mirrored exit.
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  function requestClose() {
    setClosing(true)
    setTimeout(onClose, CLOSE_ANIM_MS)
  }

  const baseRef = useRef({ currency: draft.currency, price: draft.unitPrice })

  useEffect(() => {
    baseRef.current = { currency: draft.currency, price: draft.unitPrice }
  }, [draft.url, loading, autoFilled])

  function handlePriceInput(value: number) {
    baseRef.current = { currency: draft.currency, price: value }
    onChange({ ...draft, unitPrice: value })
  }

  async function handleCurrencyChange(newLabel: string) {
    setConvertError(null)

    const fromIso = toIso(baseRef.current.currency)
    const toIsoCode = toIso(newLabel)

    if (fromIso === toIsoCode || !baseRef.current.price) {
      baseRef.current = { currency: newLabel, price: draft.unitPrice }
      onChange({ ...draft, currency: newLabel })
      return
    }

    setConverting(true)
    try {
      const converted = await convertAmount(baseRef.current.price, fromIso, toIsoCode)
      const rounded = Math.round(converted / 10) * 10
      baseRef.current = { currency: newLabel, price: rounded }
      onChange({ ...draft, currency: newLabel, unitPrice: rounded })
    } catch (e) {
      setConvertError('Could not convert automatically — please check the price.')
      onChange({ ...draft, currency: newLabel })
    } finally {
      setConverting(false)
    }
  }

  // Subtotal "landed" pulse — fires whenever the computed subtotal actually
  // changes (price edit, currency conversion, qty step), not on every render.
  const [pulse, setPulse] = useState(false)
  const prevSubtotalRef = useRef(subtotal)
  useEffect(() => {
    if (prevSubtotalRef.current !== subtotal) {
      prevSubtotalRef.current = subtotal
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 320)
      return () => clearTimeout(t)
    }
  }, [subtotal])

  const active = mounted && !closing

  // One status banner is shown at a time; keying on which one lets the
  // crossfade re-trigger cleanly whenever the state moves between them.
  const bannerKey = loading ? 'loading' : lookupError ? 'error' : autoFilled ? 'autofilled' : null

  // Rich platform view only kicks in once we have a *successful*,
  // non-error result for a site we have a bespoke layout for. Everything
  // else (no result yet, scrape failed, unsupported platform, manual
  // entry with no URL at all) keeps the original plain URL box + image
  // dropzone below.
  const hasPlatformView =
    !!scrapeResult && !scrapeResult.error && SUPPORTED_PLATFORM_VIEWS.has(scrapeResult.site ?? '')

  // Image upload — the drop zone is otherwise decorative, so wire it to a
  // hidden file input and read the file back as a data URL for preview.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imageDragOver, setImageDragOver] = useState(false)

  function readImageFile(file?: File | null) {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChange({ ...draft, image: reader.result })
      }
    }
    reader.readAsDataURL(file)
  }

  function handleImageDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setImageDragOver(false)
    readImageFile(event.dataTransfer.files?.[0])
  }

  // Declaration must be fully answered before the item can be saved.
  const declarationComplete = draft.isLiquid !== null && draft.hasBatteries !== null

  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center bg-ink/50 p-5 backdrop-blur-[2px] transition-opacity duration-200 ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      <form
        onSubmit={onSave}
        className={`flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-parchment shadow-lift transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          active ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-7 py-6">
          <div>
            <h2 className="font-display text-2xl text-ink">Item information</h2>
            <p className="mt-0.5 text-sm text-ink/45">Confirm the details before we take it from here</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={requestClose}
            className="grid h-9 w-9 flex-none place-items-center rounded-full text-ink/50 transition-all duration-200 hover:rotate-90 hover:bg-ink/5 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="flex flex-col gap-6 overflow-auto p-7
            [scrollbar-width:thin] [scrollbar-color:theme(colors.ink/25%)_transparent]
            [&::-webkit-scrollbar]:w-1.5
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb]:bg-ink/20
            [&::-webkit-scrollbar-thumb]:transition-colors
            hover:[&::-webkit-scrollbar-thumb]:bg-ink/35"
        >
          {!hasPlatformView && (
            <label
              className="flex flex-col gap-2.5 text-sm font-semibold text-ink motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
              style={{ animationDelay: '20ms' }}
            >
              Item URL
              <div className="max-h-20 overflow-hidden rounded-xl border border-ink/15 bg-card p-4 text-[13px] font-normal leading-relaxed text-ink/45">
                {draft.url || 'https://www.store.com/product-link'}
              </div>
            </label>
          )}

          {bannerKey && (
            <div key={bannerKey} className="motion-safe:[animation:fadeUp_0.25s_ease-out_both]">
              {bannerKey === 'loading' && (
                <div className="flex items-center gap-3 rounded-xl border border-gold/20 bg-gold/10 px-4 py-3.5 text-sm font-semibold text-ink">
                  <Loader2 size={16} className="flex-none animate-spin text-gold-deep" />
                  Reading the product page — name, image, and price will fill in automatically.
                </div>
              )}
              {bannerKey === 'error' && (
                <div className="flex items-start gap-3 rounded-xl border border-indigo/20 bg-indigo/[0.06] px-4 py-3.5 text-sm text-ink">
                  <TriangleAlert size={16} className="mt-0.5 flex-none text-indigo-deep" />
                  <span>
                    <b className="font-semibold text-indigo-deep">Couldn&apos;t auto-fill this one.</b> {lookupError} You
                    can still enter the details by hand below.
                  </span>
                </div>
              )}
              {bannerKey === 'autofilled' && !hasPlatformView && (
                <div className="rounded-xl border border-gold/20 bg-gold/10 px-4 py-3.5 text-sm font-semibold text-ink">
                  Filled in from the product page — double-check the price and edit anything that needs it.
                </div>
              )}
            </div>
          )}

          {/* Rich, site-accurate product card — reference only. Clicking a
              variant/size/color tile re-scrapes that variant's own page
              live (via onSelectVariant, wired up by the parent) so the
              shopper can pick the exact SKU they want; it does not, by
              itself, change draft.name/unitPrice — the parent's scrape
              success handler does that the same way the initial paste does.
              (Shopify/WooCommerce are the exception — their variant tiles
              never call onSelectVariant at all, since every option's url
              is always null; see ShopifyProductView/WooCommerceProductView's
              doc comments.) */}
          {hasPlatformView && scrapeResult && (
            <div
              className="rounded-2xl border border-ink/10 bg-white p-5 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
              style={{ animationDelay: '20ms' }}
            >
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-ink/40">
                From the listing — for reference, edit details below
              </p>
              <PlatformProductView
                result={scrapeResult}
                onSelectVariant={(url) => onSelectVariant?.(url)}
              />
            </div>
          )}

          <label
            className="flex flex-col gap-2.5 text-sm font-semibold text-ink motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: '60ms' }}
          >
            Item name <b className="font-normal text-indigo-deep">*</b>
            <textarea
              required
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              placeholder="Enter the product name"
              className="min-h-[110px] resize-y rounded-xl border border-ink/15 bg-parchment p-4 text-sm font-normal outline-none transition-shadow focus:border-gold/40 focus:ring-2 focus:ring-gold/50"
            />
          </label>

          {/* The manual image dropzone only matters when we don't already
              have a real gallery from the platform view above. */}
          {!hasPlatformView && (
            <div
              className="flex flex-col gap-2.5 text-sm font-semibold text-ink motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
              style={{ animationDelay: '100ms' }}
            >
              Image <span className="text-xs font-normal text-ink/45">(for reference only; specifications entered will be used)</span>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setImageDragOver(true)
                }}
                onDragLeave={() => setImageDragOver(false)}
                onDrop={handleImageDrop}
                className={`flex min-h-[125px] cursor-pointer items-center gap-5 rounded-xl border border-dashed px-6 py-5 transition-colors duration-200 ${
                  imageDragOver ? 'border-gold/60 bg-gold/10' : 'border-ink/25 hover:border-gold/50 hover:bg-gold/5'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => readImageFile(event.target.files?.[0])}
                />
                {draft.image ? (
                  <img
                    src={draft.image}
                    alt="Product reference"
                    className="h-[82px] w-[82px] flex-none rounded-lg border border-ink/10 object-cover transition-transform duration-300 hover:scale-105"
                  />
                ) : (
                  <div className="grid h-[82px] w-[82px] flex-none place-items-center rounded-lg bg-ink/[0.04] text-ink/25">
                    <ImagePlus size={26} strokeWidth={1.5} />
                  </div>
                )}
                <span className="text-sm text-ink/45">Click to upload or drag an image here</span>
              </div>
            </div>
          )}

          <div
            className="flex items-center justify-between font-semibold text-ink motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: '140ms' }}
          >
            <span>Quantity</span>
            <div className="flex items-center gap-3.5 rounded-xl border border-ink/15 px-2.5 py-1.5">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => onChange({ ...draft, qty: Math.max(1, draft.qty - 1) })}
                className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-teal/30 hover:bg-teal/5 hover:text-teal-deep active:scale-90"
              >
                <Minus size={15} />
              </button>
              <span className="min-w-[20px] text-center font-bold tabular-nums">{draft.qty}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => onChange({ ...draft, qty: draft.qty + 1 })}
                className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-teal/30 hover:bg-teal/5 hover:text-teal-deep active:scale-90"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          <label
            className="flex flex-col gap-2.5 text-sm font-semibold text-ink motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: '180ms' }}
          >
            Unit price (Discounted) <b className="font-normal text-indigo-deep">*</b>
            <div
              className={`flex overflow-hidden rounded-xl border transition-all duration-300 ${
                converting ? 'border-gold/40 bg-gold/10' : 'border-ink/15 focus-within:border-gold/40'
              }`}
            >
              <select
                value={draft.currency}
                onChange={(event) => handleCurrencyChange(event.target.value)}
                disabled={converting}
                aria-label="Currency"
                className="border-r border-ink/10 bg-card px-3 font-semibold text-ink outline-none transition-opacity disabled:opacity-60"
              >
                {currencyOptions.map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </select>
              <div className="relative flex flex-1 items-center">
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={formatPrice(draft.unitPrice)}
                  onChange={(event) => handlePriceInput(parsePrice(event.target.value))}
                  placeholder="0.00"
                  className={`w-full bg-parchment py-3 pl-4 pr-4 font-normal tabular-nums outline-none transition-opacity focus:ring-2 focus:ring-gold/50 ${
                    converting ? 'opacity-50' : 'opacity-100'
                  }`}
                />
                {converting && (
                  <Loader2 size={16} className="absolute right-3.5 animate-spin text-ink/40" />
                )}
              </div>
            </div>
            {convertError && (
              <span className="flex items-center gap-1.5 text-xs font-normal text-indigo-deep motion-safe:[animation:fadeUp_0.2s_ease-out_both]">
                <TriangleAlert size={13} /> {convertError}
              </span>
            )}
          </label>

          <div
            className="flex flex-col gap-2 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: '220ms' }}
          >
            <div className="text-sm font-semibold text-ink">
              Any item contains: <b className="font-normal text-indigo-deep">*</b>
            </div>
            <p className="text-xs text-ink/45">Accurate information is required due to air freight restrictions.</p>

            <div className="mt-1 flex flex-col gap-5 rounded-xl border border-indigo/15 bg-indigo/[0.05] px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-ink">Liquid</div>
                  <div className="text-xs text-ink/45">Includes the form of Gel or Cream</div>
                </div>
                <div className="flex flex-none items-center gap-6">
                  <RadioPill
                    name="isLiquid"
                    label="Yes"
                    checked={draft.isLiquid === true}
                    onChange={() => onChange({ ...draft, isLiquid: true })}
                  />
                  <RadioPill
                    name="isLiquid"
                    label="No"
                    checked={draft.isLiquid === false}
                    onChange={() => onChange({ ...draft, isLiquid: false })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-ink">Batteries</div>
                  <div className="text-xs text-ink/45">Non-rechargeable or Rechargeable battery</div>
                </div>
                <div className="flex flex-none items-center gap-6">
                  <RadioPill
                    name="hasBatteries"
                    label="Yes"
                    checked={draft.hasBatteries === true}
                    onChange={() => onChange({ ...draft, hasBatteries: true })}
                  />
                  <RadioPill
                    name="hasBatteries"
                    label="No"
                    checked={draft.hasBatteries === false}
                    onChange={() => onChange({ ...draft, hasBatteries: false })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-end gap-5 border-t border-ink/10 bg-card/40 px-7 py-6">
          <div className="flex flex-1 items-center gap-3">
            <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-teal/10 text-teal-deep">
              <Receipt size={17} />
            </div>
            <div>
              <span className="block text-sm text-ink/45">Item Subtotal</span>
              <strong
                className={`mt-0.5 block font-display text-2xl leading-none text-teal-deep transition-transform duration-300 ${
                  pulse ? 'scale-110' : 'scale-100'
                }`}
              >
                {LABEL_TO_SYMBOL[draft.currency] ?? draft.currency}
                {' '}
                {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
          </div>
          <button
            type="submit"
            disabled={converting || !declarationComplete}
            className="min-w-[110px] rounded-xl bg-ink px-6 py-3.5 text-sm font-semibold text-parchment transition-all duration-200 hover:bg-indigo-deep active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  )
}