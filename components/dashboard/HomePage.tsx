'use client'

import { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react'
import {
  ChevronRight,
  Plus,
  Package,
  Undo2,
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
import { useAffiliatedStores } from '@/hooks/useAffiliatedStores'
import type { AffiliatedStore } from '@/data/stores/data'
import Flag from '@/components/ui/Flag'
import MyOrdersCard, { type MyOrdersCardLatestOrder } from '@/components/dashboard/MyOrdersCard'

type HomePageProps = {
  name?: string
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
  /** Most recent order, used by MyOrdersCard to render a status +
   *  thumbnail teaser. Omit (or pass an order with an empty `items`
   *  array) to show the "It is empty here" state. NOTE: this replaced
   *  the old `latestOrderStatus?: string` prop — if orders aren't
   *  showing up, check the caller is passing this new shape and not
   *  the old string prop, which is now silently ignored (TS will also
   *  flag it, but only if the caller is typed). */
  latestOrder?: MyOrdersCardLatestOrder
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
// parchment, separated from its neighbors by a hairline divider rather
// than a card edge. Balance columns are masked as "***" by default
// (mirroring SHEIN's privacy pattern) but reveal the real value once the
// eye toggle above the row is switched on. No icon on these three — only
// the Gift Card shortcut gets one.
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
      <span className="grid size-9 place-items-center rounded-lg bg-gold/12 text-gold-deep">
        <Icon size={16} strokeWidth={1.8} />
      </span>
      <span className="flex items-center gap-1 text-xs font-semibold text-ink/55">
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
      className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors duration-150 hover:bg-ink/[0.025]"
    >
      <span className="flex items-center gap-3 font-semibold text-ink">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal/10 text-teal-deep">
          <Icon size={15} strokeWidth={1.8} />
        </span>
        {label}
      </span>
      <span className="flex items-center gap-1 text-sm text-ink/55">
        {typeof count === 'number' ? `${count} ${moreLabel}` : moreLabel}
        <ChevronRight size={14} />
      </span>
    </button>
  )
}

// Skeleton tile shown while useAffiliatedStores() is still fetching from
// Supabase. Matches SuggestedStoreTile's box dimensions (h-16 w-16 logo +
// a short label line) so the grid doesn't visibly jump in size once real
// tiles swap in.
function StoreTileSkeleton() {
  return (
    <div className="flex flex-col items-center gap-1.5 px-1 py-2">
      <div className="h-16 w-16 animate-pulse rounded-xl bg-ink/8" />
      <div className="h-2.5 w-10 animate-pulse rounded bg-ink/8" />
    </div>
  )
}

// Single store tile inside SuggestedStoresCard — logo + name, clickable
// straight through to that store's page. Mirrors the logo-rendering rules
// from ShopMegaMenu's StoreRow (square/object-cover for local sellers'
// own-brand tiles, circle/object-contain for marketplace badges) so a
// store looks the same wherever it's suggested across the app — that
// crop/shape logic is left untouched. What's new here is the framing
// around it: every logo now sits inside a neutral parchment-tinted
// backdrop with a touch of internal padding, so a stark black-background
// logo and a white-background logo read as two items on the same shelf
// instead of clashing squares of wildly different value. A small gold
// dot marks `isNew` stores — the one place this card borrows the accent
// color, and it's tied to real data rather than decoration.
//
// ROUTING: this card only ever shows local/affiliated stores (see
// `affiliatedOnly` in SuggestedStoresCard below), so in practice
// `isExternal` is always false here. It's still computed the same way
// as ShopMegaMenu's StoreRow — keyed off `storeType`, not just whether
// `url` happens to be populated on the record — so this tile stays
// correct on its own terms even if it's ever reused for a mixed list.
function SuggestedStoreTile({ store }: { store: AffiliatedStore }) {
  const isLocal = store.storeType === 'local'
  const isExternal = !isLocal && Boolean(store.url)
  const href = isExternal ? store.url! : `/stores/${store.platform}`
  return (
    <a
      href={href}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center transition-colors duration-150 hover:bg-ink/[0.03]"
    >
      <span className="relative">
        <span
          className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-ink/8 bg-parchment p-1.5 transition-transform duration-150 group-hover:scale-105 ${
            isLocal ? 'rounded-xl' : 'rounded-full'
          }`}
          style={isLocal ? store.bannerStyle : undefined}
        >
          {isLocal ? (
            // eslint-disable-next-line @next/next/no-img-element -- fixed square tile, plain img keeps this simple
            <Image src={store.logo} alt="" className="h-full w-full rounded-lg object-cover" width={64} height={64} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- fixed circle, logo centered regardless of its own aspect ratio
            <Image src={store.logo} alt="" className="h-full w-full object-contain" width={64} height={64} />
          )}
        </span>
        {store.isNew && (
          <span
            className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-gold ring-2 ring-parchment"
            aria-label="New store"
          />
        )}
      </span>
      <span className="flex w-full min-w-0 items-center justify-center gap-1 truncate text-[11px] font-medium text-ink/75">
        <span className="truncate">{store.name}</span>
      </span>
    </a>
  )
}

// Right-rail card showing real, clickable suggested stores. Its height is
// made to match `targetHeight` (the ENTIRE left column — Hello + Buy for
// me + My Orders — measured live by the parent) by adding or removing
// whole rows of tiles — NOT by picking a fixed tile count or hardcoding
// any pixel value. This is the same "measure the real thing, don't guess
// a constant" approach used for the header height elsewhere in this app:
// any future change to fonts, padding, tile size, or card copy is
// automatically absorbed because the fit is recomputed from actual
// rendered heights every time, rather than drifting out of sync with a
// hand-maintained number.
//
// This card only ever renders at the `lg` breakpoint and up (see the
// wrapper in HomePage below), since the row-fitting math is meaningless
// on mobile — there's no left column to match on a single-column layout.
// (Mobile gets its own lightweight horizontal-scroll strip instead — see
// MobileStoresStrip below.)
//
// STORE SOURCE: "Stores for you" is specifically about sellers where
// pricing is already pre-confirmed with us (see the "No link needed —
// pricing already confirmed" copy below) — that only applies to our
// local/affiliated sellers, never third-party marketplaces like Amazon
// or Flipkart, where we have no pricing arrangement. So this card
// filters `stores` down to `storeType === 'local'` up front, before any
// of the isNew-ordering or row-fitting logic runs.
//
// LOADING STATE: useAffiliatedStores() seeds `stores` with just
// marketplaceStores and flips `loading` to false only once the Supabase
// `sellers` query resolves (see hooks/useAffiliatedStores.ts) — so on
// first paint `affiliatedOnly` is genuinely empty (marketplaceStores has
// no `local` entries), not just "not yet fetched". Without a loading
// branch this card would render zero tiles and a `mt-auto` button
// floating at the bottom of an otherwise-empty box until the DB round
// trip finishes, which reads as broken rather than loading. Skeleton
// tiles fill that gap; the row-fitting effect below is skipped entirely
// while `loading` is true, since there'd be no real tile to measure a
// row height from and affiliatedOnly.length is 0 anyway.
function SuggestedStoresCard({
  targetHeight,
  onBrowseStores,
}: {
  targetHeight: number
  onBrowseStores?: () => void
}) {
  const { stores, loading } = useAffiliatedStores()

  // Local/affiliated sellers only — marketplaces are excluded here (see
  // note above). Filtered before the isNew split so `orderedStores` below
  // never contains a marketplace entry regardless of its isNew flag.
  const affiliatedOnly = useMemo(
    () => stores.filter((s) => s.storeType === 'local'),
    [stores],
  )

  // isNew stores surfaced first (most relevant to highlight), backfilled
  // with the rest of the affiliated catalog. Stable order — only
  // recomputes when `affiliatedOnly` itself changes (i.e. once, when the
  // fetch resolves) — so the grid doesn't jump around as rows are
  // added/removed while fitting to targetHeight.
  const orderedStores = useMemo<AffiliatedStore[]>(
    () => [...affiliatedOnly.filter((s) => s.isNew), ...affiliatedOnly.filter((s) => !s.isNew)],
    [affiliatedOnly],
  )

  // Seeded at a flat 2 rows rather than `Math.min(STORE_GRID_COLS * 2,
  // orderedStores.length)` — at mount `orderedStores.length` is 0 (only
  // marketplaces are loaded initially), so clamping against it here would
  // start the count at 0 and rely entirely on the fit-effect's `diff`
  // branch to climb back up later. Slicing in `visibleStores` below
  // already clamps safely if storesCount ever exceeds the real list.
  const [storesCount, setStoresCount] = useState(STORE_GRID_COLS * 2)

  const cardRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (loading || !targetHeight || !cardRef.current) return

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
  }, [loading, targetHeight, storesCount, orderedStores.length])

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
        {loading
          ? Array.from({ length: STORE_GRID_COLS * 2 }).map((_, i) => <StoreTileSkeleton key={i} />)
          : visibleStores.map((store) => <SuggestedStoreTile key={store.platform} store={store} />)}
      </div>

      <button
        type="button"
        onClick={onBrowseStores}
        disabled={loading}
        className="mt-auto flex w-full items-center justify-center gap-1 rounded-full bg-teal/8 py-2.5 text-xs font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal/14 disabled:opacity-50"
      >
        {loading ? 'Loading stores…' : `View all ${affiliatedOnly.length} stores`}
        <ChevronRight size={13} />
      </button>
    </div>
  )
}

