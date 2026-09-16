'use client'

import { useState, useEffect, useRef } from 'react'
import { X, ShoppingCart, Zap, ArrowLeft, ShoppingBag, Minus, Plus, MessageCircleQuestion, Loader2, RefreshCw, MessageCircle, Truck, Plane, Info } from 'lucide-react'
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
 * Right-side "Product Details" overlay. Now a thin shell: backdrop,
 * slide-in animation, header (status text + close), and the request
 * "review" step. All product-specific rendering — gallery, price,
 * variants, AND the WishDrop commerce layer (estimated price,
 * delivery/QC, qty/wishlist/cart/request buttons, Description/Details/
 * Shipping tabs) — lives inside whichever platform view is picked below,
 * via the shared <StoreCommercePanel> each one renders. This modal owns
 * NONE of that UI directly anymore.
 *
 * Header text: shows a status message ("Reading listing…" / "Listing"
 * on error) only while there's no title to show yet or something went
 * wrong. Once the listing has loaded successfully, the header shows
 * nothing on the left — the product page this modal opens on top of
 * already displays the title/store name above it, so repeating a
 * "Product details" label here was redundant.
 *
 * FULL-VIEWPORT OVERLAY: this modal now always covers the ENTIRE
 * screen (top: 0, bottom: 0), regardless of --account-header-h, the
 * WelcomeBanner, or the mobile bottom nav. Those all live underneath
 * it and are irrelevant while it's open — AccountShell no longer
 * renders WelcomeBanner at all while this modal is open (see that
 * file), so there's nothing left for this modal to "push down" for or
 * leave a gap above. Previously the panel's top/bottom followed
 * --account-header-h and MOBILE_BOTTOM_NAV_HEIGHT so the banner could
 * visually sit above it — that entire mechanism is gone now.
 *
 * Backdrop bounds: the dimmed/blurred backdrop shares the same
 * .item-overlay-bounds top/bottom offsets as the panel (inset-x-0
 * instead of inset-0), so both now simply span the full viewport.
 *
 * Click-through fix: the outer `fixed inset-0` wrapper used to be a
 * fully "live" hit-target for its entire box, even in the region above
 * .item-overlay-bounds (the gap left uncovered on mobile, where the
 * WelcomeBanner lived). Since the panel now always spans the full
 * viewport, that gap no longer exists — but the wrapper stays
 * `pointer-events-none` with only the backdrop/panel opting back in,
 * since that's still correct and harmless.
 *
 * Loading state: instead of a centered spinner, the loading state now
 * renders <ProductSkeleton /> — a pulsing placeholder shaped like the
 * eventual two-column image/details layout plus a tabs section, so the
 * panel doesn't visually "jump" once the real listing content pops in.
 *
 * CART/REQUEST SEPARATION: "Add to Cart" (handleAddToCart) and "Confirm
 * & send request" (handleConfirmRequest) are two independent commitments
 * — a cart line lives in CartContext and is checked out from
 * /account/cart; a request lives in DashboardContext.requests and is
 * submitted via onSubmitRequest (DashboardContext's confirmRequest,
 * called directly — see that prop's own doc comment for why there's no
 * separate confirm/preview page anymore), which read only from `draft`
 * — never from cart state. They used to both write to CartContext, which
 * meant confirming a request also silently created a cart line for the
 * same product — and if that cart was later checked out, it would mint a
 * SECOND, duplicate request. Only handleAddToCart touches cart.addItem
 * now.
 *
 * DELIVERY CHOICE + REAL PRICING IN THE REVIEW STEP: previously this
 * step showed at most one soft number (estimatedPrice string, or
 * estimatedPriceLKR with a "final price confirmed by our team" caveat)
 * with no way to compare Economy vs Express before sending the
 * request — unlike the cart page, which runs every line through
 * getDualDeliveryPricing and lets the customer toggle delivery mode
 * with a live breakdown. Now, whenever the scraped listing has a real,
 * numeric price (i.e. NOT an ogOnly/unpriced/manual-check listing),
 * the review step does the same thing: a compact DeliveryModeToggle,
 * a full Price/Service charge/Delivery/Total breakdown for the
 * selected mode, and a two-up comparison of both. `onDeliveryChoiceChange`
 * is fired whenever the customer's choice changes so the parent can
 * stash it on the draft before calling onSubmitRequest — this modal
 * still never talks to DashboardContext directly, same as before.
 * Unpriced/manual-check listings keep the old, gentler messaging
 * ("Price to be confirmed by our team") since there's no real number
 * to build a breakdown out of yet.
 */

