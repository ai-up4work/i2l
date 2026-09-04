'use client'

import { useState } from 'react'
import {
  X,
  Truck,
  ShieldCheck,
  Minus,
  Plus,
  ShoppingCart,
  Info,
  Loader2,
  Zap,
} from 'lucide-react'
import type { ScrapeResult } from '@/lib/scrape/parsers'
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

/**
 * Right-side "Product Details" overlay. Slides in from the right and
 * occupies half the viewport on desktop (full-width on mobile).
 *
 * The scraped listing itself — gallery, title, price, rating, variant
 * picker — is rendered by the SAME per-platform view components used in
 * the scraper QA tool (app/demo/scraper-qa/platforms/*), so this overlay
 * always shows exactly what that tool shows, and any scraper/layout fix
 * made there benefits both places automatically. Only a truly
 * unrecognized `result.site` falls back to a generic layout.
 *
 * Everything WishDrop-specific — the estimated price box, delivery/QC
 * row, quantity stepper, "Request this item" CTA, and the
 * Description/Details/Shipping tabs — lives in THIS component, wrapped
 * around whichever platform view is picked, since none of that exists in
 * the QA tool.
 */

type ItemOverlayProps = {
  /**
   * Controls whether the panel is visible at all. Pass `true` the moment
   * the shopper clicks "Add request" — BEFORE the scrape resolves — so the
   * slide-in + loading state appears immediately. Don't gate mounting on
   * `!!result`; that's what made the panel appear to "not open" before.
   */
  open: boolean
  /**
   * The scraped listing to display, once available. `null`/`undefined`
   * while `open` is true renders a loading skeleton instead of the full
   * layout — it does not prevent the panel from opening.
   */
  result?: ScrapeResult | null
  /** WishDrop's converted/estimated price shown in the highlighted box (e.g. "LKR 8,450"). */
  estimatedPrice?: string
  /** Small print under the estimated price box. */
  estimatedPriceNote?: string
  /**
   * Fired when a variant tile is clicked in whichever platform view is
   * active. Same signature the platform components already call
   * (`onSelectVariant(url)`) and the same signature as
   * DashboardContext's `selectVariant` — pass that straight through, no
   * wrapper needed.
   */
  onSelectVariant?: (url: string) => void
  qty: number
  onQtyChange: (qty: number) => void
  onClose: () => void
  onRequestItem: () => void
  /** True while a variant re-scrape is in flight — dims the panel. */
  loading?: boolean
}

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

// Fallback for a `result.site` the platform-view map below doesn't
// recognize — deliberately minimal, since this should be rare in
// practice (every site scrapeProduct() supports has a matching view).
function GenericProductView({ result }: { result: ScrapeResult }) {
  const images = result.images?.length ? result.images : []
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="aspect-square overflow-hidden rounded-xl border border-ink/10 bg-white">
        {images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={images[0]} alt={result.title ?? ''} className="h-full w-full object-contain p-2" />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink/20">
            <ShoppingCart size={32} strokeWidth={1.2} />
          </div>
        )}
      </div>
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-ink/50 ring-1 ring-inset ring-ink/10">
          <Zap size={11} className="text-teal-deep" strokeWidth={2} />
          {result.site ?? 'Online store'}
        </span>
        <h3 className="mt-2 font-display text-xl leading-snug text-ink">
          {result.title ?? 'Untitled item'}
        </h3>
        <p className="mt-2 font-display text-xl text-ink">
          {result.currencyCode ?? ''} {result.price ?? '—'}
        </p>
      </div>
    </div>
  )
}

