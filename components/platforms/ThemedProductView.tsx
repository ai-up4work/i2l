'use client'

// components/platforms/ThemedProductView.tsx
//
// One product view, dressed in a store's own colours. Same structure,
// type scale, spacing and order as every other store view in the item
// screen (see PDP_* in ./pdp-styles.ts):
//
//   logo · rating          ┐
//   Title (display font)   ┘ info      — top right (desktop) / first (mobile)
//   Gallery                  gallery   — left (desktop) / second (mobile)
//   Price  MRP  % off      ┐
//   Colour / Size pickers  │ rest      — under the title (desktop) / third
//   Stock                  │
//   Qty · ♡ · Add · Quote  ┘
//   Description | Details | Shipping & Returns
//
// What changes per store is only the theme: accent colour (selected
// options, active thumbnail, tab underline), price colour, rating style,
// discount style, and the two buttons' colours and labels.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { Check, Heart, Minus, Plus, Ruler, ShoppingBag, ShoppingCart, Star, X } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ProductGallery from '@/components/stores/ProductGallery'
import RequestActionButton from '@/components/stores/RequestActionButton'
import { SITE_LOGOS } from '@/lib/platform-logos'
import { PDP_BRAND_LINE, PDP_CONTAINER, PDP_GRID, PDP_LABEL, PDP_REST, PDP_TITLE } from './pdp-styles'
import PdpInfoTabs from './PdpInfoTabs'

export type PlatformTheme = {
  /** Key into SITE_LOGOS. */
  logo: keyof typeof SITE_LOGOS
  name: string
  logoWidth?: number
  logoHeight?: number
  /** Selected options, active thumbnail, tab underline, size-chart link. */
  accent: string
  /** Background of a selected option chip. */
  accentSoft: string
  price: string
  rating: { kind: 'pill'; bg: string } | { kind: 'stars'; color: string }
  discount: { color: string; badge?: boolean; format?: (pct: number) => string }
  stock: string
  primary: { label: string; color: string; icon?: 'bag' | 'cart' }
  quote: { color: string }
  /** Show "Sold by …" under the stock line. */
  showSeller?: boolean
  /** Small line under the price, e.g. "Inclusive of all taxes". */
  priceNote?: string
}

