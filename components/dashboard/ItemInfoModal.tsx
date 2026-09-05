'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X,
  Truck,
  ShieldCheck,
  Minus,
  Plus,
  ShoppingCart,
  ShoppingBag,
  Info,
  Loader2,
  Zap,
  Heart,
  ArrowLeft,
  Check,
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
import { useCart, type CartProduct } from '@/contexts/Cartcontext'
import { useWishlist, type WishlistProduct } from '@/contexts/Wishlistcontext'
import { HEADER_BAR_HEIGHT } from '@/components/shared/Header'
import { MOBILE_BOTTOM_NAV_HEIGHT } from '@/components/dashboard/MobileBottomNav'

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
 * row, quantity stepper, wishlist/cart/request actions, the
 * Description/Details/Shipping tabs, AND the request review/confirm
 * step — lives in THIS component, wrapped around whichever platform
 * view is picked, since none of that exists in the QA tool.
 *
 * Review step: clicking "Request this item" no longer navigates to a
 * separate preview/confirm page. It swaps the panel's body to an inline
 * `review` step (item summary + the two policy confirmations), and only
 * calls `onRequestItem` once both are checked. "Back" returns to the
 * listing without closing the overlay. This keeps the whole flow inside
 * one panel instead of a multi-page wizard.
 *
 * Cart + wishlist: this component owns writing to CartContext /
 * WishlistContext directly (rather than leaving it entirely to the
 * parent) so that "add to cart" and "save for later" behave the same
 * wherever this overlay is mounted. `onRequestItem` is still called
 * afterwards so the parent can do whatever else it needs (toast, close,
 * analytics, etc) — it's additive, not replaced.
 *
 * Layering: this overlay renders BELOW the fixed site Header (z-50) and
 * BELOW MobileBottomNav (z-40) — see the z-30 on the root below — so
 * both stay visible and usable while this panel is open, rather than
 * this panel covering them. The panel itself is then inset from the top
 * and (on mobile only, since MobileBottomNav is lg:hidden) from the
 * bottom, via the `.item-overlay-bounds` class below, so nothing inside
 * the panel — the close button row, the sticky add-to-cart bar, the
 * sticky review-step footer — ends up rendered underneath either of
 * them.
 *
 * Top offset: uses the `--account-header-h` CSS custom property that
 * AccountLayout sets on <main> from a LIVE measurement of Header's
 * actual rendered height (see useElementHeight in that file), not the
 * static HEADER_BAR_HEIGHT constant. Header's real height can drift from
 * that constant (icon-only button swaps, the dynamic right-side notch,
 * font-load shifts, safe-area insets, etc.), and previously did — this
 * component was still trusting the frozen constant, which left a gap
 * between the header and the top of this panel once the two diverged.
 * Since this component always renders as a descendant of that <main>,
 * it can simply inherit the variable rather than needing it threaded
 * through as a prop. HEADER_BAR_HEIGHT is kept as the fallback value for
 * the (currently theoretical) case this component renders somewhere
 * that variable isn't set.
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
type Step = 'listing' | 'review'

const SITE_LABELS: Record<string, string> = {
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  meesho: 'Meesho',
  myntra: 'Myntra',
  ebay: 'eBay',
  ajio: 'Ajio',
  jiomart: 'JioMart',
  snapdeal: 'Snapdeal',
  shopify: 'Shopify store',
  woocommerce: 'Online store',
}

function siteLabel(site?: string | null) {
  if (!site) return 'Online store'
  return SITE_LABELS[site] ?? site.charAt(0).toUpperCase() + site.slice(1)
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold text-ink/70">{label}</dt>
      <dd className="text-right text-ink/55">{value}</dd>
    </div>
  )
}

/**
 * Small, cursor-styled checkbox row used in the review step. Same visual
 * treatment as the equivalent control on the full-page confirm step, so
 * the two don't feel like different products.
 */
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
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md border-2 border-teal/70 bg-transparent transition-colors duration-150 peer-checked:border-teal peer-checked:bg-teal"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3 scale-0 text-parchment transition-transform duration-150 peer-checked:scale-100" fill="none">
          <path
            d="M3 8.5L6.2 11.5L13 4.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  )
}