export default function ItemInfoModal({
  open,
  result,
  estimatedPrice,
  estimatedPriceNote = 'Incl. all charges & doorstep delivery',
  onSelectVariant,
  qty,
  onQtyChange,
  onClose,
  onRequestItem,
  loading = false,
}: ItemOverlayProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Description')

  // Only `open` controls whether the panel mounts. `result` being absent
  // (scrape still in flight) shows a skeleton instead — see below.
  if (!open) return null

  const handleSelectVariant = (url: string) => onSelectVariant?.(url)

  const platformView = (() => {
    if (!result || result.error) return null
    switch (result.site) {
      case 'amazon':
        return <AmazonProductView result={result} onSelectVariant={handleSelectVariant} />
      case 'flipkart':
        return <FlipkartProductView result={result} onSelectVariant={handleSelectVariant} />
      case 'meesho':
        return <MeeshoProductView result={result} onSelectVariant={handleSelectVariant} />
      case 'myntra':
        return <MyntraProductView result={result} onSelectVariant={handleSelectVariant} />
      case 'ebay':
        return <EbayProductView result={result} onSelectVariant={handleSelectVariant} />
      case 'ajio':
        return <AjioProductView result={result} onSelectVariant={handleSelectVariant} />
      case 'jiomart':
        return <JioMartProductView result={result} onSelectVariant={handleSelectVariant} />
      case 'snapdeal':
        return <SnapdealProductView result={result} onSelectVariant={handleSelectVariant} />
      case 'shopify':
        return <ShopifyProductView result={result} onSelectVariant={handleSelectVariant} />
      case 'woocommerce':
        return <WooCommerceProductView result={result} onSelectVariant={handleSelectVariant} />
      default:
        return <GenericProductView result={result} />
    }
  })()

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Product details">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[1px] motion-safe:[animation:overlayFadeIn_0.2s_ease-out_both]"
        onClick={onClose}
      />

      <style>{`
        @keyframes overlayFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes panelSlideIn { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      `}</style>

      <div className="absolute inset-y-0 right-0 flex w-full max-w-full flex-col bg-parchment shadow-lift motion-safe:[animation:panelSlideIn_0.28s_cubic-bezier(0.16,1,0.3,1)_both] lg:w-1/2">
        {/* Header */}
        <div className="flex flex-none items-center justify-between border-b border-ink/10 bg-card px-7 py-5">
          <h2 className="font-display text-lg text-ink">Product Details</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-ink/50 transition-all duration-200 hover:rotate-90 hover:bg-ink/5 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          className={`flex flex-1 flex-col gap-7 overflow-auto p-7 transition-opacity duration-200 ${
            loading ? 'pointer-events-none opacity-50' : 'opacity-100'
          }
            [scrollbar-width:thin] [scrollbar-color:theme(colors.ink/25%)_transparent]
            [&::-webkit-scrollbar]:w-1.5
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb]:bg-ink/20`}
        >
          {!result ? (
            <ItemOverlaySkeleton />
          ) : result.error ? (
            <div className="rounded-xl border border-red-300/40 bg-red-50 p-5 text-sm text-ink/70">
              Couldn&apos;t read this listing: {result.error}
            </div>
          ) : (
            <>
              {platformView}

              {/* WishDrop-specific layer below the platform's own layout */}
              <div className="flex flex-col gap-4">
                {estimatedPrice && (
                  <div className="rounded-xl border border-gold/25 bg-gold/10 px-4 py-3">
                    <span className="flex items-center gap-1 text-xs font-semibold text-ink/60">
                      Estimated WishDrop Price <Info size={12} />
                    </span>
                    <div className="mt-0.5 font-display text-xl text-ink">{estimatedPrice}</div>
                    <p className="mt-0.5 text-xs text-ink/45">{estimatedPriceNote}</p>
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

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3.5 rounded-xl border border-ink/15 px-2.5 py-1.5">
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
                    onClick={onRequestItem}
                    disabled={loading || result.unavailable}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-deep hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/25"
                  >
                    <ShoppingCart size={16} />
                    {result.unavailable ? 'Currently unavailable' : 'Request this item'}
                  </button>
                </div>
                <p className="-mt-1 text-xs text-ink/40">You will not be charged now. This is just a request.</p>

                <div className="mt-2 border-t border-ink/10 pt-4">
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
                  <div className="pt-4 text-sm leading-relaxed text-ink/65">
                    {activeTab === 'Description' && (
                      <p>{result.title ? `${result.title}.` : 'No description available for this listing.'}</p>
                    )}
                    {activeTab === 'Details' && (
                      <dl className="flex flex-col gap-1.5 text-xs">
                        {result.brand && <DetailRow label="Brand" value={result.brand} />}
                        {result.mpn && <DetailRow label="Model" value={result.mpn} />}
                        {result.categoryPath && <DetailRow label="Category" value={result.categoryPath} />}
                        {result.itemSpecifics?.map((spec) => (
                          <DetailRow key={spec.name} label={spec.name} value={spec.value} />
                        ))}
                        {!result.brand && !result.mpn && !result.itemSpecifics?.length && (
                          <p className="text-ink/45">No additional details available.</p>
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
                        {result.availability && <DetailRow label="Availability" value={result.availability} />}
                      </dl>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ItemOverlaySkeleton() {
  return (
    <div className="flex w-full flex-col gap-7 motion-safe:[animation:overlayFadeIn_0.3s_ease-out_both] sm:flex-row">
      <div className="flex flex-none gap-3 sm:w-[240px]">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="size-12 shrink-0 animate-pulse rounded-lg bg-ink/[0.06]" />
          ))}
        </div>
        <div className="aspect-square flex-1 animate-pulse rounded-xl bg-ink/[0.06]" />
      </div>
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink/50">
          <Loader2 size={15} className="animate-spin" />
          Reading the product page…
        </div>
        <div className="h-4 w-3/4 animate-pulse rounded bg-ink/[0.06]" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-ink/[0.06]" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-ink/[0.06]" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-ink/[0.06]" />
      </div>
    </div>
  )
}