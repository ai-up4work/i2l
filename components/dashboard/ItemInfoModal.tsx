'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X, ShoppingCart, Zap, ShoppingBag, Minus, Plus, MessageCircleQuestion, Loader2, RefreshCw, MessageCircle, Truck, Plane, Info, Link } from 'lucide-react'
import RequestActionButton from '@/components/stores/RequestActionButton'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import AmazonProductView from '@/components/platforms/AmazonProductView'
import FlipkartProductView from '@/components/platforms/FlipkartProductView'
import MeeshoProductView from '@/components/platforms/Meeshoproductview'
import MyntraProductView from '@/components/platforms/MyntraProductView'
import EbayProductView from '@/components/platforms/EbayProductView'
import AjioProductView from '@/components/platforms/AjioProductView'
import JioMartProductView from '@/components/platforms/JioMartProductView'
import FirstCryProductView from '@/components/platforms/Firstcryproductview'
import TataCliqProductView from '@/components/platforms/Tatacliqproductview'
import NykaaProductView from '@/components/platforms/Nykaaproductview'
import HopscotchProductView from '@/components/platforms/Hopscotchproductview'
import WestsideProductView from '@/components/platforms/Westsideproductview'
import SnapdealProductView from '@/components/platforms/SnapdealProductView'
import ShopifyProductView from '@/components/platforms/Shopifyproductview'
import WooCommerceProductView from '@/components/platforms/Woocommerceproductview'
import { useCart, type CartProduct } from '@/contexts/Cartcontext'
import { useWishlist, type WishlistProduct } from '@/contexts/Wishlistcontext'
import {
  getDualDeliveryPricing,
  formatLKR,
  type ProductPriceableItem,
  type DeliveryPriceOption,
} from '@/lib/pricing'
import Image from 'next/image'

/**
 * CHANNEL 1/2 (priced, real listing) vs CHANNEL 3 (unpriced — ogOnly or
 * an outright scrape failure) take two DIFFERENT paths through this
 * modal, on purpose:
 *
 * - Channel 1/2: "Add to Cart" is the primary commit — no price is
 *   ever charged here, only added as a cart line (see handleAddToCart).
 *   "Get quote" opens the small centered <QuoteModal> purely to preview
 *   the Economy/Express breakdown before committing, with "Add to
 *   cart" / "Go to cart" (-> /account/cart) inside it. onSubmitRequest
 *   is never called on this path.
 * - Channel 3 (GenericProductView / UnreadableListingFallback): there
 *   is no trustworthy price to build a cart line or a breakdown from
 *   (an unpriced item would otherwise silently become a $0 cart line —
 *   see toPriceableItem's `price: ... ?? 0` fallback), so neither
 *   "Add to Cart" nor the QuoteModal apply here at all. Its action
 *   (onGoToChat/handleStartChat) calls onSubmitRequest directly —
 *   DashboardContext's confirmRequest, which creates the `requests` row
 *   and seeds the chat thread itself, then navigates to
 *   /account/messages — no intermediate modal step, straight into a
 *   real conversation with the team.
 */

type ItemOverlayProps = {
  open: boolean
  result?: ScrapeResult | null
  estimatedPrice?: string
  estimatedPriceNote?: string
  estimatedPriceLKR?: number | null
  onSelectVariant?: (url: string) => void
  qty: number
  onQtyChange: (qty: number) => void
  onClose: () => void
  /**
   * Only ever called for a Channel 3 item (see file-level doc comment
   * above) — GenericProductView's "Chat about this item" and
   * UnreadableListingFallback's "Continue via chat" both call this
   * directly, with no modal step in between. Every Channel 1/2 listing
   * goes through Add to Cart / the QuoteModal instead and never touches
   * this prop at all.
   */
  onSubmitRequest?: () => Promise<{ ok: boolean; error?: string }>
  onDeliveryChoiceChange?: (choice: DeliveryChoice) => void
  loading?: boolean
  onRetry?: () => void
}

type DeliveryChoice = 'economy' | 'express'

const ANIMATION_MS = 300

// Counts a displayed LKR figure smoothly from its previous value to a new
// one whenever `value` changes (delivery method switch, qty change, etc.)
// instead of the number jump-cutting.
function AnimatedLKR({ value }: { value: number }) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    if (from === to) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const start = performance.now()
    const duration = 420

    function tick(now: number) {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        prevRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value])

  return <span className="tabular-nums">{formatLKR(display)}</span>
}

