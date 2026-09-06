// components/platforms/FlipkartProductView.tsx
'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Star, Minus, Plus, Heart, ShoppingBag, ShoppingCart, Check } from 'lucide-react'
import { formatPrice } from '@/lib/currency'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'

/**
 * Renders a scrape result using the SAME structural layout as
 * AmazonProductView — gallery + buy box side by side (max-w-6xl),
 * main image with a thumbnail strip beneath it, buy box ordered as
 * platform/rating -> title -> price -> variants -> stock -> original
 * listing link -> FlipkartCommerceActions, then a bottom-most
 * full-width ProductInfoTabs section — but restyled with Flipkart's
 * own visual language instead of Amazon's teal-deep tokens:
 *   - blue (#2874F0) links/accents
 *   - green (#388E3C) rating pill + "Hot Deal" tag + in-stock text
 *   - orange (#ff9f00 / #fb641b) commerce CTAs
 *   - "Sold by X" seller line, "-X%" discount, struck MRP
 *
 * Swatch/size tiles flagged `outOfStock` by the extractor render
 * disabled + muted with a small "Out of stock" label, same treatment
 * as a tile with no resolvable link.
 */

function fmt(amount: string | null | undefined, currency: string | null | undefined) {
  const n = amount != null ? Number(amount) : NaN
  if (Number.isNaN(n)) return null
  try {
    return formatPrice(n, currency ?? 'LKR')
  } catch {
    return `${currency ?? ''} ${n}`.trim()
  }
}

/** Flipkart's green rating pill — filled white star + numeric rating. */
function FlipkartRatingPill({ rating, count }: { rating: string | null | undefined; count?: string | null }) {
  const value = rating ? parseFloat(rating) : NaN
  if (Number.isNaN(value)) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5 rounded bg-[#388E3C] px-1.5 py-0.5 text-xs font-bold text-white">
        {value.toFixed(1)}
        <Star size={11} className="fill-white text-white" strokeWidth={0} />
      </span>
      {count && <span className="text-xs font-medium text-[#878787]">({count})</span>}
    </span>
  )
}

/** Color/style swatch tile — square image chip, Amazon's rounded-full
 * swatch swapped for Flipkart's rounded-square thumbnail treatment. */
function FlipkartSwatch({
  label,
  imageUrl,
  price,
  originalPrice,
  selected,
  outOfStock,
  onClick,
  disabledTitle,
}: {
  label: string
  imageUrl?: string | null
  price?: string | null
  originalPrice?: string | null
  selected: boolean
  outOfStock?: boolean
  onClick?: () => void
  disabledTitle?: string
}) {
  const interactive = !!onClick && !outOfStock
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={interactive ? onClick : undefined}
        title={outOfStock ? 'Out of stock' : disabledTitle}
        aria-pressed={selected}
        aria-label={label}
        disabled={!interactive}
        className={
          'relative h-14 w-14 flex-none overflow-hidden rounded-xl border-[1.5px] bg-cover bg-center bg-[#f5f5f5] transition-all ' +
          (selected
            ? 'border-[#2874F0] ring-1 ring-[#2874F0]'
            : outOfStock
              ? 'cursor-not-allowed border-[#e8e8e8]'
              : interactive
                ? 'border-[#d6d6d6] hover:border-[#878787] cursor-pointer'
                : 'cursor-not-allowed border-[#e8e8e8] opacity-50')
        }
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
      >
        {!imageUrl && (
          <span className="grid h-full w-full place-items-center text-[9px] font-bold uppercase tracking-tight text-[#a0a0a0]">
            {label.trim().slice(0, 2)}
          </span>
        )}
        {outOfStock && (
          <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[7px] font-bold uppercase tracking-wide text-white">
            Out of stock
          </span>
        )}
        {imageUrl && outOfStock && <span className="absolute inset-0 bg-white/40" />}
      </button>

      {price && <span className="text-[10px] font-semibold text-[#212121]">{price}</span>}
      {originalPrice && <span className="text-[10px] font-normal text-[#a0a0a0] line-through">{originalPrice}</span>}
    </span>
  )
}

/** Size (or any non-image) dimension — plain pill, matching Flipkart's
 * text-only size picker instead of Amazon's chip. */
