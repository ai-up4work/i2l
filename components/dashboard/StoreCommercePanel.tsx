// components/platforms/StoreCommercePanel.tsx
'use client'

import { useState } from 'react'
import { Truck, ShieldCheck, Minus, Plus, ShoppingCart, ShoppingBag, Info, Heart, Check } from 'lucide-react'
import type { ScrapeResult } from '@/lib/scrape/parsers'

const TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type Tab = (typeof TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold text-ink/70">{label}</dt>
      <dd className="text-right text-ink/55">{value}</dd>
    </div>
  )
}

export type StoreCommercePanelProps = {
  result: ScrapeResult
  estimatedPrice?: string
  estimatedPriceNote?: string
  qty: number
  onQtyChange: (qty: number) => void
  inWishlist: boolean
  onToggleWishlist: () => void
  onAddToCart: () => void
  justAdded: boolean
  onRequestReview: () => void
  loading?: boolean
  /** False when there's no valid product snapshot yet (e.g. mid-error) — disables all actions. */
  canAct: boolean
}

/**
 * The WishDrop-specific commerce layer — estimated price, delivery/QC
 * info, qty stepper + wishlist + add-to-cart + get-quote buttons, and
 * the Description/Details/Shipping tabs. Every platform view
 * (AmazonProductView, FlipkartProductView, ...) renders this directly
 * after its own gallery/title/price/variant markup, so each store's
 * section is self-contained: its own scraped-listing UI PLUS this same
 * shared action/tabs block, all in one place. ItemInfoModal no longer
 * renders any of this itself.
 */
export default function StoreCommercePanel({
  result,
  estimatedPrice,
  estimatedPriceNote = 'Incl. all charges & doorstep delivery',
  qty,
  onQtyChange,
  inWishlist,
  onToggleWishlist,
  onAddToCart,
  justAdded,
  onRequestReview,
  loading = false,
  canAct,
}: StoreCommercePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Description')

  return (
    <div className="flex flex-col gap-5 border-t border-ink/10 pt-6 sm:gap-6">
      {estimatedPrice && (
        <div className="rounded-xl bg-teal-deep/[0.06] px-4 py-4 sm:px-5">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink/55">
            Estimated WishDrop Price
            <Info size={12} className="text-ink/35" />
          </span>
          <div
            key={estimatedPrice}
            className="mt-1 font-display text-3xl text-ink motion-safe:[animation:priceUpdatePulse_0.3s_ease-out_both]"
          >
            {estimatedPrice}
          </div>
          <p className="mt-1 text-xs text-ink/45">{estimatedPriceNote}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex items-start gap-2.5 rounded-xl border border-ink/10 bg-card px-3.5 py-3">
          <Truck size={16} strokeWidth={1.6} className="mt-0.5 flex-none text-ink/45" />
          <div className="text-xs leading-snug">
            <div className="text-ink/45">Delivery Estimate</div>
            <div className="font-semibold text-ink">12 – 18 working days</div>
          </div>
        </div>
        <div className="flex items-start gap-2.5 rounded-xl border border-ink/10 bg-card px-3.5 py-3">
          <ShieldCheck size={16} strokeWidth={1.6} className="mt-0.5 flex-none text-ink/45" />
          <div className="text-xs leading-snug">
            <div className="text-ink/45">Quality Check</div>
            <div className="font-semibold text-ink">100% checked before shipping</div>
          </div>
        </div>
      </div>

      <div
        className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-ink/10 bg-parchment/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm
          sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-none items-center gap-3.5 rounded-xl border border-ink/15 px-2.5 py-1.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-teal/30 hover:bg-teal/5 hover:text-teal-deep active:scale-90"
            >
              <Minus size={15} />
            </button>
            <span className="min-w-[20px] text-center font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQtyChange(qty + 1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-teal/30 hover:bg-teal/5 hover:text-teal-deep active:scale-90"
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
            <Heart
              key={inWishlist ? 'saved' : 'unsaved'}
              size={17}
              className={inWishlist ? 'motion-safe:[animation:heartPop_0.25s_ease-out_both]' : undefined}
              fill={inWishlist ? 'currentColor' : 'none'}
              color={inWishlist ? '#e11d48' : 'currentColor'}
            />
          </button>

          <button
            type="button"
            onClick={onAddToCart}
            disabled={loading || result.unavailable || !canAct}
            className="flex min-w-[130px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink/15 px-4 py-3 text-sm font-semibold text-ink transition-all duration-200 hover:border-teal/30 hover:bg-teal/5 hover:text-teal-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {justAdded ? <Check size={16} className="text-teal-deep" /> : <ShoppingBag size={16} />}
            {justAdded ? 'Added' : 'Add to Cart'}
          </button>

          <button
            type="button"
            onClick={onRequestReview}
            disabled={loading || result.unavailable || !canAct}
            className="flex min-w-[150px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-deep hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/25"
          >
            <ShoppingCart size={16} />
            {result.unavailable ? 'Not Available' : 'Get Quote'}
          </button>
        </div>
      </div>
      <p className="-mt-3 text-xs text-ink/40">You will not be charged now. This is just a request.</p>

      <div className="border-t border-ink/10 pt-4">
        <div className="flex gap-5 border-b border-ink/10">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? 'border-teal-deep text-ink'
                  : 'border-transparent text-ink/40 hover:text-ink/70'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div
          key={activeTab}
          className="min-h-[96px] pb-2 pt-4 text-sm leading-relaxed text-ink/65 motion-safe:[animation:tabFadeIn_0.18s_ease-out_both]"
        >
          {activeTab === 'Description' &&
            ((result as ScrapeResult & { description?: string }).description ? (
              <p>{(result as ScrapeResult & { description?: string }).description}</p>
            ) : (
              <p className="text-ink/45">
                We don&apos;t have a description for this listing. Here&apos;s the title instead:{' '}
                {result.title ?? 'no title available.'}
              </p>
            ))}
          {activeTab === 'Details' && (
            <dl className="flex flex-col gap-1.5 text-xs">
              {result.brand && <DetailRow label="Brand" value={result.brand} />}
              {result.mpn && <DetailRow label="Model" value={result.mpn} />}
              {result.categoryPath && <DetailRow label="Category" value={result.categoryPath} />}
              {result.itemSpecifics?.map((spec) => (
                <DetailRow key={spec.name} label={spec.name} value={spec.value} />
              ))}
              {!result.brand && !result.mpn && !result.itemSpecifics?.length && (
                <p className="text-ink/45">We don&apos;t have any additional details for this listing.</p>
              )}
            </dl>
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
                  <p className="mt-1 text-ink/45">
                    We don&apos;t have shipping details from the seller for this listing.
                  </p>
                )
              )}
            </dl>
          )}
        </div>
      </div>
    </div>
  )
}