function FloatingCloseButton({ onClick, visible }: { onClick: () => void; visible: boolean }) {
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={onClick}
      className={`fixed right-3 z-[60] grid h-10 w-10 flex-none place-items-center rounded-full border border-ink/10 bg-parchment/95 text-ink/60 shadow-lift backdrop-blur-sm transition-all duration-200 hover:rotate-90 hover:bg-ink/5 hover:text-ink sm:right-5
        top-[calc(var(--account-header-h-mobile,0px)+1.25rem)]
        lg:top-[calc(var(--account-header-h-desktop,0px)+1.25rem)]
        ${visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}
        transition-opacity`}
      style={{ transitionDuration: `${ANIMATION_MS}ms` }}
    >
      <X size={18} />
    </button>
  )
}

function toProductSnapshot(result: ScrapeResult) {
  const url = (result as unknown as { url?: string }).url ?? ''
  const id = url || `${result.site ?? 'site'}:${result.title ?? 'untitled'}`
  return {
    id,
    url: url || id,
    site: result.site,
    title: result.title ?? 'Untitled item',
    image: result.images?.[0] ?? null,
    currencyCode: result.currencyCode ?? null,
    weightKg: (result as ScrapeResult & { weightKg?: number | null }).weightKg ?? null,
    source: 'link' as const,
  }
}

function toPriceableItem(result: ScrapeResult): ProductPriceableItem {
  return {
    price: result.price != null ? Number(result.price) : 0,
    currency: result.currencyCode ?? 'USD',
    weightKg: (result as ScrapeResult & { weightKg?: number | null }).weightKg ?? undefined,
  }
}

function canBuildBreakdown(result: ScrapeResult): boolean {
  return !result.ogOnly && result.price != null && !Number.isNaN(Number(result.price)) && Number(result.price) > 0
}

function DeliveryModeToggle({
  value,
  onChange,
}: {
  value: DeliveryChoice
  onChange: (value: DeliveryChoice) => void
}) {
  const options: { key: DeliveryChoice; label: string; sub: string; icon: React.ReactNode }[] = [
    { key: 'economy', label: 'Economy', sub: '3–4 weeks', icon: <Truck size={14} strokeWidth={1.8} /> },
    { key: 'express', label: 'Express', sub: '12–15 days', icon: <Plane size={14} strokeWidth={1.8} /> },
  ]
  const activeIndex = options.findIndex((o) => o.key === value)

  return (
    <div className="relative grid grid-cols-2 gap-1 rounded-xl bg-ink/[0.03] p-1">
      {/* Sliding highlight behind the active option, instead of each
          button re-coloring its own border/background independently. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-teal/10 ring-1 ring-inset ring-teal/25 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ transform: activeIndex === 1 ? 'translateX(calc(100% + 0.25rem))' : 'translateX(0)' }}
      />
      {options.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            className="relative z-10 flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors"
          >
            <span className={active ? 'text-teal-deep' : 'text-ink/40'}>{opt.icon}</span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold transition-colors ${active ? 'text-teal-deep' : 'text-ink'}`}>
                {opt.label}
              </span>
              <span className="block text-[11px] text-ink/40">{opt.sub}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function BreakdownRows({ option, qty }: { option: DeliveryPriceOption; qty: number }) {
  const rows: { label: string; value: number }[] = [
    { label: 'Price', value: option.priceLKR * qty },
    { label: 'Service charge', value: option.serviceChargeLKR * qty },
    { label: 'Delivery', value: option.deliveryFeeLKR * qty },
  ]
  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] text-ink/45">{row.label}</span>
          <span className="text-xs text-ink/70">
            <AnimatedLKR value={row.value} />
          </span>
        </div>
      ))}
    </div>
  )
}

function CompareColumn({
  option,
  qty,
  heading,
  active,
}: {
  option: DeliveryPriceOption
  qty: number
  heading: string
  active?: boolean
}) {
  return (
    <div className={`rounded-xl transition-colors duration-300 ${active ? 'bg-teal/10' : 'bg-ink/[0.03]'} px-3 py-2.5`}>
      <p className={`mb-1.5 text-xs font-semibold ${active ? 'text-teal-deep' : 'text-ink/50'}`}>{heading}</p>
      <BreakdownRows option={option} qty={qty} />
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-ink/[0.08] pt-2">
        <span className="text-xs font-semibold text-ink">Total</span>
        <span className="text-sm font-bold text-ink">
          <AnimatedLKR value={option.actualTotalLKR * qty} />
        </span>
      </div>
    </div>
  )
}

function QuotePricingBlock({
  result,
  qty,
  deliveryChoice,
  onDeliveryChoiceChange,
}: {
  result: ScrapeResult
  qty: number
  deliveryChoice: DeliveryChoice
  onDeliveryChoiceChange: (choice: DeliveryChoice) => void
}) {
  const dual = getDualDeliveryPricing(toPriceableItem(result))
  const selected = deliveryChoice === 'economy' ? dual.economy : dual.express

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs font-semibold text-ink/50">Delivery method</p>
        <DeliveryModeToggle value={deliveryChoice} onChange={onDeliveryChoiceChange} />
      </div>

      {/* Prominent total for the selected method — the number that
          actually matters, given room to breathe instead of competing
          with the per-line breakdown for attention. A short pulse marks
          the moment the delivery method (and therefore the total) changes. */}
      <div
        key={deliveryChoice}
        className="rounded-xl bg-teal/10 px-4 py-3.5 ring-1 ring-inset ring-teal/15 motion-safe:[animation:priceUpdatePulse_0.3s_ease-out]"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold text-teal-deep">
            Total · {deliveryChoice === 'economy' ? 'Economy' : 'Express'}
          </span>
          <span className="font-display text-2xl leading-none text-ink">
            <AnimatedLKR value={selected.actualTotalLKR * qty} />
          </span>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-ink/40">
          Includes currency conversion, freight &amp; handling.
        </p>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
          <Info size={11} />
          Compare delivery methods
        </p>
        <div className="grid grid-cols-2 gap-2">
          <CompareColumn option={dual.express} qty={qty} heading="Express" active={deliveryChoice === 'express'} />
          <CompareColumn option={dual.economy} qty={qty} heading="Economy" active={deliveryChoice === 'economy'} />
        </div>
      </div>
    </div>
  )
}