function FlipkartPill({
  label,
  price,
  originalPrice,
  selected,
  outOfStock,
  onClick,
  disabledTitle,
}: {
  label: string
  price?: string | null
  originalPrice?: string | null
  selected: boolean
  outOfStock?: boolean
  onClick?: () => void
  disabledTitle?: string
}) {
  const interactive = !!onClick && !outOfStock
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      title={outOfStock ? 'Out of stock' : disabledTitle}
      aria-pressed={selected}
      disabled={!interactive}
      className={
        'flex flex-col items-center rounded-lg border-[1.5px] px-2.5 py-1.5 text-xs font-medium transition-colors ' +
        (selected
          ? 'border-[#2874F0] bg-[#eaf2ff] text-[#212121]'
          : outOfStock
            ? 'cursor-not-allowed border-[#e8e8e8] text-[#c7c7c7] line-through'
            : interactive
              ? 'border-[#d6d6d6] text-[#212121] hover:border-[#878787] cursor-pointer'
              : 'cursor-not-allowed border-[#e8e8e8] text-[#c7c7c7]')
      }
    >
      {label}
      {price && (
        <span className={`text-[10px] font-semibold ${selected ? 'text-[#2874F0]' : 'text-[#212121]/70'}`}>{price}</span>
      )}
      {originalPrice && (
        <span className={`text-[10px] font-normal line-through ${selected ? 'text-[#2874F0]/50' : 'text-[#a0a0a0]'}`}>
          {originalPrice}
        </span>
      )}
    </button>
  )
}

/**
 * Flipkart-styled qty/wishlist/cart/request block — identical shape
 * and slot to AmazonCommerceActions (qty stepper, wishlist heart, Add
 * to Cart, Get Quote, all inline in one wrapping row), just in
 * Flipkart's orange/orange-red color language.
 */
