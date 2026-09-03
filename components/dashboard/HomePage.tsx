// HomePage.tsx
'use client'

import { useLayoutEffect, useRef, useState, useEffect } from 'react'
import {
  ChevronRight,
  Plus,
  Package,
  Undo2,
  CreditCard,
  PackageOpen,
  Truck,
  MessageSquare,
  Shirt,
  Mail,
  FileEdit,
  Heart,
  UserCheck,
  Clock,
  Gift,
  Eye,
  EyeOff,
  Store,
} from 'lucide-react'
import { offers } from './data'
import Image from 'next/image'
import { useClipboardLink } from '@/hooks/useClipboardLink'
import { useElementHeight } from '@/hooks/useElementHeight'
import { affiliatedStores, type AffiliatedStore } from '@/data/stores/data'
import Flag from '@/components/ui/Flag'

type HomePageProps = {
  link: string
  setLink: (value: string) => void
  onSubmitRequest: (event: React.FormEvent) => void
  onBrowseStores: () => void
  onViewOrders: () => void
  onViewProfile?: () => void
  onViewCoupons?: () => void
  onViewPoints?: () => void
  onViewWallet?: () => void
  onViewGiftCard?: () => void
  onViewMessages?: () => void
  onViewServiceRecords?: () => void
  onViewWishlist?: () => void
  onViewFollowing?: () => void
  onViewRecentlyViewed?: () => void
  couponsCount?: number
  pointsBalance?: number
  walletBalance?: number
  wishlistCount?: number
  followingCount?: number
  latestOrderStatus?: string
}

// Shared type for lucide-react icon components passed as props. Includes
// className since several helpers below apply Tailwind classes (color,
// sizing overrides) directly to the icon element.
type IconComponent = React.ComponentType<{
  size?: number
  strokeWidth?: number
  className?: string
}>

const AUTO_SUBMIT_DOMAINS = ['amazon.com', 'ebay.com']
const AUTO_SUBMIT_DELAY_MS = 5000

// Fixed column count for the "Stores for you" tile grid. Kept constant
// (rather than responsive auto-fill) so the row-count math in
// SuggestedStoresCard below — which adds/removes whole rows to match the
// left column's height — has a stable, predictable number of tiles per
// row to reason about.
const STORE_GRID_COLS = 4

// One column inside the account-overview stat row. Deliberately unboxed —
// no border or background behind the row itself — so it sits flush on the
// card, matching the reference (which has no visible container around
// Coupons/Points/Wallet/Gift Card, just plain columns separated by space).
// Balance columns are masked as "***" by default (mirroring SHEIN's privacy
// pattern) but reveal the real value once the eye toggle above the row is
// switched on. No icon on these three — only the Gift Card shortcut gets one.
function MaskedStatColumn({
  label,
  value,
  visible,
  onClick,
}: {
  label: string
  value: number
  visible: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center justify-end gap-1.5 py-1 text-center transition-opacity duration-150 hover:opacity-70"
    >
      <span className="font-display text-xl tracking-widest text-ink">
        {visible ? value : '***'}
      </span>
      <span className="flex items-center gap-1 text-xs font-semibold text-ink/55">
        {label}
      </span>
    </button>
  )
}

// Gift Card is a shortcut, not a balance — icon + label only, no value line,
// matching the reference where it's the one column with no "***".
function IconOnlyColumn({
  label,
  onClick,
  icon: Icon,
}: {
  label: string
  onClick?: () => void
  icon: IconComponent
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center justify-end gap-1.5 py-1 text-center transition-opacity duration-150 hover:opacity-70"
    >
      <span className="grid size-9 place-items-center rounded-lg border border-ink/10 text-ink/45">
        <Icon size={16} strokeWidth={1.8} />
      </span>
      <span className="flex items-center gap-1 text-xs font-semibold text-ink/55">
        {label}
      </span>
    </button>
  )
}

// One icon in the "My Orders" status row — plain icon + label, no border or
// background square behind it, matching the reference's unboxed icon row.
function OrderStatusIcon({
  label,
  onClick,
  icon: Icon,
}: {
  label: string
  onClick: () => void
  icon: IconComponent
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-1 flex-col items-center gap-2.5 py-2 text-center transition-opacity duration-150 hover:opacity-70"
    >
      <Icon size={22} strokeWidth={1.6} className="text-ink/60" />
      <span className="text-xs font-semibold text-ink/60 group-hover:text-ink">
        {label}
      </span>
    </button>
  )
}