type ItemOverlayProps = {
  open: boolean
  result?: ScrapeResult | null
  estimatedPrice?: string
  estimatedPriceNote?: string
  /**
   * Best-effort LKR estimate for the current draft (see
   * Draft.estimatedPriceLKR's doc comment) — shown in the review step
   * as "About LKR X,XXX, final price confirmed by our team" so the
   * customer sees SOME number before sending a request, even for a
   * generic/ogOnly item that can't be auto-priced for checkout. Null
   * when currency genuinely couldn't be determined — shown as "price
   * to be confirmed" rather than guessing. Only used as a fallback now,
   * for listings where a real dual-delivery breakdown can't be built
   * (see DeliveryChoice section below).
   */
  estimatedPriceLKR?: number | null
  onSelectVariant?: (url: string) => void
  qty: number
  onQtyChange: (qty: number) => void
  onClose: () => void
  /**
   * Directly performs the request/order write (DashboardContext's
   * confirmRequest) and returns whether it succeeded — no separate
   * confirm/preview page in between anymore. Previously this was
   * onRequestItem: () => void, backed by saveItemInfo, which persisted
   * the draft to localStorage and navigated to /account/requests/confirm
   * — a page whose two consent checkboxes duplicated the ones already
   * rendered right here in the review step below (confirmsRestrictions/
   * confirmsPreowned), and whose price display used draft.unitPrice
   * directly, which is 0 for any ogOnly/unpriced item by design (see
   * applyScrapeResultToDraft) — so that page showed a bare "$0.00" for
   * exactly the cases that most needed a real number. confirmRequest
   * itself already ends by routing to /account/messages for the
   * unpriced case (or Orders Hub for a real Channel 2 order) — calling
   * it here directly means clicking "Confirm & send request" does
   * exactly that, immediately, with nothing in between. The old
   * /account/requests/confirm and /preview pages are unreachable from
   * this flow now — left in place rather than deleted, in case anything
   * else still links to them directly.
   */
  onSubmitRequest: () => Promise<{ ok: boolean; error?: string }>
  /**
   * Fired whenever the customer's Economy/Express choice in the review
   * step changes (including once, on first mount of the review step,
   * with the default 'economy'). Optional — this modal still works
   * without it. Wire it up on the parent side to stash the choice on
   * DashboardContext's draft before calling onSubmitRequest, if the
   * request flow should honor it; without this prop the modal is purely
   * informational about delivery choice, same as before for pricing.
   */
  onDeliveryChoiceChange?: (choice: DeliveryChoice) => void
  loading?: boolean
  /**
   * Re-runs the lookup for the same URL from scratch (useProductLookup's
   * retry-then-OG-fallback chain runs again). Only rendered when both of
   * those already ran once and still came up empty — see
   * UnreadableListingFallback below. Optional so this modal doesn't
   * break if a future caller doesn't wire it up; the "Continue via
   * chat" path still works without it.
   */
  onRetry?: () => void
}

type Step = 'listing' | 'review'
type DeliveryChoice = 'economy' | 'express'

function ConfirmCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3.5 text-[13px] leading-relaxed text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md border-2 border-teal/70 bg-transparent transition-colors duration-150 peer-checked:border-teal peer-checked:bg-teal"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3 scale-0 text-parchment transition-transform duration-150 peer-checked:scale-100" fill="none">
          <path d="M3 8.5L6.2 11.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>{children}</span>
    </label>
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

/**
 * Turns a scraped listing into the shape getDualDeliveryPricing expects
 * — same idea as the cart page's toPriceableItem(CartProduct), just
 * sourced from a ScrapeResult instead of a cart line. Only meaningful
 * when result.price is a real number; callers must check
 * canBuildBreakdown(result) before trusting the output.
 */
function toPriceableItem(result: ScrapeResult): ProductPriceableItem {
  return {
    price: result.price != null ? Number(result.price) : 0,
    currency: result.currencyCode ?? 'USD',
    weightKg: (result as ScrapeResult & { weightKg?: number | null }).weightKg ?? undefined,
  }
}