function FlipkartCommerceActions({
  result,
  qty,
  onQtyChange,
  inWishlist,
  onToggleWishlist,
  onAddToCart,
  justAdded,
  onRequestReview,
  loading,
  canAct,
}: {
  result: ScrapeResult
  qty: number
  onQtyChange: (qty: number) => void
  inWishlist: boolean
  onToggleWishlist: () => void
  onAddToCart: () => void
  justAdded: boolean
  onRequestReview: () => void
  loading?: boolean
  canAct: boolean
}) {
  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-none items-center gap-3.5 rounded-xl border border-[#d6d6d6] px-2.5 py-1.5">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => onQtyChange(Math.max(1, qty - 1))}
            className="grid h-7 w-7 place-items-center rounded-md border border-[#d6d6d6] text-[#878787] transition-colors hover:border-[#2874F0]/40 hover:bg-[#2874F0]/5 hover:text-[#2874F0] active:scale-90"
          >
            <Minus size={15} />
          </button>
          <span className="min-w-[20px] text-center font-bold tabular-nums text-[#212121]">{qty}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => onQtyChange(qty + 1)}
            className="grid h-7 w-7 place-items-center rounded-md border border-[#d6d6d6] text-[#878787] transition-colors hover:border-[#2874F0]/40 hover:bg-[#2874F0]/5 hover:text-[#2874F0] active:scale-90"
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
          className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl border border-[#d6d6d6] text-[#878787] transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Heart size={17} fill={inWishlist ? 'currentColor' : 'none'} color={inWishlist ? '#e11d48' : 'currentColor'} />
        </button>

        <button
          type="button"
          onClick={onAddToCart}
          disabled={loading || result.unavailable || !canAct}
          className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#ff9f00] px-4 py-3 text-sm font-bold text-white transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {justAdded ? <Check size={16} /> : <ShoppingBag size={16} />}
          {justAdded ? 'ADDED' : 'ADD TO CART'}
        </button>

        <button
          type="button"
          onClick={onRequestReview}
          disabled={loading || result.unavailable || !canAct}
          className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#fb641b] px-5 py-3 text-sm font-bold text-white transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#c7c7c7]"
        >
          <ShoppingCart size={16} />
          {result.unavailable ? 'NOT AVAILABLE' : 'GET QUOTE'}
        </button>
      </div>

      <p className="text-xs text-[#878787]">You will not be charged now. This is just a request.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * ProductInfoTabs — inlined, Flipkart-flavored (blue active indicator),
 * same Description / Details / Shipping & Returns structure and same
 * bottom-most full-width slot as AmazonProductView.
 * ------------------------------------------------------------------- */

const INFO_TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type InfoTab = (typeof INFO_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold text-[#212121]/80">{label}</dt>
      <dd className="text-right text-[#878787]">{value}</dd>
    </div>
  )
}

function SizeChart({ chart }: { chart: NonNullable<ScrapeResult['sizeChart']> }) {
  return (
    <div className="flex flex-col gap-3">
      {chart.map((table, i) => (
        <div key={i}>
          {'title' in table && table.title && (
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#a0a0a0]">{table.title}</p>
          )}
          <table className="w-full border-collapse text-left text-[12px] text-[#212121]">
            <thead>
              <tr className="border-b border-[#e0e0e0]">
                {table.columns.map((col) => (
                  <th key={col} className="py-1 pr-4 font-semibold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="border-b border-[#f0f0f0] last:border-0">
                  {table.columns.map((col) => (
                    <td key={col} className="py-1 pr-4">
                      {row[col]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function ProductInfoTabs({ result }: { result: ScrapeResult }) {
  const [activeTab, setActiveTab] = useState<InfoTab>('Description')
  const hasRealSizeChart = !!result.sizeChart && result.sizeChart.length > 0

  return (
    <div className="mt-8 border-t border-[#e0e0e0] pt-6">
      <div className="flex gap-5 border-b border-[#e0e0e0]">
        {INFO_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'border-[#2874F0] text-[#212121]'
                : 'border-transparent text-[#878787] hover:text-[#212121]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div
        key={activeTab}
        className="min-h-[96px] pb-2 pt-4 text-sm leading-relaxed text-[#484848] motion-safe:[animation:tabFadeIn_0.18s_ease-out_both]"
      >
        {activeTab === 'Description' &&
          ((result as ScrapeResult & { description?: string }).description ? (
            <p>{(result as ScrapeResult & { description?: string }).description}</p>
          ) : (
            <p className="text-[#a0a0a0]">
              We don&apos;t have a description for this listing. Here&apos;s the title instead:{' '}
              {result.title ?? 'no title available.'}
            </p>
          ))}
        {activeTab === 'Details' && (
          <div className="flex flex-col gap-4">
            <dl className="flex flex-col gap-1.5 text-xs">
              {result.brand && <DetailRow label="Brand" value={result.brand} />}
              {result.mpn && <DetailRow label="Model" value={result.mpn} />}
              {result.categoryPath && <DetailRow label="Category" value={result.categoryPath} />}
              {result.itemSpecifics?.map((spec) => (
                <DetailRow key={spec.name} label={spec.name} value={spec.value} />
              ))}
              {!result.brand && !result.mpn && !result.itemSpecifics?.length && !hasRealSizeChart && (
                <p className="text-[#a0a0a0]">We don&apos;t have any additional details for this listing.</p>
              )}
            </dl>

            {hasRealSizeChart && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#a0a0a0]">Size chart</p>
                <div className="rounded-lg border border-[#e0e0e0] bg-[#fafafa] p-3">
                  <SizeChart chart={result.sizeChart!} />
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'Shipping & Returns' && (
          <dl className="flex flex-col gap-1.5 text-xs">
            {result.itemLocation && <DetailRow label="Ships from" value={result.itemLocation} />}
            <DetailRow
              label="Returns"
              value={
                result.returnsAccepted
                  ? `Accepted${result.returnPeriodDays ? ` within ${result.returnPeriodDays} days` : ''}`
                  : 'Not accepted by seller'
              }
            />
            {result.availability ? (
              <DetailRow label="Availability" value={result.availability} />
            ) : (
              !result.itemLocation && (
                <p className="mt-1 text-[#a0a0a0]">
                  We don&apos;t have shipping details from the seller for this listing.
                </p>
              )
            )}
          </dl>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------- */

export default function FlipkartProductView({
  result,
  onSelectVariant,
  qty,
  onQtyChange,
  inWishlist,
  onToggleWishlist,
  onAddToCart,
  justAdded,
  onRequestReview,
  loading,
  canAct,
}: PlatformViewProps) {
  const images = result.images ?? []
  const [mainImage, setMainImage] = useState(images[0] ?? null)
  const [selectedByDimension, setSelectedByDimension] = useState<Record<string, string>>({})

  useEffect(() => {
    setMainImage((result.images ?? [])[0] ?? null)

    const initial: Record<string, string> = {}
    for (const dim of result.variants ?? []) {
      const selectedOpt = dim.options.find((o) => o.selected)
      if (selectedOpt) initial[dim.dimension] = selectedOpt.label
    }
    setSelectedByDimension(initial)
  }, [result.url, result.variants])

  function pickOption(dimension: string, label: string, url: string | null) {
    setSelectedByDimension((prev) => ({ ...prev, [dimension]: label }))
    if (url) onSelectVariant(url)
  }

  const price = fmt(result.price, result.currencyCode)
  const mrp = result.mrp && result.mrp !== result.price ? fmt(result.mrp, result.currencyCode) : null
  const pctOff =
    result.mrp && result.price && Number(result.mrp) > Number(result.price)
      ? Math.round((1 - Number(result.price) / Number(result.mrp)) * 100)
      : null

  const inStock = result.unavailable
    ? false
    : result.availability
      ? !/sold out|out of stock|unavailable/i.test(result.availability)
      : true

  return (
    <div className="mx-auto max-w-6xl px-6 lg:px-10 font-sans">
      <div className="grid gap-8 sm:grid-cols-2">
        {/* Image gallery — main image + thumbnail strip beneath,
            same structure as AmazonProductView. */}
        <div className="min-w-0">
          <div className="aspect-square overflow-hidden rounded-xl border border-[#e0e0e0] bg-white">
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={result.title ?? 'Product image'} className="h-full w-full object-contain p-2" />
            ) : (
              <div className="grid h-full place-items-center text-xs text-[#a0a0a0]">No image found</div>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {images.slice(0, 8).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setMainImage(src)}
                  className={`h-16 w-16 flex-none overflow-hidden rounded-xl border transition-colors ${
                    mainImage === src ? 'border-[#2874F0] ring-1 ring-[#2874F0]' : 'border-[#e0e0e0]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Buy box — same element order as AmazonProductView:
            platform/rating -> title -> seller/hot-deal -> price ->
            variants -> stock -> link -> commerce actions. */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#878787]">
            <span>Flipkart</span>
            {result.rating && (
              <>
                <span className="text-[#d6d6d6]">·</span>
                <FlipkartRatingPill rating={result.rating} count={result.review_count} />
              </>
            )}
          </div>

          <h1 className="mt-2 text-2xl font-medium leading-snug tracking-tight text-[#212121] sm:text-3xl">
            {result.title ?? <span className="italic text-[#a0a0a0]">No title found</span>}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {result.seller && <span className="text-xs font-medium text-[#878787]">Sold by {result.seller}</span>}
            {pctOff !== null && pctOff >= 50 && (
              <span className="rounded bg-[#388E3C] px-2 py-0.5 text-[10px] font-bold text-white">Hot Deal</span>
            )}
          </div>

          <div className="mt-3 flex items-baseline gap-2.5">
            {mrp && pctOff !== null && <span className="text-sm font-semibold text-[#388E3C]">↓{pctOff}%</span>}
            {price ? (
              <p className="text-3xl font-bold text-[#212121]">{price}</p>
            ) : (
              <p className="text-base font-semibold text-[#a0a0a0]">No price found</p>
            )}
            {mrp && <p className="text-base font-semibold text-[#878787] line-through">{mrp}</p>}
          </div>

          {!!result.variants?.length && (
            <div className="mt-4 flex flex-wrap gap-6">
              {result.variants.map((dim) => {
                const hasImages = dim.options.some((o) => !!o.image)
                const selectedLabel = selectedByDimension[dim.dimension] ?? null

                return (
                  <div key={dim.dimension}>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#a0a0a0]">
                      {dim.dimension}
                    </p>
                    <div className={hasImages ? 'flex flex-wrap gap-3' : 'flex flex-wrap gap-1.5'}>
                      {dim.options.map((opt, i) => {
                        const optPrice = fmt(opt.price, opt.currencyCode)
                        const optOriginalPrice =
                          opt.mrp && opt.mrp !== opt.price ? fmt(opt.mrp, opt.currencyCode) : null
                        const selected = opt.label === selectedLabel
                        const disabledTitle = opt.url ? undefined : `${opt.label} — no direct link found, selection is visual only`
                        const onPick = () => pickOption(dim.dimension, opt.label, opt.url)
                        return hasImages ? (
                          <FlipkartSwatch
                            key={`${opt.label}-${i}`}
                            label={opt.label}
                            imageUrl={opt.image}
                            price={optPrice}
                            originalPrice={optOriginalPrice}
                            selected={selected}
                            outOfStock={opt.outOfStock}
                            onClick={onPick}
                            disabledTitle={disabledTitle}
                          />
                        ) : (
                          <FlipkartPill
                            key={opt.label}
                            label={opt.label}
                            price={optPrice}
                            originalPrice={optOriginalPrice}
                            selected={selected}
                            outOfStock={opt.outOfStock}
                            onClick={onPick}
                            disabledTitle={disabledTitle}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p className="mt-5 text-sm font-semibold">
            {result.unavailable ? (
              <span className="text-[#FF6161]">Sold Out</span>
            ) : inStock ? (
              <span className="text-[#388E3C]">In stock</span>
            ) : (
              <span className="text-[#878787]">{result.availability}</span>
            )}
          </p>

          {result.url && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#2874F0] hover:underline"
            >
              Open original listing <ExternalLink size={12} />
            </a>
          )}

          <FlipkartCommerceActions
            result={result}
            qty={qty}
            onQtyChange={onQtyChange}
            inWishlist={inWishlist}
            onToggleWishlist={onToggleWishlist}
            onAddToCart={onAddToCart}
            justAdded={justAdded}
            onRequestReview={onRequestReview}
            loading={loading}
            canAct={canAct}
          />
        </div>
      </div>

      {/* Description/Details/Shipping & Returns — bottom-most,
          full-width section of the entire component. */}
      <ProductInfoTabs result={result} />
    </div>
  )
}