// One of the two icon actions inside the "Customer Service" card — plain
// icon-over-label, no border, matching the envelope/edit pair in the
// reference layout rather than a full button treatment.
function ServiceAction({
  label,
  onClick,
  icon: Icon,
}: {
  label: string
  onClick?: () => void
  icon: IconComponent
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-2 rounded-xl py-2 text-center transition-colors duration-150 hover:bg-ink/[0.03]"
    >
      <Icon size={20} strokeWidth={1.6} className="text-ink/70" />
      <span className="text-xs font-semibold text-ink/70">{label}</span>
    </button>
  )
}

// A single "Wishlist / Following / Recently Viewed"-style row: label on the
// left, count + chevron on the right, whole row clickable. Stacked as
// separate cards rather than one grouped list so each keeps its own border,
// matching the reference's three distinct boxes.
function RailRow({
  label,
  count,
  onClick,
  icon: Icon,
  moreLabel = 'item',
}: {
  label: string
  count?: number
  onClick?: () => void
  icon: IconComponent
  moreLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl border border-ink/10 bg-card px-5 py-4 text-left transition-colors duration-150 hover:border-ink/20"
    >
      <span className="flex items-center gap-2.5 font-semibold text-ink">
        <Icon size={16} strokeWidth={1.8} className="text-ink/45" />
        {label}
      </span>
      <span className="flex items-center gap-1 text-sm text-ink/55">
        {typeof count === 'number' ? `${count} ${moreLabel}` : moreLabel}
        <ChevronRight size={14} />
      </span>
    </button>
  )
}