// Small, centered pricing-only modal. This is what "Get quote" opens for
// a CHANNEL 1/2 (priced) listing — it exists purely so the shopper can
// understand the cost breakdown. The actual order path is Add to cart ->
// Go to cart, handled inline here. NEVER shown for a Channel 3 item — see
// the file-level doc comment; GenericProductView/UnreadableListingFallback
// don't open this at all.
//
// Rendered via a portal straight to document.body. It used to render as a
// nested child of ItemInfoModal's root wrapper, which is `pointer-events-none`
// and caps out at z-30 — so this modal silently inherited `pointer-events: none`
// (nothing in it was clickable) and could never stack above the site's global
// header (its z-[200] only applied within that z-30 stacking context). Portaling
// it out fixes both: it gets its own top-level stacking context so z-[200] is
// truly global, and it explicitly re-enables pointer events for itself.
function QuoteModal({
  open,
  onClose,
  result,
  estimatedPrice,
  estimatedPriceLKR,
  qty,
  onQtyChange,
  deliveryChoice,
  onDeliveryChoiceChange,
  hasBreakdown,
  onAddToCart,
  justAdded,
  onGoToCart,
}: {
  open: boolean
  onClose: () => void
  result: ScrapeResult | null
  estimatedPrice?: string
  estimatedPriceLKR?: number | null
  qty: number
  onQtyChange: (qty: number) => void
  deliveryChoice: DeliveryChoice
  onDeliveryChoiceChange: (choice: DeliveryChoice) => void
  hasBreakdown: boolean
  onAddToCart: () => void
  justAdded: boolean
  onGoToCart: () => void
}) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => setEntered(true))
      return () => cancelAnimationFrame(raf)
    }
    setEntered(false)
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] grid place-items-center p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Pricing quote"
    >
      <div
        className={`absolute inset-0 bg-ink/50 backdrop-blur-sm transition-opacity ${entered ? 'opacity-100' : 'opacity-0'}`}
        style={{ transitionDuration: `${ANIMATION_MS}ms` }}
        onClick={onClose}
      />

      <div
        className={`relative flex w-full max-w-sm flex-col gap-5 rounded-2xl bg-parchment p-5 shadow-lift transition-all ease-[cubic-bezier(0.16,1,0.3,1)] ${
          entered ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'
        }`}
        style={{ transitionDuration: `${ANIMATION_MS}ms` }}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-ink">Pricing</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {result && (
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-lg border border-ink/10 bg-white">
              {result.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.images[0]} alt="" className="h-full w-full object-contain p-1" />
              ) : (
                <ShoppingCart size={16} className="text-ink/20" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{result.title ?? 'Untitled item'}</p>
              <div className="mt-1 flex items-center gap-2.5">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => onQtyChange(Math.max(1, qty - 1))}
                  className="grid h-6 w-6 place-items-center rounded-md border border-ink/10 text-ink/50 transition-colors hover:border-teal/40 hover:bg-teal/5 hover:text-teal-deep"
                >
                  <Minus size={12} />
                </button>
                <span className="min-w-[16px] text-center text-xs font-bold tabular-nums text-ink">{qty}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => onQtyChange(qty + 1)}
                  className="grid h-6 w-6 place-items-center rounded-md border border-ink/10 text-ink/50 transition-colors hover:border-teal/40 hover:bg-teal/5 hover:text-teal-deep"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          </div>
        )}

        {hasBreakdown && result ? (
          <QuotePricingBlock
            result={result}
            qty={qty}
            deliveryChoice={deliveryChoice}
            onDeliveryChoiceChange={onDeliveryChoiceChange}
          />
        ) : (
          <div className="rounded-xl border border-ink/10 bg-card p-4">
            {estimatedPrice ? (
              <>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Estimated total</span>
                <p className="font-display text-2xl text-ink">{estimatedPrice}</p>
              </>
            ) : estimatedPriceLKR != null ? (
              <>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">About</span>
                <p className="font-display text-2xl text-ink">LKR {estimatedPriceLKR.toLocaleString('en-LK')}</p>
                <p className="mt-1 text-xs text-ink/40">Final price confirmed by our team before anything is charged.</p>
              </>
            ) : (
              <div className="flex items-start gap-2 text-ink/60">
                <MessageCircleQuestion size={16} className="mt-0.5 flex-none text-teal-deep" />
                <p className="text-xs">Price to be confirmed by our team.</p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {justAdded ? (
            <button
              type="button"
              onClick={onGoToCart}
              className="flex items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-deep hover:shadow-md active:scale-[0.98]"
            >
              <ShoppingCart size={16} />
              Go to cart
            </button>
          ) : (
            <button
              type="button"
              onClick={onAddToCart}
              className="flex items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-deep hover:shadow-md active:scale-[0.98]"
            >
              <ShoppingCart size={16} />
              Add to cart
            </button>
          )}
          <p className="text-center text-xs text-ink/40">
            Adding to cart doesn&apos;t charge you — you can review everything at checkout.
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}

// CHANNEL 3 fallback for an unrecognized/ogOnly result.site — this is
// the generic Open Graph/JSON-LD path (see ScrapeResult.ogOnly's doc
// comment): no confirmed size/color options, and no price that's been
// double-checked. Deliberately NOT wired to Add to Cart or the
// QuoteModal (see the file-level doc comment) — its single action
// (onGoToChat) calls onSubmitRequest directly and skips straight to a
// real conversation with the team, since that was always where this had
// to end up anyway.
function GenericProductView(
  props: Parameters<typeof AmazonProductView>[0] & {
    onGoToChat: () => void
    submitting: boolean
    submitError: string | null
  },
) {
  const { result, qty, onQtyChange, onGoToChat, loading, canAct, submitting, submitError } = props
  const images = result.images?.length ? result.images : []
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="aspect-square overflow-hidden rounded-xl border border-ink/10 bg-white">
        {images[0] ? (
          <Image src={images[0]} alt={result.title ?? ''} className="h-full w-full object-cover" width={120} height={120} />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink/20">
            <ShoppingBag size={32} strokeWidth={1.2} />
          </div>
        )}
      </div>
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-ink/50 ring-1 ring-inset ring-ink/10">
          <Zap size={11} className="text-teal-deep" strokeWidth={2} />
          {result.site ?? 'Online store'}
        </span>
        {result.resolvedFromShortlink && (
          <span
            title="This was a shortened link — resolved to the real product page before we read it."
            className="ml-1.5 inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-ink/50 ring-1 ring-inset ring-ink/10"
          >
            <Link size={11} className="text-teal-deep" strokeWidth={2} />
            Shortlink
          </span>
        )}
        <h3 className="mt-2 font-display text-xl leading-snug text-ink">{result.title ?? 'Untitled item'}</h3>
        <p className="mt-2 font-display text-xl text-ink">
          {result.currencyCode ?? ''} {result.price ?? '—'}
        </p>

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-teal/[0.06] p-3 text-sm text-ink/70 ring-1 ring-inset ring-teal/15">
          <MessageCircleQuestion size={16} className="mt-0.5 flex-none text-teal-deep" />
          <span>
            This one needs a quick manual check — sizes, colors, and the final price. Start a chat and our team
            will confirm everything with you there, before anything is charged.
          </span>
        </div>

        {submitError && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
            {submitError}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-none items-center gap-3.5 rounded-xl border border-ink/15 px-2.5 py-1.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/10 text-ink/50 transition-colors hover:border-teal/40 hover:bg-teal/5 hover:text-teal-deep active:scale-90"
            >
              <Minus size={15} />
            </button>
            <span className="min-w-[20px] text-center font-bold tabular-nums text-ink">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQtyChange(qty + 1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-ink/10 text-ink/50 transition-colors hover:border-teal/40 hover:bg-teal/5 hover:text-teal-deep active:scale-90"
            >
              <Plus size={15} />
            </button>
          </div>

          <RequestActionButton
            onClick={onGoToChat}
            disabled={!canAct}
            loading={loading || submitting}
            loadingLabel={submitting ? 'Starting chat…' : 'Loading…'}
            unavailable={result.unavailable}
            icon={<MessageCircle size={16} />}
            className="flex-1 whitespace-nowrap rounded-xl bg-teal-deep px-5 py-3 text-sm font-bold text-parchment hover:bg-teal"
          >
            Chat about this item
          </RequestActionButton>
        </div>
        <p className="mt-2 text-xs text-ink/40">You won&rsquo;t be charged now — this opens a chat with our team.</p>
      </div>

    </div>
  )
}

function SlowLoadNotice() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 6000)
    return () => clearTimeout(t)
  }, [])
  if (!show) return null
  return (
    <p className="text-center text-xs text-ink/45 motion-safe:[animation:contentFadeIn_0.3s_ease-out_both]">
      Still working — some sites take a little longer to read. Hang tight.
    </p>
  )
}