// Mobile counterpart to SuggestedStoresCard. On small screens there's no
// left column to match heights against (the whole point of the desktop
// card's row-fitting logic), so instead of hiding "Stores for you"
// entirely below `lg`, this renders the same store tiles as a compact,
// horizontally-scrollable strip directly under My Orders — mirroring
// where the right-rail card sits relative to the left column on desktop,
// just collapsed into a single row instead of a grid. Reuses
// SuggestedStoreTile/StoreTileSkeleton as-is so a tile looks identical
// wherever it appears; only the container around it differs (a fixed
// width per tile + overflow-x-auto instead of a 4-col grid).
function MobileStoresStrip({ onBrowseStores }: { onBrowseStores?: () => void }) {
  const { stores, loading } = useAffiliatedStores()

  const affiliatedOnly = useMemo(
    () => stores.filter((s) => s.storeType === 'local'),
    [stores],
  )

  const orderedStores = useMemo<AffiliatedStore[]>(
    () => [...affiliatedOnly.filter((s) => s.isNew), ...affiliatedOnly.filter((s) => !s.isNew)],
    [affiliatedOnly],
  )

  return (
    <div className="rounded-2xl border border-ink/10 bg-card p-5 lg:hidden">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base text-ink">Stores for you</h3>
        <button
          type="button"
          onClick={onBrowseStores}
          disabled={loading}
          className="flex items-center gap-1 text-xs font-semibold text-teal-deep disabled:opacity-50"
        >
          View all
          <ChevronRight size={13} />
        </button>
      </div>
      <p className="mt-1 text-xs text-ink/55">No link needed — pricing already confirmed.</p>

      <div className="mt-4 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-20 shrink-0">
                <StoreTileSkeleton />
              </div>
            ))
          : orderedStores.map((store) => (
              <div key={store.platform} className="w-20 shrink-0">
                <SuggestedStoreTile store={store} />
              </div>
            ))}
      </div>
    </div>
  )
}

