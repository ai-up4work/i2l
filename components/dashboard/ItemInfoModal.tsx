'use client'

import { useState, useEffect, useRef } from 'react'
import { X, ShoppingCart, Zap, ArrowLeft, ShoppingBag } from 'lucide-react'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import AmazonProductView from '@/components/platforms/AmazonProductView'
import FlipkartProductView from '@/components/platforms/FlipkartProductView'
import MeeshoProductView from '@/components/platforms/Meeshoproductview'
import MyntraProductView from '@/components/platforms/MyntraProductView'
import EbayProductView from '@/components/platforms/EbayProductView'
import AjioProductView from '@/components/platforms/AjioProductView'
import JioMartProductView from '@/components/platforms/JioMartProductView'
import SnapdealProductView from '@/components/platforms/SnapdealProductView'
import ShopifyProductView from '@/components/platforms/Shopifyproductview'
import WooCommerceProductView from '@/components/platforms/Woocommerceproductview'
import { useCart, type CartProduct } from '@/contexts/Cartcontext'
import { useWishlist, type WishlistProduct } from '@/contexts/Wishlistcontext'
import { HEADER_BAR_HEIGHT } from '@/components/shared/Header'
import { MOBILE_BOTTOM_NAV_HEIGHT } from '@/components/dashboard/MobileBottomNav'
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
 * Panel bounds: at ALL breakpoints, the top of the panel follows
 * --account-header-h (set by AccountShell to the Topbar/Header height
 * normally, or to the WelcomeBanner's live height / 0 while this modal
 * is open — see AccountShell for the full explanation). This lets the
 * banner visually "push" the panel down while it's open, and lets the
 * panel expand to fill that space the instant the banner is dismissed,
 * on desktop just as it already did on mobile.
 *
 * Only `bottom` differs by breakpoint: below 1024px there's a real
 * fixed mobile bottom nav to clear, so bottom reserves
 * MOBILE_BOTTOM_NAV_HEIGHT + safe-area inset. At 1024px+ there's no
 * bottom nav, so bottom resets to 0.
 *
 * (Previously, `top` was ALSO force-reset to 0 at 1024px+, which broke
 * the banner-push behavior on desktop entirely — the panel ignored
 * --account-header-h and always started at the very top of the
 * viewport regardless of whether the banner was open. Fixed below.)
 *
 * Backdrop bounds: the dimmed/blurred backdrop shares the same
 * .item-overlay-bounds top/bottom offsets as the panel (inset-x-0
 * instead of inset-0), so it never paints over whatever is meant to
 * stay visible above the panel (banner, or nothing once dismissed).
 *
 * Click-through fix: the outer `fixed inset-0` wrapper used to be a
 * fully "live" hit-target for its entire box, even in the region above
 * .item-overlay-bounds (the gap left uncovered on mobile, where the
 * WelcomeBanner lives, since --account-header-h only accounts for
 * Topbar/Header height, not the banner). That transparent gap still
 * intercepted clicks meant for whatever was underneath, at z-20 —
 * i.e. WelcomeBanner's "Details" link and dismiss button were dead
 * while this modal was open, even though nothing was visibly on top of
 * them. Fix: the outer wrapper is now `pointer-events-none`, and only
 * the two actually-visible pieces — the backdrop and the panel — opt
 * back in with `pointer-events-auto`. Nothing else changed.
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
 * submitted via onRequestItem (backed by saveItemInfo/confirmRequest,
 * which read only from `draft` — never from cart state). They used to
 * both write to CartContext, which meant confirming a request also
 * silently created a cart line for the same product — and if that cart
 * was later checked out, it would mint a SECOND, duplicate request. Only
 * handleAddToCart touches cart.addItem now.
 */

type ItemOverlayProps = {
  open: boolean
  result?: ScrapeResult | null
  estimatedPrice?: string
  estimatedPriceNote?: string
  onSelectVariant?: (url: string) => void
  qty: number
  onQtyChange: (qty: number) => void
  onClose: () => void
  onRequestItem: () => void
  loading?: boolean
}

type Step = 'listing' | 'review'

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

// Fallback for an unrecognized result.site — now also renders its own
// StoreCommercePanel, same as every named platform view.
function GenericProductView(props: Parameters<typeof AmazonProductView>[0]) {
  const { result } = props
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
      </div>

    </div>
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
  const [step, setStep] = useState<Step>('listing')
  const [confirmsRestrictions, setConfirmsRestrictions] = useState(false)
  const [confirmsPreowned, setConfirmsPreowned] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
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

  if (!open) return null

  const showLoading = !result || loading
  const handleSelectVariant = (url: string) => onSelectVariant?.(url)
  const productSnapshot = result && !result.error ? toProductSnapshot(result) : null
  const inWishlist = productSnapshot ? wishlist.isInWishlist(productSnapshot.id) : false
  const canSubmitReview = confirmsRestrictions && confirmsPreowned

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

  function handleConfirmRequest() {
    // Submitting a request only needs onRequestItem() — everything it
    // needs (name/url/qty/unitPrice/image) already lives in
    // DashboardContext's `draft`, populated earlier by
    // beginRequestForUrl/selectVariant. This no longer touches
    // cart.addItem: doing so here meant confirming a request also
    // created a cart line for the same product, which could later be
    // checked out into a second, duplicate request. Cart and requests
    // are separate commitments now — see the file-level doc comment.
    onRequestItem()
    setStep('listing')
    setConfirmsRestrictions(false)
    setConfirmsPreowned(false)
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

        .item-overlay-bounds {
          top: var(--account-header-h, ${HEADER_BAR_HEIGHT}px);
          bottom: calc(${MOBILE_BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom));
        }
        @media (min-width: 1024px) {
          /* NOTE: top intentionally NOT reset here anymore. It keeps
             following --account-header-h at every breakpoint, which is
             what lets the WelcomeBanner push this panel down while open
             (var = banner height) and lets the panel reclaim that space
             the instant the banner is dismissed (var = 0), on desktop
             exactly like it already worked on mobile. Only bottom
             differs by breakpoint, since there's no mobile bottom nav
             to clear at 1024px+. */
          .item-overlay-bounds { bottom: 0; }
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
          ) : showLoading || result?.error ? (
            <div
              key={showLoading ? 'loading' : 'error'}
              className="flex min-w-0 items-center gap-1.5 motion-safe:[animation:tabFadeIn_0.25s_ease-out_both]"
            >
              <Zap size={13} className="flex-none text-teal-deep" strokeWidth={2.25} />
              <span className="truncate text-sm font-semibold text-ink/70">
                {showLoading ? 'Reading listing…' : 'Listing'}
              </span>
            </div>
          ) : (
            <div />
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
            <ProductSkeleton />
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}