// Single store tile inside SuggestedStoresCard — logo + name, clickable
// straight through to that store's page. Mirrors the logo-rendering rules
// from ShopMegaMenu's StoreRow (square/object-cover for local sellers'
// own-brand tiles, circle/object-contain for marketplace badges) so a
// store looks the same wherever it's suggested across the app.
function SuggestedStoreTile({ store }: { store: AffiliatedStore }) {
  const isLocal = store.storeType === 'local'
  return (
    <a
      href={`/stores/${store.platform}`}
      className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center transition-colors duration-150 hover:bg-ink/[0.03]"
    >
      <span
        className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-ink/10 bg-card ${
          isLocal ? 'rounded-lg' : 'rounded-full'
        }`}
        style={isLocal ? store.bannerStyle : undefined}
      >
        {isLocal ? (
          // eslint-disable-next-line @next/next/no-img-element -- fixed square tile, plain img keeps this simple
          <Image src={store.logo} alt="" className="h-full w-full object-cover" width={56} height={56} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- fixed circle, logo centered regardless of its own aspect ratio
          <Image src={store.logo} alt="" className="h-full w-full object-contain p-1" width={56} height={56} />
        )}
      </span>
      <span className="flex w-full min-w-0 items-center justify-center gap-1 truncate text-[11px] font-medium text-ink/75">
        <span className="truncate">{store.name}</span>
      </span>
    </a>
  )
}

// Right-rail card showing real, clickable suggested stores. Its height is
// made to match `targetHeight` (the left column's Hello + Buy-for-me
// cards, measured live by the parent) by adding or removing whole rows
// of tiles — NOT by picking a fixed tile count or hardcoding any pixel
// value. This is the same "measure the real thing, don't guess a
// constant" approach used for the header height elsewhere in this app:
// any future change to fonts, padding, tile size, or card copy is
// automatically absorbed because the fit is recomputed from actual
// rendered heights every time, rather than drifting out of sync with a
// hand-maintained number.
//
// This card only ever renders at the `lg` breakpoint and up (see the
// wrapper in HomePage below), since the row-fitting math is meaningless
// on mobile — there's no left column to match on a single-column layout.
//
// How the fit works: after each render, compare this card's actual
// rendered height (via `cardRef`) against `targetHeight`. If there's
// room for at least half a row more, add one row (`STORE_GRID_COLS`
// tiles) and let the effect re-run on the next render; if there's a
// full row too many, remove one. This converges within a few renders
// (bounded by the catalog size) without ever hardcoding a row height —
// the row height itself is read from a rendered tile via `gridRef`.
function SuggestedStoresCard({
  targetHeight,
  onBrowseStores,
}: {
  targetHeight: number
  onBrowseStores?: () => void
}) {
  // isNew stores surfaced first (most relevant to highlight), backfilled
  // with the rest of the catalog. Stable order — not shuffled per render —
  // so the grid doesn't jump around as rows are added/removed while
  // fitting to targetHeight.
  const orderedStores = useRef<AffiliatedStore[]>(
    [...affiliatedStores.filter((s) => s.isNew), ...affiliatedStores.filter((s) => !s.isNew)]
  ).current

  const [storesCount, setStoresCount] = useState(Math.min(STORE_GRID_COLS * 2, orderedStores.length))

  const cardRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!targetHeight || !cardRef.current) return

    const actualHeight = cardRef.current.getBoundingClientRect().height
    const diff = targetHeight - actualHeight

    // Read one real rendered tile's height (+ the grid's own row gap) to
    // know what "one row" costs in pixels — derived from the DOM, not
    // assumed. Falls back to a rough estimate only on the very first
    // pass, before any tile has rendered yet.
    const sampleTile = gridRef.current?.querySelector('a')
    const rowGapPx = gridRef.current ? parseFloat(getComputedStyle(gridRef.current).rowGap || '0') : 8
    const rowHeight = sampleTile ? sampleTile.getBoundingClientRect().height + rowGapPx : 80

    if (diff > rowHeight / 2 && storesCount < orderedStores.length) {
      setStoresCount((count) => Math.min(orderedStores.length, count + STORE_GRID_COLS))
    } else if (diff < -rowHeight / 2 && storesCount > STORE_GRID_COLS) {
      setStoresCount((count) => Math.max(STORE_GRID_COLS, count - STORE_GRID_COLS))
    }
  }, [targetHeight, storesCount, orderedStores.length])

  const visibleStores = orderedStores.slice(0, storesCount)

  return (
    <div
      ref={cardRef}
      className="flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-card p-5"
      // Clamp to the measured target once known, so a not-yet-converged
      // pass never visibly overflows or leaves a gap larger than half a
      // row — the effect above then closes the remaining gap over the
      // next render or two.
      style={targetHeight ? { height: targetHeight, maxHeight: targetHeight } : undefined}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base text-ink">Stores for you</h3>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal/12 text-teal-deep">
          <Store size={15} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-1 text-xs text-ink/55">No link needed — pricing already confirmed.</p>

      <div ref={gridRef} className="mt-4 grid grid-cols-4 gap-x-1 gap-y-2 overflow-hidden">
        {visibleStores.map((store) => (
          <SuggestedStoreTile key={store.platform} store={store} />
        ))}
      </div>

      <button
        type="button"
        onClick={onBrowseStores}
        className="mt-auto flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal/8"
      >
        View all {affiliatedStores.length} stores
        <ChevronRight size={13} />
      </button>
    </div>
  )
}

export default function HomePage({
  link,
  setLink,
  onSubmitRequest,
  onBrowseStores,
  onViewOrders,
  onViewProfile,
  onViewCoupons,
  onViewPoints,
  onViewWallet,
  onViewGiftCard,
  onViewMessages,
  onViewServiceRecords,
  onViewWishlist,
  onViewFollowing,
  onViewRecentlyViewed,
  couponsCount = 0,
  pointsBalance = 0,
  walletBalance = 0,
  wishlistCount = 0,
  followingCount = 0,
  latestOrderStatus,
}: HomePageProps) {
  const buyFormRef = useRef<HTMLFormElement>(null)
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingAutoSubmitUrl, setPendingAutoSubmitUrl] = useState<string | null>(null)
  // Single toggle for all three masked balances — one eye icon reveals or
  // re-hides Coupons/Points/Wallet together, rather than one eye per column.
  const [balancesVisible, setBalancesVisible] = useState(false)

  // Measures the combined height of the "Hello" card + "Buy for me" form
  // live, so "Stores for you" on the right can always match it exactly —
  // including if either card's content, padding, or font size ever
  // changes. Only relevant at the `lg` breakpoint and up, since that's the
  // only place the Stores-for-you card renders at all — see its wrapper
  // below. See SuggestedStoresCard for how that height is consumed.
  const { ref: topLeftRef, height: topLeftHeight } = useElementHeight<HTMLDivElement>()

  const cancelPendingAutoSubmit = () => {
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current)
      autoSubmitTimerRef.current = null
    }
    setPendingAutoSubmitUrl(null)
  }

  const handleUndoAutoSubmit = () => {
    cancelPendingAutoSubmit()
    setLink('')
  }

  const handleFormSubmit = (event: React.FormEvent) => {
    cancelPendingAutoSubmit()
    onSubmitRequest(event)
  }

  useClipboardLink(link, setLink, {
    allowedDomains: AUTO_SUBMIT_DOMAINS,
    onAllowedDomain: (url) => {
      setPendingAutoSubmitUrl(url)
      autoSubmitTimerRef.current = setTimeout(() => {
        autoSubmitTimerRef.current = null
        setPendingAutoSubmitUrl(null)
        buyFormRef.current?.requestSubmit()
      }, AUTO_SUBMIT_DELAY_MS)
    },
  })

  useEffect(() => {
    if (pendingAutoSubmitUrl && !link.trim()) {
      cancelPendingAutoSubmit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link])

  useEffect(() => {
    return () => {
      if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current)
    }
  }, [])

  const hasOrders = Boolean(latestOrderStatus)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-8 lg:px-10">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes toastShrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>

      {pendingAutoSubmitUrl && (
        <div
          className="fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-3 overflow-hidden rounded-2xl border border-ink/10 bg-ink text-white shadow-lg shadow-ink/20"
          style={{ animation: 'toastIn 0.25s ease-out both' }}
          role="status"
        >
          <div className="flex flex-1 items-center gap-3 px-4 py-3.5">
            <span className="min-w-0 flex-1 text-sm">
              Auto-adding request from{' '}
              <span className="font-semibold">
                {(() => {
                  try {
                    return new URL(pendingAutoSubmitUrl).hostname.replace(/^www\./, '')
                  } catch {
                    return 'clipboard link'
                  }
                })()}
              </span>
            </span>
            <button
              type="button"
              onClick={handleUndoAutoSubmit}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/20"
            >
              <Undo2 size={13} />
              Undo
            </button>
          </div>
          <div className="absolute bottom-0 left-0 h-0.5 bg-gold" style={{ animation: `toastShrink ${AUTO_SUBMIT_DELAY_MS}ms linear forwards` }} />
        </div>
      )}

      {/*
        Layout notes:

        Desktop (lg:) reading order via `lg:order-*`:
          1. topLeft (Hello + Buy for me)
          2. Stores for you
          3. My Orders
          4. Customer Service + rail rows

        CSS Grid auto-placement then lays these out two-per-row:
          row 1 = [topLeft, Stores for you]
          row 2 = [My Orders, Customer Service group]

        Grid's default `align-items: stretch` equalizes the height of both
        cells within each row automatically — so My Orders and the right
        group always match each other's height without any JS measuring
        (unlike the Stores-for-you card, which needs JS because it adds or
        removes tiles rather than just stretching). That stretch-matching
        is gated behind `lg:h-full` on both cards below, since it only
        makes sense once they're actually siblings in the same 2-column
        grid row — on mobile they're stacked, not adjacent, so each one
        should just size to its own content instead.

        Mobile (no lg:) uses a different `order-*` so it falls back to the
        original single-column reading order: Hello/Buy-for-me → My Orders
        → Customer Service/rail. "Stores for you" is hidden entirely on
        mobile (see its wrapper below) rather than reflowed into this
        order, since it's not needed there.
      */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_330px] z-0">
        {/* Hello + Buy for me */}
        <div ref={topLeftRef} className="order-1 flex min-w-0 flex-col gap-3 lg:order-1">
          <div className="rounded-2xl border border-ink/10 bg-card p-6 motion-safe:[animation:fadeUp_0.35s_ease-out_both]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
                Hello, Safnas Kaldeen!
              </h1>
              <p className="mt-1.5 text-sm font-semibold text-ink/60">
                Everything you need to shop, ship, and save — all in one place.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setBalancesVisible((prev) => !prev)}
                aria-label={balancesVisible ? 'Hide balances' : 'Show balances'}
                className="rounded-lg p-1.5 text-ink/35 transition-colors hover:text-ink/60"
              >
                {balancesVisible ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
              </button>
              <button
                type="button"
                onClick={onViewProfile}
                className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-ink/55 hover:text-teal-deep"
              >
                My Profile <ChevronRight size={13} />
              </button>
            </div>
          </div>

            {/* Coupons / Points / Wallet are masked balances by default
                (shown as "***"); the eye button toggles all three visible
                at once. Gift Card is an icon-only shortcut with no value —
                matches the reference, four columns wide. */}
            <div className="mt-5 flex items-stretch justify-between gap-2">
              <MaskedStatColumn label="Coupons" value={couponsCount} visible={balancesVisible} onClick={onViewCoupons} />
              <MaskedStatColumn label="Points" value={pointsBalance} visible={balancesVisible} onClick={onViewPoints} />
              <MaskedStatColumn label="Wallet" value={walletBalance} visible={balancesVisible} onClick={onViewWallet} />
              <IconOnlyColumn label="Gift Card" onClick={onViewGiftCard} icon={Gift} />
            </div>
          </div>

          <form
            ref={buyFormRef}
            onSubmit={handleFormSubmit}
            className="flex flex-col gap-4 rounded-2xl border border-ink/10 bg-card p-6 transition-shadow duration-300 hover:shadow-sm motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: '120ms' }}
          >
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal/12 text-teal-deep" aria-hidden="true">
                <Package size={20} strokeWidth={2} />
              </span>
              <div>
                <p className="font-semibold text-ink">Buy for me</p>
                <p className="mt-1 text-sm text-ink/55">
                  Paste a link to any product, from any store, and we&apos;ll buy, quality-check, and deliver it to you.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <textarea
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="Paste product link here (e.g. https://example.com/item)"
                rows={1}
                className="min-h-[48px] flex-1 resize-y rounded-xl border border-ink/15 bg-parchment p-3.5 text-sm outline-none transition-all duration-200 placeholder:text-ink/35 focus:border-gold/60 focus:bg-card focus:ring-2 focus:ring-gold/50"
              />
              <button
                type="submit"
                disabled={!link.trim()}
                className="group flex items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-deep hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/25 disabled:active:scale-100 sm:flex-none"
              >
                <Plus size={18} className="transition-transform duration-200 group-hover:rotate-90" />
                Add request
              </button>
            </div>
          </form>
        </div>

        {/* Stores for you — hidden on mobile entirely (not just visually
            collapsed): its whole row-fitting logic depends on matching
            topLeftHeight, which is a desktop-only concept, so there's
            nothing useful for it to do below `lg`. Desktop: top-right,
            next to Hello/Buy-for-me (lg:order-2). */}
        <div
          className="hidden min-w-0 motion-safe:[animation:fadeUp_0.4s_ease-out_both] lg:order-2 lg:block"
          style={{ animationDelay: '60ms' }}
        >
          <SuggestedStoresCard targetHeight={topLeftHeight} onBrowseStores={onBrowseStores} />
        </div>

        {/* My Orders — mobile: right after Hello/Buy-for-me (order-2), sized
            to its own content; desktop: bottom-left (lg:order-3), sharing a
            grid row with the Customer Service group so both stretch to the
            same height via lg:h-full. flex-col lets this card fill that
            stretched height on desktop; flex-1 on the inner
            empty-state/track-order block absorbs the extra space instead of
            leaving a gap below it. */}
        <div
          className="order-2 flex min-w-0 flex-col rounded-2xl border border-ink/10 bg-card p-6 motion-safe:[animation:fadeUp_0.4s_ease-out_both] lg:order-3 lg:h-full"
          style={{ animationDelay: '60ms' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-ink">My Orders</h2>
            <button
              type="button"
              onClick={onViewOrders}
              className="flex items-center gap-1 text-xs font-semibold text-ink/55 hover:text-teal-deep"
            >
              View All <ChevronRight size={13} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-1">
            <OrderStatusIcon label="Unpaid" onClick={onViewOrders} icon={CreditCard} />
            <OrderStatusIcon label="Processing" onClick={onViewOrders} icon={PackageOpen} />
            <OrderStatusIcon label="Shipped" onClick={onViewOrders} icon={Truck} />
            <OrderStatusIcon label="Review" onClick={onViewOrders} icon={MessageSquare} />
            <OrderStatusIcon label="Returns" onClick={onViewOrders} icon={Undo2} />
          </div>

          {/* Nested light-gray box for the order content — a separate
              "panel" inside the card rather than content sitting directly
              below a divider line, matching the reference's boxed
              empty-state / order-teaser area. flex-1 so it grows to fill
              whatever extra height this card is stretched to. */}
          {hasOrders ? (
            <button
              type="button"
              onClick={onViewOrders}
              className="mt-5 flex flex-1 items-center justify-between rounded-xl border border-teal/25 bg-teal/8 px-4 py-3.5 text-left transition-colors hover:border-teal/40"
            >
              <span className="text-sm text-ink/70">
                Your last order is at{' '}
                <span className="font-semibold text-ink">{latestOrderStatus}</span>
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold text-teal-deep">
                Track order <ChevronRight size={14} />
              </span>
            </button>
          ) : (
            <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-ink/[0.025] py-10 text-center">
              <Shirt size={40} strokeWidth={1.2} className="text-ink/20" />
              <p className="text-sm text-ink/40">It is empty here :-(</p>
            </div>
          )}
        </div>

        {/* Customer Service + Wishlist/Following/Recently Viewed —
            mobile: last (order-5), sized to its own content; desktop:
            bottom-right (lg:order-4), sharing a grid row with My Orders so
            both stretch to the same height via lg:h-full. flex-1 +
            justify-center on the rail-row list absorbs the extra space on
            desktop by centering that block vertically, rather than
            stretching each row individually or leaving dead space. */}
        <div className="order-5 flex min-w-0 flex-col gap-4 lg:order-4 lg:h-full">
          <div
            className="rounded-2xl border border-ink/10 bg-card p-5 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: '80ms' }}
          >
            <h3 className="font-display text-base text-ink">Customer Service</h3>
            <div className="mt-3 flex gap-2">
              <ServiceAction label="My Message" onClick={onViewMessages} icon={Mail} />
              <ServiceAction label="Service Records" onClick={onViewServiceRecords} icon={FileEdit} />
            </div>
          </div>

          <div
            className="flex flex-1 flex-col justify-center gap-3 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: '140ms' }}
          >
            <RailRow label="Wishlist" count={wishlistCount} onClick={onViewWishlist} icon={Heart} />
            <RailRow label="Following" count={followingCount} onClick={onViewFollowing} icon={UserCheck} />
            <RailRow label="Recently Viewed" moreLabel="More" onClick={onViewRecentlyViewed} icon={Clock} />
          </div>
        </div>

        {/* Exclusive offers — hidden for now; order kept consistent with
            the rest of the flow in case it's re-enabled later. */}
        <h2 className="order-3 mt-11 hidden font-display text-2xl text-ink lg:order-5">
          Exclusive offers
        </h2>
        <div className="order-3 mt-5 hidden grid-cols-1 gap-4 lg:order-5 lg:grid-cols-2">
          {offers.map((offer, i) => (
            <article
              key={offer.title}
              className="group overflow-hidden rounded-2xl border border-ink/10 transition-all duration-300 hover:-translate-y-1 hover:border-ink/20 hover:shadow-lg hover:shadow-ink/10 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
              style={{ animationDelay: `${320 + i * 60}ms` }}
            >
              <div className="w-full overflow-hidden rounded-t-2xl">
                <Image
                  src={offer.img}
                  alt=""
                  width={800}
                  height={450}
                  className="w-full h-auto object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />
              </div>
              <span className="block px-3 py-3 text-xs font-semibold leading-snug text-ink transition-colors group-hover:text-teal-deep sm:px-4 sm:py-4 sm:text-sm">
                {offer.title}
              </span>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}