// Single-line text that scrolls (marquee) only when it's actually wider
// than the space it's given — measured live via ResizeObserver against
// both the text's natural width and its container's width, rather than
// assumed from breakpoint. So on a wide desktop card where "Paste a link
// to any product..." fits comfortably, it just sits still as normal
// static text; on a narrow mobile "Buy for me" card where it doesn't,
// it scrolls instead of wrapping onto a second/third line and inflating
// the hero card's height. Renders the text twice back-to-back only while
// scrolling, so the marquee loops seamlessly with no visible gap/jump at
// the loop point; while idle it renders once, plainly.
function MarqueeText({ text, className = '' }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [distance, setDistance] = useState(0)

  useLayoutEffect(() => {
    const container = containerRef.current
    const text = textRef.current
    if (!container || !text) return

    const measure = () => {
      const overflowBy = text.scrollWidth - container.clientWidth
      setIsOverflowing(overflowBy > 4)
      setDistance(overflowBy > 4 ? overflowBy : 0)
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    observer.observe(text)
    return () => observer.disconnect()
  }, [text])

  // Duration scales with distance so longer overflow doesn't scroll by
  // faster/slower than shorter overflow — a steady, readable px/s pace
  // rather than a fixed duration regardless of content length.
  const durationMs = Math.max(3000, distance * 40)

  return (
    <div ref={containerRef} className={`overflow-hidden whitespace-nowrap ${className}`}>
      <span
        className="inline-flex"
        style={
          isOverflowing
            ? {
                animation: `marqueeScroll ${durationMs}ms linear infinite`,
                animationDelay: '600ms',
              }
            : undefined
        }
      >
        <span ref={textRef}>{text}</span>
        {isOverflowing && (
          <span aria-hidden="true" style={{ paddingLeft: 32 }}>
            {text}
          </span>
        )}
      </span>
      {isOverflowing && (
        <style>{`
          @keyframes marqueeScroll {
            from { transform: translateX(0); }
            to { transform: translateX(-${distance + 32}px); }
          }
        `}</style>
      )}
    </div>
  )
}

export default function HomePage({
  name,
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
  latestOrder,
}: HomePageProps) {
  const buyFormRef = useRef<HTMLFormElement>(null)
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingAutoSubmitUrl, setPendingAutoSubmitUrl] = useState<string | null>(null)
  // Single toggle for all three masked balances — one eye icon reveals or
  // re-hides Coupons/Points/Wallet together, rather than one eye per column.
  const [balancesVisible, setBalancesVisible] = useState(false)

  // Measures the height of the ENTIRE left column ("Hello" strip + "Buy
  // for me" hero + "My Orders") live, so "Stores for you" on the right
  // always spans it top to bottom — including if any block's content,
  // padding, or font size ever changes (the hook observes resizes, so
  // e.g. My Orders growing when an order loads is picked up too). Only
  // relevant at the `lg` breakpoint and up, since that's the only place
  // the Stores-for-you card renders at all — see its wrapper below. See
  // SuggestedStoresCard for how that height is consumed.
  const { ref: leftColumnRef, height: leftColumnHeight } = useElementHeight<HTMLDivElement>()

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

        The page is a two-column grid at `lg:` with exactly two cells:

          [ left column                    ][ Stores for you ]
          [   Hello + Buy for me           ][                 ]
          [   My Orders                    ][                 ]

        The LEFT COLUMN is a single wrapper (leftColumnRef) that stacks
        Hello + Buy for me on top of My Orders. That wrapper — not just
        the top block — is what gets measured, so "Stores for you" spans
        the full height of everything on the left.

        `lg:self-start` on the left wrapper is deliberate. Grid items
        stretch to the row height by default, and the row height is the
        taller of the two cells. If the left wrapper stretched, its
        measured height would include any extra height forced on it by
        the right card — so if the right card was ever taller than the
        left (stale measurement, window resized narrower, etc.) the left
        would stretch to match it, report that taller height back, and
        the card would never be able to shrink. Sizing the wrapper to
        its own content breaks that loop: the measurement is always the
        left column's natural height.

        Mobile (no lg:) is a single column: Hello/Buy-for-me → My Orders
        → Stores for you (as a horizontal-scroll strip, MobileStoresStrip,
        rather than the height-matched right-rail card used on desktop).

        DESIGN PASS: the greeting + stat row is no longer its own bordered
        card — it now sits directly on the parchment as a plain strip, so
        the page doesn't open with a wall of identical white boxes. "Buy
        for me" (the actual core action of this product) is now the one
        card with real visual weight: an indigo panel with a gold accent,
        instead of matching the same card/border/radius treatment as
        every other block. My Orders keeps the card treatment but picks
        up a thin gold top edge, echoing a ticket/receipt stub rather than
        a generic dashboard tile.
      */}
      <div className="grid gap-3 gap-x-8 lg:grid-cols-[minmax(0,1fr)_330px] z-0 mt-2">
        {/* Left column: Hello + Buy for me, then My Orders (+ the mobile
            stores strip). Measured as a whole so Stores for you can match
            its full height on desktop. */}
        <div ref={leftColumnRef} className="flex min-w-0 flex-col gap-3 lg:self-start">
          {/* Hello + Buy for me */}
          <div className="flex min-w-0 flex-col gap-5">
            <div className="motion-safe:[animation:fadeUp_0.35s_ease-out_both]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl text-ink sm:text-3xl">
                    Hello, {name?.trim() || 'there'}
                  </h1>
                </div>
                <div className="flex shrink-0 items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setBalancesVisible((prev) => !prev)}
                    aria-label={balancesVisible ? 'Hide balances' : 'Show balances'}
                    className="rounded-lg hidden p-1.5 text-ink/35 transition-colors hover:text-ink/60"
                  >
                    {balancesVisible ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                  </button>
                  <button
                    type="button"
                    onClick={onViewProfile}
                    className="flex hidden items-center gap-1 whitespace-nowrap text-xs font-semibold text-ink/55 hover:text-teal-deep"
                  >
                    My Profile <ChevronRight size={13} />
                  </button>
                </div>
              </div>

              {/* Coupons / Points / Wallet are masked balances by default
                  (shown as "***"); the eye button toggles all three visible
                  at once. Gift Card is an icon-only shortcut with no value.
                  Unboxed and separated by hairline dividers instead of a
                  card edge, so it reads as part of the greeting rather than
                  a fourth identical tile. */}
              <div className="mt-6 flex hidden items-stretch justify-between divide-x divide-ink/10 border-y border-ink/10">
                <MaskedStatColumn label="Coupons" value={couponsCount} visible={balancesVisible} onClick={onViewCoupons} />
                <MaskedStatColumn label="Points" value={pointsBalance} visible={balancesVisible} onClick={onViewPoints} />
                <MaskedStatColumn label="Wallet" value={walletBalance} visible={balancesVisible} onClick={onViewWallet} />
                <IconOnlyColumn label="Gift Card" onClick={onViewGiftCard} icon={Gift} />
              </div>
            </div>

            {/* Buy for me — the one hero moment on the page. Indigo instead
                of the shared card white, a gold top edge instead of a
                border, and a larger icon treatment, so it visibly outranks
                the surrounding cards rather than matching their weight. */}
            <form
              ref={buyFormRef}
              onSubmit={handleFormSubmit}
              className="relative flex flex-col gap-5 overflow-hidden rounded-[28px] bg-indigo p-7 motion-safe:[animation:fadeUp_0.4s_ease-out_both] sm:p-8"
              style={{ animationDelay: '120ms' }}
            >
              <div className="absolute inset-x-0 top-0 h-[3px] bg-gold" aria-hidden="true" />
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold" aria-hidden="true">
                  <Package size={22} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1 pr-1">
                  <p className="font-display text-lg text-white">Buy for me</p>
                  <MarqueeText
                    text="Paste a link to any product, from any store, and we'll buy, quality-check, and deliver it to you."
                    className="mt-1 text-sm text-parchment/65"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                {/* FIX: this was previously `overflow-x-auto` + `text-center`
                    with the scrollbar hidden, which shows whatever the
                    textarea's current horizontal scroll position happens to
                    land on and hard-clips the rest with no visual cue —
                    that's the "cut off mid-word" look on narrow (mobile)
                    widths. Swapped to `overflow-hidden` + `truncate` so long
                    input always ends in a clean ellipsis, and to
                    `text-left` so the visible text starts from the
                    beginning rather than the middle. The placeholder is
                    also shortened (dropped the "(e.g. https://...)" example)
                    so it fits without truncating on small screens in the
                    common, unfocused case. Browsers still auto-scroll the
                    caret into view while actively typing, so this doesn't
                    hurt real usage — it only changes how overflow *looks*. */}
                <textarea
                  value={link}
                  onChange={(event) => setLink(event.target.value.replace(/\n/g, ''))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault()
                  }}
                  placeholder="Paste product link here"
                  rows={1}
                  wrap="off"
                  className="h-[50px] flex-1 resize-none overflow-hidden truncate whitespace-nowrap rounded-xl border border-white/15 bg-white/[0.07] px-3.5 py-3.5 text-left text-sm leading-[1.2] text-white outline-none transition-all duration-200 placeholder:text-white/35 focus:border-gold/50 focus:bg-white/[0.1] focus:ring-2 focus:ring-gold/30"
                />
                <button
                  type="submit"
                  disabled={!link.trim()}
                  className="group flex items-center justify-center gap-2 rounded-xl bg-teal px-5 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-teal-deep hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 disabled:active:scale-100 sm:flex-none"
                >
                  <Plus size={18} className="transition-transform duration-200 group-hover:rotate-90" />
                  Add request
                </button>
              </div>
            </form>
          </div>

          {/* My Orders — now its own component (components/dashboard/MyOrdersCard.tsx).
              See the comment on `latestOrder` above in HomePageProps if this
              isn't showing an order: the caller of <HomePage /> must pass
              the new `latestOrder` object, not the old `latestOrderStatus`
              string. */}
          <MyOrdersCard onViewOrders={onViewOrders} latestOrder={latestOrder} />

          {/* Mobile-only stores strip, directly under My Orders — this is
              the mobile equivalent of the desktop "Stores for you" right
              rail (see SuggestedStoresCard), collapsed into a single
              horizontal-scroll row since there's no left column height to
              match against below `lg`. Hidden at `lg:` and up, where the
              full-height SuggestedStoresCard in the right column takes
              over instead. */}
          <MobileStoresStrip onBrowseStores={onBrowseStores} />
        </div>

        {/* Stores for you — hidden on mobile entirely (not just visually
            collapsed): its whole row-fitting logic depends on matching
            leftColumnHeight, which is a desktop-only concept, so there's
            nothing useful for it to do below `lg`. Desktop: right column,
            spanning the full height of the left column (Hello + Buy for
            me + My Orders). */}
        <div
          className="hidden min-w-0 motion-safe:[animation:fadeUp_0.4s_ease-out_both] lg:order-2 lg:block"
          style={{ animationDelay: '60ms' }}
        >
          <SuggestedStoresCard targetHeight={leftColumnHeight} onBrowseStores={onBrowseStores} />
        </div>
      </div>
    </div>
  )
}