/**
 * A real Economy/Express breakdown only makes sense when we actually
 * have a numeric source price to build it from. ogOnly / manual-check
 * listings (see GenericProductView's doc comment) have no trustworthy
 * price yet — for those we fall back to the older, softer
 * estimatedPrice / estimatedPriceLKR messaging instead of fabricating a
 * confident-looking breakdown out of a 0.
 */
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
  return (
    <div className="flex gap-2">
      {options.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
              active ? 'border-teal/50 bg-teal/10' : 'border-ink/12 bg-transparent hover:bg-ink/[0.03]'
            }`}
          >
            <span className={active ? 'text-teal-deep' : 'text-ink/40'}>{opt.icon}</span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${active ? 'text-teal-deep' : 'text-ink'}`}>
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
          <span className="text-xs tabular-nums text-ink/70">{formatLKR(row.value)}</span>
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
    <div className={`rounded-xl ${active ? 'bg-teal/10' : 'bg-ink/[0.03]'} px-3 py-2.5`}>
      <p className={`mb-1.5 text-xs font-semibold ${active ? 'text-teal-deep' : 'text-ink/50'}`}>{heading}</p>
      <BreakdownRows option={option} qty={qty} />
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-ink/[0.08] pt-2">
        <span className="text-xs font-semibold text-ink">Total</span>
        <span className="text-sm font-bold tabular-nums text-ink">{formatLKR(option.actualTotalLKR * qty)}</span>
      </div>
    </div>
  )
}

/**
 * Review-step pricing block: DeliveryModeToggle + a full breakdown for
 * the selected mode + a compact side-by-side comparison of both — the
 * same information the cart page's PriceBreakdownOverlay shows per
 * line, condensed to fit the narrow slide-in panel. Only rendered when
 * canBuildBreakdown(result) is true.
 */