function fmt(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(amount) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'LKR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

function Rating({ theme, rating, count }: { theme: PlatformTheme; rating?: string | null; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  if (theme.rating.kind === 'pill') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
          style={{ backgroundColor: theme.rating.bg }}
        >
          {value.toFixed(1)}
          <Star size={10} className="fill-white text-white" strokeWidth={0} />
        </span>
        {count && <span className="text-xs font-medium text-ink/45">{count} ratings</span>}
      </span>
    )
  }
  const rounded = Math.round(value)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={13}
            strokeWidth={1.5}
            style={i < rounded ? { color: (theme.rating as { color: string }).color, fill: (theme.rating as { color: string }).color } : undefined}
            className={i < rounded ? '' : 'fill-transparent text-ink/20'}
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

type Dim = NonNullable<ScrapeResult['variants']>[number]

function OptionRow({
  dim,
  selected,
  onPick,
  sizeChart,
}: {
  dim: Dim
  selected: string | null
  onPick: (opt: Dim['options'][number]) => void
  sizeChart?: ReactNode
}) {
  const hasImages = dim.options.some((o) => !!o.image)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className={PDP_LABEL}>
          {dim.dimension}
          {selected && <span className="ml-1.5 text-[11px] font-semibold normal-case tracking-normal text-ink/70">{selected}</span>}
        </p>
        {sizeChart}
      </div>
      <div className={hasImages ? 'flex flex-wrap gap-2.5' : 'flex flex-wrap gap-1.5'}>
        {dim.options.map((opt, i) => {
          const isSelected = opt.label === selected
          const title = opt.outOfStock ? `${opt.label} — out of stock` : opt.url ? opt.label : `${opt.label} — no direct link found, selection is visual only`
          if (hasImages) {
            return (
              <button
                key={`${opt.label}-${i}`}
                type="button"
                onClick={() => onPick(opt)}
                disabled={opt.outOfStock}
                title={title}
                aria-pressed={isSelected}
                className="group flex w-14 flex-col items-center gap-1 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span
                  className={`relative h-14 w-14 overflow-hidden rounded-lg border bg-white bg-cover bg-center transition-all ${
                    isSelected ? 'border-2 border-[var(--pdp-accent)]' : 'border-ink/12 group-hover:border-ink/30'
                  }`}
                  style={opt.image ? { backgroundImage: `url(${opt.image})` } : { background: 'linear-gradient(135deg,#e5e0d8,#cfc8ba)' }}
                />
                <span className={`w-full truncate text-center text-[10px] font-medium ${isSelected ? 'text-[var(--pdp-accent)]' : 'text-ink/60'}`}>
                  {opt.label}
                </span>
              </button>
            )
          }
          return (
            <button
              key={`${opt.label}-${i}`}
              type="button"
              onClick={() => onPick(opt)}
              disabled={opt.outOfStock}
              title={title}
              aria-pressed={isSelected}
              className={`min-w-[2.75rem] rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                isSelected
                  ? 'border-[var(--pdp-accent)] bg-[var(--pdp-accent-soft)] text-[var(--pdp-accent)]'
                  : opt.outOfStock
                    ? 'cursor-not-allowed border-ink/8 text-ink/25 line-through'
                    : 'border-ink/15 text-ink/70 hover:border-ink/35'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SizeChartLink({ chart, selectedSize }: { chart: NonNullable<ScrapeResult['sizeChart']>; selectedSize: string | null }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--pdp-accent)] underline underline-offset-2"
      >
        <Ruler size={11} />
        Size chart
      </button>
      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[999] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
            <div className="max-h-[85vh] max-w-[90vw] overflow-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between gap-6">
                <h3 className="text-sm font-bold text-ink">Size chart</h3>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close size chart">
                  <X size={18} className="text-ink/50" />
                </button>
              </div>
              <SizeChartTables chart={chart} selectedSize={selectedSize} />
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function SizeChartTables({ chart, selectedSize }: { chart: NonNullable<ScrapeResult['sizeChart']>; selectedSize?: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      {chart.map((table, i) => (
        <div key={i}>
          {'title' in table && table.title && <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">{table.title}</p>}
          {'columns' in table && (
            <table className="w-full border-collapse text-left text-xs text-ink">
              <thead>
                <tr className="border-b border-ink/10">
                  {table.columns.map((col) => (
                    <th key={col} className="whitespace-nowrap py-1.5 pr-4 font-semibold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => {
                  const label = String((row as Record<string, unknown>)[table.columns[0]] ?? '')
                  const hit = !!selectedSize && label.trim().toLowerCase() === selectedSize.trim().toLowerCase()
                  return (
                    <tr key={r} className={`border-b border-ink/5 last:border-0 ${hit ? 'bg-[var(--pdp-accent-soft)] font-bold' : ''}`}>
                      {table.columns.map((col) => (
                        <td key={col} className="whitespace-nowrap py-1.5 pr-4">
                          {(row as Record<string, unknown>)[col] as ReactNode}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}


function InfoTabs({ result, accent }: { result: ScrapeResult; accent: string }) {
  return <PdpInfoTabs result={result} accent={accent} />
}


export default function ThemedProductView({ theme, ...props }: PlatformViewProps & { theme: PlatformTheme }) {
  const { result, onSelectVariant, onSelectionChange, initialSelection, qty, onQtyChange, inWishlist, onToggleWishlist, onAddToCart, justAdded, onRequestReview, loading, canAct } = props
  const images = result.images ?? []
  const variants = result.variants ?? []

  const [selection, setSelection] = useState<Record<string, string>>({})
  useEffect(() => {
    const next: Record<string, string> = {}
    for (const dim of variants) {
      const sel = dim.options.find((o) => o.selected)
      if (sel) next[dim.dimension] = sel.label
    }
    setSelection({ ...next, ...(initialSelection ?? {}) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.url, result.variants])

  function pick(dim: Dim, opt: Dim['options'][number]) {
    if (opt.outOfStock) return
    const next = { ...selection, [dim.dimension]: opt.label }
    setSelection(next)
    onSelectionChange?.(next)
    if (opt.url && !opt.selected) onSelectVariant(opt.url)
  }

  const price = fmt(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmt(result.mrp, result.currencyCode) : null
  const pct =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null
  const inStock = result.unavailable ? false : result.availability ? !/sold out|out of stock|unavailable/i.test(result.availability) : true
  const chart = result.sizeChart && result.sizeChart.length ? result.sizeChart : null
  const logo = SITE_LOGOS[theme.logo]

  const vars = { '--pdp-accent': theme.accent, '--pdp-accent-soft': theme.accentSoft } as CSSProperties

  return (
    <div className={PDP_CONTAINER} style={vars}>
      <div className={PDP_GRID}>
        <div className="min-w-0 [grid-area:info]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
              {logo ? (
                <Image src={logo} alt={theme.name} width={theme.logoWidth ?? 60} height={theme.logoHeight ?? 14} />
              ) : (
                <span className="font-bold text-ink/70">{theme.name}</span>
              )}
            </a>
            {result.rating && (
              <>
                <span className="text-ink/20">·</span>
                <Rating theme={theme} rating={result.rating} count={result.review_count} />
              </>
            )}
          </div>
          {result.brand && result.title && !result.title.toLowerCase().startsWith(result.brand.toLowerCase()) && (
            <p className={PDP_BRAND_LINE}>{result.brand}</p>
          )}
          <h1 className={PDP_TITLE}>{result.title ?? <span className="italic text-ink/40">No title found</span>}</h1>
        </div>

        <div className="min-w-0 [grid-area:gallery]">
          {images.length > 0 ? (
            <ProductGallery
              images={images}
              title={result.title}
              resetKey={result.url}
              theme={{
                frameBorder: 'border-ink/10',
                activeThumb: 'border-[var(--pdp-accent)] ring-1 ring-[var(--pdp-accent)]',
                restingThumb: 'border-ink/10',
                placeholderText: 'text-ink/40',
              }}
            />
          ) : (
            <div className="grid aspect-square place-items-center rounded-xl border border-dashed border-ink/15 bg-card text-xs font-medium text-ink/35">
              No images found
            </div>
          )}
        </div>

        <div className={PDP_REST}>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {price ? (
              <p className="text-3xl font-bold" style={{ color: theme.price }}>
                {price}
              </p>
            ) : (
              <p className="text-base font-semibold text-ink/40">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-ink/40 line-through">{mrp}</p>}
            {pct != null && pct > 0 && (
              <span
                className={theme.discount.badge ? 'rounded px-1.5 py-0.5 text-[11px] font-bold text-white' : 'text-sm font-bold'}
                style={theme.discount.badge ? { backgroundColor: theme.discount.color } : { color: theme.discount.color }}
              >
                {(theme.discount.format ?? ((p) => `${p}% off`))(pct)}
              </span>
            )}
          </div>
          {theme.priceNote && <p className="mt-1 text-[11px] font-medium text-ink/40">{theme.priceNote}</p>}

          {variants.length > 0 && (
            <div className="mt-5 flex flex-col gap-4">
              {variants.map((dim) => (
                <OptionRow
                  key={dim.dimension}
                  dim={dim}
                  selected={selection[dim.dimension] ?? null}
                  onPick={(opt) => pick(dim, opt)}
                  sizeChart={chart && /size/i.test(dim.dimension) ? <SizeChartLink chart={chart} selectedSize={selection[dim.dimension] ?? null} /> : undefined}
                />
              ))}
            </div>
          )}

          <p className="mt-5 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-ink/45">Currently unavailable</span>
            ) : inStock ? (
              <span style={{ color: theme.stock }}>In stock</span>
            ) : (
              <span className="text-ink/45">{result.availability}</span>
            )}
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
                <div className="flex flex-none items-center gap-2 rounded-xl border border-ink/15 px-1.5 py-1.5 sm:gap-3.5 sm:px-2.5">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => onQtyChange(Math.max(1, qty - 1))}
                    className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-ink/30 active:scale-90"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="min-w-[20px] text-center font-bold tabular-nums">{qty}</span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => onQtyChange(qty + 1)}
                    className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-ink/30 active:scale-90"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label={inWishlist ? 'Remove from wishlist' : 'Save to wishlist'}
                  aria-pressed={inWishlist}
                  onClick={onToggleWishlist}
                  disabled={!canAct}
                  className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl border border-ink/15 text-ink/50 transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Heart size={17} fill={inWishlist ? 'currentColor' : 'none'} color={inWishlist ? '#e11d48' : 'currentColor'} />
                </button>
                <RequestActionButton
                  onClick={onAddToCart}
                  disabled={!canAct}
                  loading={loading}
                  unavailable={result.unavailable}
                  unavailableLabel="NOT AVAILABLE"
                  icon={justAdded ? <Check size={16} /> : theme.primary.icon === 'cart' ? <ShoppingCart size={16} /> : <ShoppingBag size={16} />}
                  color={theme.primary.color}
                  disabledColor="#c7c7c7"
                  className="min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 py-3 text-sm font-bold sm:px-5 hover:brightness-95"
                >
                  {justAdded ? 'ADDED' : theme.primary.label}
                </RequestActionButton>
              </div>
              <RequestActionButton
                onClick={onRequestReview}
                disabled={!canAct}
                loading={loading}
                unavailable={result.unavailable}
                unavailableLabel="NOT AVAILABLE"
                icon={<ShoppingCart size={16} />}
                color={theme.quote.color}
                disabledColor="#c7c7c7"
                className="grow basis-full whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold hover:brightness-95 sm:grow-0 sm:basis-auto"
              >
                GET QUOTE
              </RequestActionButton>
            </div>
            <p className="text-xs text-ink/40">You will not be charged now. This is just a request.</p>
            {theme.showSeller && result.seller && (
              <p className="text-xs text-ink/50">
                Sold by <span className="font-semibold text-ink/70">{result.seller}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <InfoTabs result={result} accent={theme.accent} />
    </div>
  )
}