/**
 * Builds the small serializable snapshot Cart/Wishlist contexts store,
 * out of whatever the scraper gave us for this listing. `result.url` is
 * the identity key — it's the exact variant the shopper was looking at,
 * so re-adding the same variant later updates qty/dedupes instead of
 * creating a second row, while a different variant becomes its own entry.
 *
 * NOTE: if `ScrapeResult` doesn't carry a `url` field in this codebase,
 * swap the `id`/`url` line below for whatever field holds the source
 * listing URL (e.g. `result.link`, `result.sourceUrl`).
 */
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
  }
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
  const [step, setStep] = useState<Step>('listing')
  const [confirmsRestrictions, setConfirmsRestrictions] = useState(false)
  const [confirmsPreowned, setConfirmsPreowned] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  const cart = useCart()
  const wishlist = useWishlist()

  // Reset to the Description tab + listing step whenever a genuinely new
  // listing loads (not on a variant re-scrape of the same listing), so a
  // shopper who was mid-review or reading "Shipping & Returns" on the
  // last item doesn't land somewhere stale for the next one.
  const lastResultKey = useRef<string | null>(null)
  useEffect(() => {
    const key = result ? `${result.site ?? ''}|${result.title ?? ''}` : null
    if (key && key !== lastResultKey.current) {
      lastResultKey.current = key
      setActiveTab('Description')
      setStep('listing')
      setConfirmsRestrictions(false)
      setConfirmsPreowned(false)
    }
  }, [result])

  // Closing the panel always drops back to the listing step underneath,
  // so reopening it (or opening the next item) never resumes mid-review.
  useEffect(() => {
    if (!open) setStep('listing')
  }, [open])

  // "Added" confirmation on the cart button is a brief pulse, not a
  // persistent state — clear it on a timer.
  useEffect(() => {
    if (!justAdded) return
    const timer = setTimeout(() => setJustAdded(false), 1600)
    return () => clearTimeout(timer)
  }, [justAdded])

  // Only `open` controls whether the panel mounts. `result` being absent
  // (scrape still in flight) shows a skeleton instead — see below.
  if (!open) return null

  // A fresh link or a variant swap should always show the skeleton
  // rather than the previous listing dimmed underneath it — `loading`
  // means "new data is on the way", so treat it the same as "no data
  // yet" for the purposes of what gets rendered.
  const showSkeleton = !result || loading

  const handleSelectVariant = (url: string) => onSelectVariant?.(url)

  const productSnapshot = result && !result.error ? toProductSnapshot(result) : null
  const inWishlist = productSnapshot ? wishlist.isInWishlist(productSnapshot.id) : false
  const canSubmitReview = confirmsRestrictions && confirmsPreowned

  function handleToggleWishlist() {
    if (!productSnapshot) return
    const wishlistProduct: WishlistProduct = {
      ...productSnapshot,
      price: result?.price != null ? String(result.price) : null,
    }
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

  function handleConfirmRequest() {
    if (productSnapshot) {
      const cartProduct: CartProduct = {
        ...productSnapshot,
        sourcePrice: result?.price != null ? String(result.price) : null,
        estimatedPrice: estimatedPrice ?? null,
      }
      cart.addItem(cartProduct, qty)
    }
    // Parent still gets to react (toast/close/analytics/etc) — adding to
    // the cart doesn't replace whatever it was already doing here.
    onRequestItem()
    setStep('listing')
    setConfirmsRestrictions(false)
    setConfirmsPreowned(false)
  }

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
    <div className="fixed inset-0 z-30" role="dialog" aria-modal="true" aria-label="Product details">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[1px] motion-safe:[animation:overlayFadeIn_0.2s_ease-out_both]"
        onClick={onClose}
      />

      <style>{`
        @keyframes overlayFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes panelSlideIn { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes contentFadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes tabFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes priceUpdatePulse { 0% { opacity: 0.4 } 100% { opacity: 1 } }
        @keyframes shimmer { 0% { background-position: -200px 0 } 100% { background-position: calc(200px + 100%) 0 } }
        @keyframes heartPop { 0% { transform: scale(0.7) } 60% { transform: scale(1.15) } 100% { transform: scale(1) } }
        .skeleton-shimmer {
          background-image: linear-gradient(90deg, theme(colors.ink/6%) 25%, theme(colors.ink/12%) 37%, theme(colors.ink/6%) 63%);
          background-size: 400px 100%;
          motion-safe:animation: shimmer 1.4s ease-in-out infinite;
        }

        /* Keeps this panel's top/bottom edges clear of the fixed site
           Header and MobileBottomNav, both of which render ABOVE this
           overlay (z-30) via their own higher z-indexes (z-50 / z-40) so
           they stay visible/interactive while this panel is open. This
           insets the panel itself so its own content — close button row,
           sticky add-to-cart bar, sticky review footer — never renders
           underneath either of them.

           top: reads the SAME live-measured --account-header-h variable
           AccountLayout sets on <main> (see useElementHeight there),
           instead of the frozen HEADER_BAR_HEIGHT constant. Header's
           real rendered height can drift from that constant — icon-only
           button swaps, the dynamic right-side notch width, font-load
           shifts — and when it does, trusting the stale constant here
           left a visible gap between the header and this panel's top
           edge. Since this component always renders as a descendant of
           that <main>, the variable is simply inherited; the constant is
           kept only as the fallback for the variable being unset.

           MobileBottomNav is lg:hidden, so the bottom inset is dropped
           at the lg breakpoint to match. */
        .item-overlay-bounds {
          top: var(--account-header-h, ${HEADER_BAR_HEIGHT}px);
          bottom: calc(${MOBILE_BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom));
        }
        @media (min-width: 1024px) {
          .item-overlay-bounds { bottom: 0; }
        }
      `}</style>

      <div className="item-overlay-bounds absolute right-0 flex w-full max-w-full flex-col bg-parchment shadow-lift motion-safe:[animation:panelSlideIn_0.28s_cubic-bezier(0.16,1,0.3,1)_both] lg:w-1/2">
        {/* Header — a small source tag (what site this was pulled from) on
            the listing step, or a "back to listing" cue on the review
            step, plus a close button. Wishlist now lives in the action
            row below so it isn't duplicated in two places. */}
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
              key={result?.site ?? (showSkeleton ? 'loading' : 'error')}
              className="flex min-w-0 items-center gap-1.5 motion-safe:[animation:tabFadeIn_0.25s_ease-out_both]"
            >
              <Zap size={13} className="flex-none text-teal-deep" strokeWidth={2.25} />
              <span className="truncate text-sm font-semibold text-ink/70">
                {showSkeleton ? 'Reading listing…' : result?.error ? 'Listing' : siteLabel(result?.site)}
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

        {/* Body */}
        <div
          className="flex flex-1 flex-col gap-6 overflow-auto p-4 pb-8 sm:gap-7 sm:p-7 sm:pb-10
            [scrollbar-width:thin] [scrollbar-color:theme(colors.ink/25%)_transparent]
            [&::-webkit-scrollbar]:w-1.5
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb]:bg-ink/20"
        >
          {showSkeleton ? (
            <ItemOverlaySkeleton />
          ) : result!.error ? (
            <div className="rounded-xl border border-red-300/40 bg-red-50 p-5 text-sm text-ink/70 motion-safe:[animation:contentFadeIn_0.25s_ease-out_both]">
              Couldn&apos;t read this listing: {result!.error}
            </div>
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
                  {estimatedPrice && (
                    <div className="mt-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                        Estimated total
                      </span>
                      <p className="font-display text-lg text-ink">{estimatedPrice}</p>
                    </div>
                  )}
                </div>
              </div>

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

              <div
                className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2.5 border-t border-ink/10 bg-parchment/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm
                  sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
              >
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStep('listing')}
                    className="flex-none rounded-xl border border-ink/15 px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRequest}
                    disabled={!canSubmitReview}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-deep hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/25"
                  >
                    <ShoppingCart size={16} />
                    Confirm & send request
                  </button>
                </div>
                <p className="text-xs text-ink/40">You will not be charged now. This is just a request.</p>
              </div>
            </div>
          ) : (
            <div
              key={`${result!.site ?? ''}|${result!.title ?? ''}`}
              className="flex flex-col gap-6 sm:gap-7 motion-safe:[animation:contentFadeIn_0.3s_ease-out_both]"
            >
              {platformView}

              {/* Divider marks the handoff from the scraped listing to WishDrop's
                  own commerce layer below — without it the two blocks read as
                  unrelated sections rather than one continuous product page. */}
              <div className="flex flex-col gap-5 border-t border-ink/10 pt-6 sm:gap-6">
                {estimatedPrice && (
                  <div className="rounded-xl bg-teal-deep/[0.06] px-4 py-4 sm:px-5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-ink/55">
                      Estimated WishDrop Price
                      <Info size={12} className="text-ink/35" />
                    </span>
                    {/* Keyed on the price string so switching variants — a new
                        estimate landing under the same box — gets a quick
                        pulse instead of silently changing underneath the shopper. */}
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

                {/* Sticky on mobile only: with a full-width panel and a long
                    scroll (variants, tabs, etc.) the action row can end up
                    well below the fold — pinning it means it's always
                    reachable without hunting for it. Desktop has the room
                    to stay inline.

                    Three compact actions live together here: qty stepper,
                    wishlist toggle, add-to-cart, and the primary request
                    action — wrapping on narrow screens rather than
                    squeezing. */}
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
                      onClick={handleToggleWishlist}
                      disabled={!productSnapshot}
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
                      onClick={handleAddToCart}
                      disabled={loading || result!.unavailable || !productSnapshot}
                      className="flex min-w-[130px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink/15 px-4 py-3 text-sm font-semibold text-ink transition-all duration-200 hover:border-teal/30 hover:bg-teal/5 hover:text-teal-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {justAdded ? <Check size={16} className="text-teal-deep" /> : <ShoppingBag size={16} />}
                      {justAdded ? 'Added' : 'Add to Cart'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep('review')}
                      disabled={loading || result!.unavailable || !productSnapshot}
                      className="flex min-w-[150px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-deep hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/25"
                    >
                      <ShoppingCart size={16} />
                      {result!.unavailable ? 'Not Available' : 'Get Quote'}
                    </button>
                  </div>
                </div>
                <p className="-mt-3 text-xs text-ink/40">
                  You will not be charged now. This is just a request.
                </p>

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
                  {/* Keyed on the tab id so switching tabs crossfades the new
                      content in rather than snapping instantly. min-h keeps
                      the panel from collapsing to a sliver when a tab has no
                      content, so the empty-state message doesn't read as the
                      tabs being crammed right up against the bottom edge. */}
                  <div
                    key={activeTab}
                    className="min-h-[96px] pb-2 pt-4 text-sm leading-relaxed text-ink/65 motion-safe:[animation:tabFadeIn_0.18s_ease-out_both]"
                  >
                    {activeTab === 'Description' &&
                      (result!.description ? (
                        <p>{result!.description}</p>
                      ) : (
                        <p className="text-ink/45">
                          We don&apos;t have a description for this listing. Here&apos;s the title instead:{' '}
                          {result!.title ?? 'no title available.'}
                        </p>
                      ))}
                    {activeTab === 'Details' && (
                      <dl className="flex flex-col gap-1.5 text-xs">
                        {result!.brand && <DetailRow label="Brand" value={result!.brand} />}
                        {result!.mpn && <DetailRow label="Model" value={result!.mpn} />}
                        {result!.categoryPath && <DetailRow label="Category" value={result!.categoryPath} />}
                        {result!.itemSpecifics?.map((spec) => (
                          <DetailRow key={spec.name} label={spec.name} value={spec.value} />
                        ))}
                        {!result!.brand && !result!.mpn && !result!.itemSpecifics?.length && (
                          <p className="text-ink/45">We don&apos;t have any additional details for this listing.</p>
                        )}
                      </dl>
                    )}
                    {activeTab === 'Shipping & Returns' && (
                      <dl className="flex flex-col gap-1.5 text-xs">
                        {result!.itemLocation && <DetailRow label="Ships from" value={result!.itemLocation} />}
                        <DetailRow
                          label="Returns"
                          value={
                            result!.returnsAccepted
                              ? `Accepted${result!.returnPeriodDays ? ` within ${result!.returnPeriodDays} days` : ''}`
                              : 'Not accepted by seller'
                          }
                        />
                        {result!.availability ? (
                          <DetailRow label="Availability" value={result!.availability} />
                        ) : (
                          !result!.itemLocation && (
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
            </div>
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