function ReviewPricingBlock({
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
    <div className="flex flex-col gap-3.5 rounded-xl border border-ink/10 bg-card p-4">
      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink/50">Delivery method</p>
        <DeliveryModeToggle value={deliveryChoice} onChange={onDeliveryChoiceChange} />
      </div>

      <div className="rounded-xl bg-teal/10 px-3 py-2.5">
        <p className="mb-1.5 text-xs font-semibold text-teal-deep">
          Breakdown · {deliveryChoice === 'economy' ? 'Economy' : 'Express'} (selected)
        </p>
        <BreakdownRows option={selected} qty={qty} />
        <p className="mt-1.5 text-[10px] leading-snug text-ink/35">
          Price includes currency conversion, freight &amp; handling.
        </p>
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-ink/[0.08] pt-2">
          <span className="text-xs font-semibold text-ink">Total</span>
          <span className="text-sm font-bold tabular-nums text-ink">{formatLKR(selected.actualTotalLKR * qty)}</span>
        </div>
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-ink/50">
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

// Fallback for an unrecognized result.site — now also renders its own
// StoreCommercePanel, same as every named platform view.
function GenericProductView(props: Parameters<typeof AmazonProductView>[0]) {
  const { result, qty, onQtyChange, onRequestReview, loading, canAct } = props
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
        <h3 className="mt-2 font-display text-xl leading-snug text-ink">{result.title ?? 'Untitled item'}</h3>
        <p className="mt-2 font-display text-xl text-ink">
          {result.currencyCode ?? ''} {result.price ?? '—'}
        </p>

        {/* We couldn't fully read this listing — no dedicated extractor
            for this site, so we're going off the page's own basic tags
            (see ScrapeResult.ogOnly's doc comment): no confirmed
            size/color options, and pricing that hasn't been double-
            checked. Framed as "we'll confirm it with you", not
            "something's broken" — it isn't, this is just handed to a
            real person instead of being auto-confirmed, same as any
            link our system can't fully read on its own. No "Add to
            Cart" here on purpose — only "Request this item", which
            always gets a human's eyes on the price and variant before
            anything is charged (see confirmRequest/
            applyScrapeResultToDraft in DashboardContext.tsx). */}
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-teal/[0.06] p-3 text-sm text-ink/70 ring-1 ring-inset ring-teal/15">
          <MessageCircleQuestion size={16} className="mt-0.5 flex-none text-teal-deep" />
          <span>
            This one needs a quick manual check — sizes, colors, and the final price. Send us the request and our
            team will confirm everything with you before anything is charged.
          </span>
        </div>

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
            onClick={onRequestReview}
            disabled={!canAct}
            loading={loading}
            unavailable={result.unavailable}
            icon={<ShoppingCart size={16} />}
            className="flex-1 whitespace-nowrap rounded-xl bg-teal-deep px-5 py-3 text-sm font-bold text-parchment hover:bg-teal"
          >
            Request this item
          </RequestActionButton>
        </div>
        <p className="mt-2 text-xs text-ink/40">You won&rsquo;t be charged now — this only sends a request.</p>
      </div>

    </div>
  )
}

// Some sites (bot-protection on Gymshark's included) can't be read with
// a plain fetch and fall through to slower tiers — a headless render,
// then a paid residential-proxy fallback — that can legitimately take
// 20-40+ seconds, occasionally longer (the API route's own maxDuration
// is set to 5 minutes specifically to give that room). A bare pulsing
// skeleton with zero explanation for that long reads as frozen/broken
// to a real person, who's likely to just give up and leave. This shows
// a short, honest reassurance line once loading has clearly gone past
// a normal fetch's timescale — not before, so it doesn't clutter the
// common case where a site returns in a second or two.
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

// Pulsing placeholder shown while the listing is being scraped/read.
// Shaped like the eventual two-column layout (image + details) plus a
// tabs section, so there's no layout jump once real content lands.
function ProductSkeleton() {
  return (
    <div
      className="flex flex-col gap-6 sm:gap-7 motion-safe:[animation:contentFadeIn_0.3s_ease-out_both]"
      aria-hidden="true"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {/* image */}
        <div className="aspect-square animate-pulse rounded-xl border border-ink/10 bg-ink/5" />

        {/* details */}
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

      {/* tabs */}
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

// Shown only once useProductLookup has already retried the scrape once
// (5s later) AND tried the OG-only fallback, and both still came up
// empty. Deliberately says nothing about *why* — no "captcha",
// "blocked", "timed out", or any other internal scraper detail — a
// customer can't act on that, and naming it just invites confusion.
// Instead of a dead end, this hands the customer straight to a real
// person: "Continue via chat" jumps to the exact same review step a
// normal (priced or unpriced) listing would, just without a preview
// card, so the request still goes out with the link attached and our
// team fills in the rest.
function UnreadableListingFallback({ onRetry, onContinueViaChat }: { onRetry?: () => void; onContinueViaChat: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-ink/10 bg-card p-6 text-center motion-safe:[animation:contentFadeIn_0.25s_ease-out_both]">
      <div className="grid h-12 w-12 flex-none place-items-center rounded-full bg-teal/10">
        <MessageCircleQuestion size={22} className="text-teal-deep" />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">We couldn&apos;t load this listing automatically</p>
        <p className="mt-1.5 text-sm text-ink/55">
          No problem — send us the link and our team will check the details, price, and options with you directly.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2.5 sm:flex-row">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-ink/15 px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
          >
            <RefreshCw size={15} />
            Try again
          </button>
        )}
        <button
          type="button"
          onClick={onContinueViaChat}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-deep hover:shadow-md active:scale-[0.98]"
        >
          <MessageCircle size={15} />
          Continue via chat
        </button>
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
  const [step, setStep] = useState<Step>('listing')
  const [confirmsRestrictions, setConfirmsRestrictions] = useState(false)
  const [confirmsPreowned, setConfirmsPreowned] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>('economy')
  const cart = useCart()
  const wishlist = useWishlist()

  const lastResultKey = useRef<string | null>(null)
  useEffect(() => {
    const key = result ? `${result.site ?? ''}|${result.title ?? ''}` : null
    if (key && key !== lastResultKey.current) {
      lastResultKey.current = key
      setStep('listing')
      setConfirmsRestrictions(false)
      setConfirmsPreowned(false)
      setDeliveryChoice('economy')
    }
  }, [result])

  useEffect(() => {
    if (!open) setStep('listing')
  }, [open])

  useEffect(() => {
    if (!justAdded) return
    const timer = setTimeout(() => setJustAdded(false), 1600)
    return () => clearTimeout(timer)
  }, [justAdded])

  // Let the parent know the current delivery choice whenever it changes
  // (and once, on entering the review step with a priced listing), so it
  // can be stashed on the draft before onSubmitRequest fires. See this
  // prop's own doc comment above.
  useEffect(() => {
    if (step === 'review' && result && canBuildBreakdown(result)) {
      onDeliveryChoiceChange?.(deliveryChoice)
    }
  }, [step, result, deliveryChoice, onDeliveryChoiceChange])

  if (!open) return null

  const showLoading = !result || loading
  const handleSelectVariant = (url: string) => onSelectVariant?.(url)
  const productSnapshot = result && !result.error ? toProductSnapshot(result) : null
  const inWishlist = productSnapshot ? wishlist.isInWishlist(productSnapshot.id) : false
  const canSubmitReview = confirmsRestrictions && confirmsPreowned
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

  async function handleConfirmRequest() {
    // Submitting a request only needs onSubmitRequest() — everything it
    // needs (name/url/qty/unitPrice/image) already lives in
    // DashboardContext's `draft`, populated earlier by
    // beginRequestForUrl/selectVariant. This no longer touches
    // cart.addItem: doing so here meant confirming a request also
    // created a cart line for the same product, which could later be
    // checked out into a second, duplicate request. Cart and requests
    // are separate commitments now — see the file-level doc comment.
    //
    // Called directly, awaited, right here — no separate confirm/
    // preview page anymore (see onSubmitRequest's own doc comment for
    // why that page was redundant). On success, onSubmitRequest's own
    // implementation (confirmRequest in DashboardContext.tsx) already
    // navigates away (to /account/messages for the usual unpriced case,
    // or Orders Hub for a real Channel 2 order) — this only needs to
    // close the modal itself, not decide where to go next. On failure,
    // stay right here on the review step with the error visible instead
    // of silently losing the customer's place.
    setSubmitError(null)
    setSubmitting(true)
    const result = await onSubmitRequest()
    setSubmitting(false)
    if (!result.ok) {
      setSubmitError(result.error ?? 'Something went wrong sending your request. Please try again.')
      return
    }
    onClose()
    setStep('listing')
    setConfirmsRestrictions(false)
    setConfirmsPreowned(false)
    setDeliveryChoice('economy')
  }

  // Every prop a platform view (and StoreCommercePanel) needs — same
  // shape for all ten platforms plus the generic fallback.
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
        onRequestReview: () => setStep('review'),
        loading,
        canAct: !!productSnapshot,
      }
    : null

  const platformView = (() => {
    if (!commerceProps) return null

    // An ogOnly result came from the generic Open Graph/JSON-LD fallback
    // (see og-only.ts's doc comment), not a real per-site extractor —
    // it structurally can't find MRP, variants, or a trustworthy
    // availability signal, so a branded platform view (with its own
    // "in stock"/"out of stock" pill and confidently-labeled buttons)
    // would be showing more certainty than the data actually supports,
    // no matter which `site` got detected. Route straight to
    // GenericProductView instead — no availability claim, always lets
    // the customer send the request and have a real person confirm
    // stock/price, i.e. straight to chat rather than a guessed status.
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
        className="item-overlay-bounds pointer-events-auto absolute inset-x-0 bg-ink/40 backdrop-blur-[1px] motion-safe:[animation:overlayFadeIn_0.2s_ease-out_both]"
        onClick={onClose}
      />

      <style>{`
        @keyframes overlayFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes panelSlideIn { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes panelSlideInUp { from { transform: translateY(32px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes contentFadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes tabFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes priceUpdatePulse { 0% { opacity: 0.4 } 100% { opacity: 1 } }
        @keyframes heartPop { 0% { transform: scale(0.7) } 60% { transform: scale(1.15) } 100% { transform: scale(1) } }

        /* Full-viewport overlay: always spans the entire screen, top to
           bottom. No longer follows --account-header-h or any bottom-
           nav reservation — AccountShell doesn't render WelcomeBanner
           (or anything else) above this modal anymore, so there's
           nothing left to leave room for. */
        .item-overlay-bounds {
          top: 0;
          bottom: 0;
        }

        @media (prefers-reduced-motion: no-preference) {
          .item-overlay-panel { animation: panelSlideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) both; }
        }
        @media (prefers-reduced-motion: no-preference) and (min-width: 1024px) {
          .item-overlay-panel { animation: panelSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) both; }
        }
      `}</style>

      <div className="item-overlay-bounds item-overlay-panel pointer-events-auto absolute right-0 flex w-full max-w-full flex-col bg-parchment shadow-lift">
        <div className="flex flex-none items-center justify-between gap-3 border-b border-ink/10 px-4 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-7 sm:py-4">
          {step === 'review' ? (
            <button
              type="button"
              onClick={() => setStep('listing')}
              className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink/70 transition-colors hover:text-ink"
            >
              <ArrowLeft size={15} className="flex-none" />
              Back to listing
            </button>
          ) : (
            <div
              key={showLoading ? 'loading' : result?.error ? 'error' : 'listing'}
              className="flex min-w-0 items-center gap-1.5 motion-safe:[animation:tabFadeIn_0.25s_ease-out_both]"
            >
              <Zap size={13} className="flex-none text-teal-deep" strokeWidth={2.25} />
              <span className="truncate text-sm font-semibold text-ink/70">
                {showLoading ? 'Reading listing…' : 'Listing'}
              </span>
            </div>
          )}
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
          className="flex flex-1 flex-col gap-6 overflow-auto p-4 pb-8 sm:gap-7 sm:p-7 sm:pb-10
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
          ) : step === 'review' ? (
            <div className="flex flex-col gap-6 sm:gap-7 motion-safe:[animation:contentFadeIn_0.3s_ease-out_both]">
              <div>
                <h2 className="font-display text-2xl text-ink">Review your request</h2>
                <p className="mt-1 text-sm text-ink/55">
                  Check the details below, then confirm to send this as a request — you&apos;re not paying yet.
                </p>
              </div>

              <div className="flex gap-4 rounded-xl border border-ink/10 bg-card p-4">
                <div className="grid h-20 w-20 flex-none place-items-center overflow-hidden rounded-lg border border-ink/10 bg-white">
                  {result!.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result!.images[0]} alt="" className="h-full w-full object-contain p-1.5" />
                  ) : (
                    <ShoppingCart size={20} className="text-ink/20" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{result!.title ?? 'Untitled item'}</p>
                  <p className="mt-1 text-xs text-ink/45">Quantity: {qty}</p>
                  {!hasBreakdown && (
                    estimatedPrice ? (
                      <div className="mt-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                          Estimated total
                        </span>
                        <p className="font-display text-lg text-ink">{estimatedPrice}</p>
                      </div>
                    ) : estimatedPriceLKR != null ? (
                      <div className="mt-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                          About
                        </span>
                        <p className="font-display text-lg text-ink">LKR {estimatedPriceLKR.toLocaleString('en-LK')}</p>
                        <p className="text-xs text-ink/40">Final price confirmed by our team before anything is charged.</p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-ink/40">Price to be confirmed by our team.</p>
                    )
                  )}
                </div>
              </div>

              {/* Real Economy/Express breakdown, same numbers the cart
                  page would show — only when the listing has a
                  trustworthy source price to build one from. */}
              {hasBreakdown && (
                <ReviewPricingBlock
                  result={result!}
                  qty={qty}
                  deliveryChoice={deliveryChoice}
                  onDeliveryChoiceChange={setDeliveryChoice}
                />
              )}

              <div className="flex flex-col gap-3.5 rounded-xl border border-ink/10 bg-card p-4">
                <ConfirmCheckbox checked={confirmsRestrictions} onChange={setConfirmsRestrictions}>
                  I confirm this item doesn&apos;t violate WishDrop&apos;s parcel restrictions or contain prohibited
                  items, and I accept the Purchase Protection plan&apos;s refund and return criteria.
                </ConfirmCheckbox>
                <ConfirmCheckbox checked={confirmsPreowned} onChange={setConfirmsPreowned}>
                  I understand a pre-owned item&apos;s condition can&apos;t be verified against the seller&apos;s
                  description, so pre-owned, fragile, and untracked-mail items aren&apos;t eligible for refunds or
                  returns.
                </ConfirmCheckbox>
              </div>

              {submitError && (
                <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
                  {submitError}
                </p>
              )}

              <div
                className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2.5 border-t border-ink/10 bg-parchment/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm
                  sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
              >
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStep('listing')}
                    disabled={submitting}
                    className="flex-none rounded-xl border border-ink/15 px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRequest}
                    disabled={!canSubmitReview || submitting}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-deep hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/25"
                  >
                    {submitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ShoppingCart size={16} />
                    )}
                    {submitting ? 'Sending…' : 'Confirm & send request'}
                  </button>
                </div>
                <p className="text-xs text-ink/40">You will not be charged now. This is just a request.</p>
              </div>
            </div>
          ) : result!.error ? (
            <UnreadableListingFallback onRetry={onRetry} onContinueViaChat={() => setStep('review')} />
          ) : (
            <div
              key={`${result!.site ?? ''}|${result!.title ?? ''}`}
              className="flex flex-col gap-6 sm:gap-7 motion-safe:[animation:contentFadeIn_0.3s_ease-out_both]"
            >
              {platformView}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}