function ProductSkeleton() {
  return (
    <div
      className="flex flex-col gap-6 pt-8 sm:gap-7 motion-safe:[animation:contentFadeIn_0.3s_ease-out_both]"
      aria-hidden="true"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="aspect-square animate-pulse rounded-xl border border-ink/10 bg-ink/5" />

        <div className="flex flex-col gap-3">
          <div className="h-5 w-24 animate-pulse rounded-full bg-ink/10" />
          <div className="h-6 w-full animate-pulse rounded-md bg-ink/10" />
          <div className="h-6 w-3/4 animate-pulse rounded-md bg-ink/10" />
          <div className="mt-2 h-7 w-32 animate-pulse rounded-md bg-ink/10" />

          <div className="mt-4 flex flex-col gap-2">
            <div className="h-4 w-40 animate-pulse rounded-md bg-ink/10" />
            <div className="h-4 w-28 animate-pulse rounded-md bg-ink/10" />
          </div>

          <div className="mt-4 flex gap-2.5">
            <div className="h-11 w-11 flex-none animate-pulse rounded-xl bg-ink/10" />
            <div className="h-11 flex-1 animate-pulse rounded-xl bg-ink/10" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-4 border-b border-ink/10 pb-2">
          <div className="h-4 w-20 animate-pulse rounded-md bg-ink/10" />
          <div className="h-4 w-16 animate-pulse rounded-md bg-ink/10" />
          <div className="h-4 w-20 animate-pulse rounded-md bg-ink/10" />
        </div>
        <div className="h-4 w-full animate-pulse rounded-md bg-ink/10" />
        <div className="h-4 w-full animate-pulse rounded-md bg-ink/10" />
        <div className="h-4 w-2/3 animate-pulse rounded-md bg-ink/10" />
      </div>
    </div>
  )
}

// Derives a clean display label from a raw URL for the "we found
// nothing" placeholder card below — same idea as DashboardContext's own
// (unexported) sourceDomainFor, duplicated locally rather than imported
// since that file also carries logic this component shouldn't depend
// on. Never throws on a malformed URL.
function hostnameFromUrl(url?: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// CHANNEL 3 — an outright scrape failure. Same reasoning as
// GenericProductView above: no price at all here, so this never opens
// the QuoteModal or touches the cart. onContinueViaChat calls
// onSubmitRequest directly (handleStartChat), no review step.
//
// By the time this renders, useProductLookup has ALREADY tried the
// OG-tag fallback and it came back genuinely empty (see
// fetchOgFallback's doc comment in hooks/useProductLookup.ts) — there's
// no more image/title data to go fetch here. What this section was
// actually missing was visual consistency: GenericProductView (the
// ogOnly case, one tier up) always shows an image-box + title even when
// the image is a placeholder icon and the title falls back to "Untitled
// item", so a card with literally nothing (no image, no name) read as
// broken next to it. This now renders the same image-placeholder +
// label shape — real image/title if either happened to survive on the
// failed result, a ShoppingBag placeholder icon and the URL's own
// hostname otherwise — so the section stays visually consistent even
// with zero real data.
function UnreadableListingFallback({
  url,
  title,
  image,
  onRetry,
  onContinueViaChat,
  submitting,
  submitError,
}: {
  url?: string | null
  title?: string | null
  image?: string | null
  onRetry?: () => void
  onContinueViaChat: () => void
  submitting?: boolean
  submitError?: string | null
}) {
  const hostname = hostnameFromUrl(url)
  return (
    <div className="flex flex-col gap-6 rounded-xl border border-ink/10 bg-card p-6 text-center motion-safe:[animation:contentFadeIn_0.25s_ease-out_both] sm:flex-row sm:items-center sm:gap-5 sm:text-left">
      <div className="mx-auto grid h-20 w-20 flex-none place-items-center overflow-hidden rounded-xl border border-ink/10 bg-white sm:mx-0">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-contain p-1.5" />
        ) : (
          <ShoppingBag size={26} className="text-ink/20" strokeWidth={1.2} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {hostname && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-parchment px-2 py-0.5 text-xs font-semibold text-ink/50 ring-1 ring-inset ring-ink/10">
            <Zap size={11} className="text-teal-deep" strokeWidth={2} />
            {hostname}
          </span>
        )}
        <p className="mt-1.5 text-sm font-semibold text-ink">
          {title || "We couldn't load this listing automatically"}
        </p>
        <p className="mt-1 text-sm text-ink/55">
          No problem — start a chat and our team will check the details, price, and options with you directly.
        </p>

        {submitError && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
            {submitError}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-ink/15 px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={15} />
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={onContinueViaChat}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-deep hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
            {submitting ? 'Starting chat…' : 'Continue via chat'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ItemInfoModal({
  open,
  result,
  estimatedPrice,
  estimatedPriceNote = 'Incl. all charges & doorstep delivery',
  estimatedPriceLKR,
  onSelectVariant,
  qty,
  onQtyChange,
  onClose,
  onSubmitRequest,
  onDeliveryChoiceChange,
  loading = false,
  onRetry,
}: ItemOverlayProps) {
  const router = useRouter()
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>('economy')
  // CHANNEL 3 ONLY — tracks the direct onSubmitRequest call from
  // GenericProductView/UnreadableListingFallback. Channel 1/2's Add to
  // Cart / QuoteModal path never touches these.
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const cart = useCart()
  const wishlist = useWishlist()

  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      if (unmountTimerRef.current) {
        clearTimeout(unmountTimerRef.current)
        unmountTimerRef.current = null
      }
      setMounted(true)
      const raf = requestAnimationFrame(() => setEntered(true))
      return () => cancelAnimationFrame(raf)
    }

    setEntered(false)
    unmountTimerRef.current = setTimeout(() => {
      setMounted(false)
    }, ANIMATION_MS)
    return () => {
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current)
    }
  }, [open])

  const lastResultKey = useRef<string | null>(null)
  useEffect(() => {
    const key = result ? `${result.site ?? ''}|${result.title ?? ''}` : null
    if (key && key !== lastResultKey.current) {
      lastResultKey.current = key
      setQuoteOpen(false)
      setDeliveryChoice('economy')
      setSubmitError(null)
    }
  }, [result])

  useEffect(() => {
    if (!open) setQuoteOpen(false)
  }, [open])

  // Keep "Added to cart" (and the resulting "Go to cart" button) visible
  // while the quote modal is open; only start the fade-back-to-"Add to
  // cart" countdown once it's closed.
  useEffect(() => {
    if (!justAdded || quoteOpen) return
    const timer = setTimeout(() => setJustAdded(false), 1600)
    return () => clearTimeout(timer)
  }, [justAdded, quoteOpen])

  useEffect(() => {
    if (quoteOpen && result && canBuildBreakdown(result)) {
      onDeliveryChoiceChange?.(deliveryChoice)
    }
  }, [quoteOpen, result, deliveryChoice, onDeliveryChoiceChange])

  if (!mounted) return null

  const showLoading = !result || loading
  const handleSelectVariant = (url: string) => onSelectVariant?.(url)
  const productSnapshot = result && !result.error ? toProductSnapshot(result) : null
  const inWishlist = productSnapshot ? wishlist.isInWishlist(productSnapshot.id) : false
  const hasBreakdown = !!result && !result.error && canBuildBreakdown(result)

  function handleToggleWishlist() {
    if (!productSnapshot) return
    const wishlistProduct: WishlistProduct = { ...productSnapshot, price: result?.price != null ? String(result.price) : null }
    wishlist.toggleItem(wishlistProduct)
  }

  function handleAddToCart() {
    if (!productSnapshot) return
    const cartProduct: CartProduct = {
      ...productSnapshot,
      sourcePrice: result?.price != null ? String(result.price) : null,
      estimatedPrice: estimatedPrice ?? null,
    }
    cart.addItem(cartProduct, qty)
    setJustAdded(true)
  }

  function handleGoToCart() {
    setQuoteOpen(false)
    onClose()
    router.push('/account/cart')
  }

  // CHANNEL 3 ONLY. Calls onSubmitRequest (DashboardContext's
  // confirmRequest) directly — no QuoteModal, no cart. confirmRequest's
  // own unpriced branch creates the `requests` row, seeds the chat
  // thread, and navigates to /account/messages, so this only needs to
  // close the modal on success. On failure it stays right here with the
  // error visible instead of losing the customer's place.
  async function handleStartChat() {
    if (!onSubmitRequest) return
    setSubmitError(null)
    setSubmitting(true)
    const res = await onSubmitRequest()
    setSubmitting(false)
    if (!res.ok) {
      setSubmitError(res.error ?? 'Something went wrong starting the chat. Please try again.')
      return
    }
    onClose()
  }

  const commerceProps = result && !result.error
    ? {
        result,
        onSelectVariant: handleSelectVariant,
        estimatedPrice,
        estimatedPriceNote,
        qty,
        onQtyChange,
        inWishlist,
        onToggleWishlist: handleToggleWishlist,
        onAddToCart: handleAddToCart,
        justAdded,
        onRequestReview: () => setQuoteOpen(true),
        // Channel 3 only — see GenericProductView's file comment.
        // Every named/branded view below ignores these three, same as
        // it already ignores any other prop it doesn't destructure.
        onGoToChat: handleStartChat,
        submitting,
        submitError,
        loading,
        canAct: !!productSnapshot,
      }
    : null

  const platformView = (() => {
    if (!commerceProps) return null

    if (commerceProps.result.ogOnly) return <GenericProductView {...commerceProps} />

    switch (commerceProps.result.site) {
      case 'amazon':
        return <AmazonProductView {...commerceProps} />
      case 'flipkart':
        return <FlipkartProductView {...commerceProps} />
      case 'meesho':
        return <MeeshoProductView {...commerceProps} />
      case 'myntra':
        return <MyntraProductView {...commerceProps} />
      case 'ebay':
        return <EbayProductView {...commerceProps} />
      case 'ajio':
        return <AjioProductView {...commerceProps} />
      case 'jiomart':
        return <JioMartProductView {...commerceProps} />
      case 'snapdeal':
        return <SnapdealProductView {...commerceProps} />
      case 'firstcry':
        return <FirstCryProductView {...commerceProps} />
      case 'tatacliq':
        return <TataCliqProductView {...commerceProps} />
      case 'nykaa':
        return <NykaaProductView {...commerceProps} />
      case 'hopscotch':
        return <HopscotchProductView {...commerceProps} />
      case 'westside':
        return <WestsideProductView {...commerceProps} />
      case 'shopify':
        return <ShopifyProductView {...commerceProps} />
      case 'woocommerce':
        return <WooCommerceProductView {...commerceProps} />
      default:
        return <GenericProductView {...commerceProps} />
    }
  })()

  return (
    <div
      className="fixed inset-0 z-30 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Product details"
    >
      <div
        className={`item-overlay-bounds pointer-events-auto absolute inset-x-0 bg-ink/40 backdrop-blur-[1px] transition-opacity ease-out ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDuration: `${ANIMATION_MS}ms` }}
        onClick={onClose}
      />

      <FloatingCloseButton onClick={onClose} visible={entered} />

      <style>{`
        @keyframes contentFadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes tabFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes priceUpdatePulse { 0% { opacity: 0.4 } 100% { opacity: 1 } }
        @keyframes heartPop { 0% { transform: scale(0.7) } 60% { transform: scale(1.15) } 100% { transform: scale(1) } }

        .item-overlay-bounds {
          top: 0;
          bottom: 0;
        }
      `}</style>

      <div
        className={`item-overlay-bounds pointer-events-auto absolute right-0 flex w-full max-w-full flex-col bg-parchment shadow-lift transition-[transform,opacity] ease-[cubic-bezier(0.16,1,0.3,1)] ${
          entered
            ? 'translate-x-0 translate-y-0 opacity-100'
            : 'translate-y-8 opacity-0 lg:translate-x-8 lg:translate-y-0'
        }`}
        style={{ transitionDuration: `${ANIMATION_MS}ms` }}
      >
        <div className="flex flex-none items-center justify-between gap-3 border-b border-ink/10 px-4 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-7 sm:py-4">
          <div
            key={showLoading ? 'loading' : result?.error ? 'error' : 'listing'}
            className="flex min-w-0 items-center gap-1.5 motion-safe:[animation:tabFadeIn_0.25s_ease-out_both]"
          >
            <Zap size={13} className="flex-none text-teal-deep" strokeWidth={2.25} />
            <span className="truncate text-sm font-semibold text-ink/70">
              {showLoading ? 'Reading listing…' : 'Listing'}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-9 w-9 flex-none place-items-center rounded-full text-ink/50 transition-all duration-200 hover:rotate-90 hover:bg-ink/5 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="flex flex-1 flex-col gap-6 overflow-auto p-4 pb-20 sm:gap-7 sm:p-7 sm:pb-24
            [scrollbar-width:thin] [scrollbar-color:theme(colors.ink/25%)_transparent]
            [&::-webkit-scrollbar]:w-1.5
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb]:bg-ink/20"
        >
          {showLoading ? (
            <>
              <ProductSkeleton />
              <SlowLoadNotice />
            </>
          ) : result!.error ? (
            <UnreadableListingFallback
              url={result?.url}
              title={result?.title}
              image={result?.images?.[0]}
              onRetry={onRetry}
              onContinueViaChat={handleStartChat}
              submitting={submitting}
              submitError={submitError}
            />
          ) : (
            <div
              key={`${result!.site ?? ''}|${result!.title ?? ''}`}
              className="flex flex-col gap-6 sm:gap-7 pt-8 motion-safe:[animation:contentFadeIn_0.3s_ease-out_both]"
            >
              {platformView}
            </div>
          )}
        </div>
      </div>

      <QuoteModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        result={result ?? null}
        estimatedPrice={estimatedPrice}
        estimatedPriceLKR={estimatedPriceLKR}
        qty={qty}
        onQtyChange={onQtyChange}
        deliveryChoice={deliveryChoice}
        onDeliveryChoiceChange={setDeliveryChoice}
        hasBreakdown={hasBreakdown}
        onAddToCart={handleAddToCart}
        justAdded={justAdded}
        onGoToCart={handleGoToCart}
      />
    </div>
  )
}