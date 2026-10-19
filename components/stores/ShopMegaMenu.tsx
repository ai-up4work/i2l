"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  ChevronRight,
  Link2,
  Search,
} from "lucide-react"
import { useAffiliatedStores } from "@/hooks/useAffiliatedStores"
import { STORE_CATEGORIES } from "@/lib/store-categories"
import CategoryImage from "@/components/shared/CategoryImage"
import { followedFirst, useFollowedStores } from "@/hooks/useFollowedStores"
import type { AffiliatedStore } from "@/data/stores/data"
import Flag from "@/components/ui/Flag"
import { INNER_H } from "@/components/shared/headerMetrics"
import { AIRMAIL_STRIPE_HEIGHT } from "@/components/shared/AirmailStripe"

// Category links open /categories filtered to that category (stores are
// matched on their saved `categories`). The list itself lives in
// lib/store-categories.ts so the header, the landing page, the
// /categories page and the store forms always agree. The menu lists every
// category (two columns of photo tiles); "All categories" opens /categories.
const menuCategories = STORE_CATEGORIES

// marketplaceStores/featuredLocalStores are now computed inside each of
// ShopMegaMenuPanel/ShopMegaMenuMobile below (via useAffiliatedStores()),
// since they depend on a real fetch instead of a static import.

// The panel's hinge sits at the bottom edge of the NARROW middle strip
// of the header (INNER_H) — that's the seam the "Shop" trigger actually
// sits against, and the seam the notch's diagonal lines converge into.
// It is NOT OUTER_H (the thick side wings): anchoring to OUTER_H put the
// hinge below the visible notch line, so the panel looked like it was
// dropping from empty space instead of unfolding out of the header
// itself. We also add AIRMAIL_STRIPE_HEIGHT because the header bar is
// pushed down by that stripe — it isn't sitting at viewport y=0 — so the
// real on-screen y-position of the notch's bottom edge is the stripe's
// height plus INNER_H, not INNER_H alone.
const PANEL_TOP = AIRMAIL_STRIPE_HEIGHT + INNER_H

// Must match the `lg` breakpoint used everywhere else in the header
// (Tailwind's default lg = 1024px). The mega menu is a desktop-only
// portal — see the `useIsDesktopNav` note on ShopMegaMenuPanel below for
// why this needs to be enforced in JS, not just via CSS classes.
const DESKTOP_BREAKPOINT_QUERY = "(min-width: 1024px)"

/** Small gold spark used only for delight moments — new-store callouts. */
function Spark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2 L14 9.5 L21.5 12 L14 14.5 L12 22 L10 14.5 L2.5 12 L10 9.5 Z"
        fill="currentColor"
      />
    </svg>
  )
}

function StoreRow({ store }: { store: AffiliatedStore }) {
  const isLocal = store.storeType === "local"
  // Route by storeType, not just presence of `url` — some local store
  // records may still have a `url` field populated, but local sellers
  // always live on our internal /stores/[platform] page. Only real
  // marketplaces (Amazon, Flipkart, etc.) send clicks out to their site.
  const isExternal = !isLocal && Boolean(store.url)
  const href = isExternal ? store.url! : `/stores/${store.platform}`
  return (
    <a
      href={href}
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-teal/10"
    >
      <span
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden border border-ink/10 bg-card ${
          isLocal ? "rounded-lg" : "rounded-full"
        }`}
        style={isLocal ? store.bannerStyle : undefined}
      >
        {isLocal ? (
          // eslint-disable-next-line @next/next/no-img-element -- fixed square tile, plain img keeps this simple
          <img src={store.logo} alt="" className="h-full w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- fixed circle, logo centered regardless of its own aspect ratio
          <img src={store.logo} alt="" className="h-full w-full object-contain" />
        )}
        {store.isNew && (
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center text-gold">
            <Spark className="h-3.5 w-3.5" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-medium font-body text-ink">
        {store.origin !== 'LK' && <Flag flag={store.flag} />}
        <span className="truncate">{store.name}</span>
      </span>
    </a>
  )
}

/**
 * Tracks whether the viewport is currently at/above the `lg` breakpoint.
 *
 * Why this exists: `ShopMegaMenuPanel` is portaled to `document.body`
 * (see the big comment on that component), which means the `hidden
 * lg:flex` wrapper around it in Header.tsx has NO effect on it — that
 * wrapper isn't an ancestor of the portaled DOM node anymore. Without
 * this hook, the panel could still mount/show on mobile viewports
 * whenever `isActive` is true, colliding with (and rendering on top of)
 * the mobile ShopBottomSheet. This hook lets the panel bail out of
 * rendering entirely below `lg`, regardless of `isActive`.
 */
function useIsDesktopNav() {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_BREAKPOINT_QUERY)
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return isDesktop
}

/**
 * Desktop dropdown panel — categories on the left, affiliated stores on
 * the right. Spans the full viewport width and opens like an envelope
 * flap unfolding out from behind the header:
 *
 * - z-40, one below the header's z-50, so the header bar visually sits
 *   ON TOP of the panel rather than the panel sliding down over it — the
 *   flap reads as tucked behind the header at rest.
 * - The hinge is the panel's own top edge, pinned to PANEL_TOP (the
 *   bottom edge of the header's narrow/INNER_H strip, offset by the
 *   airmail stripe) via `top`, NOT via a `translateY` inside the
 *   transform — keeping the positional offset out of the transform
 *   composition means `rotateX` pivots cleanly around that hinge line
 *   instead of interacting unpredictably with a translate in the same
 *   transform string.
 * - `perspective` on the outer wrapper + `rotateX` + `transform-origin:
 *   top` on the inner panel gives the 3D "flap falling open" motion,
 *   closed at -100deg (folded back, hidden behind the header) and open
 *   at 0deg (lying flat).
 *
 * Rendered via a portal into document.body: Header.tsx's desktop nav
 * wrapper has `-translate-x-1/2` on it to center the nav links, and any
 * CSS `transform` on an ancestor becomes the containing block for
 * descendant `fixed` elements — without the portal, this panel would get
 * trapped inside that narrow, off-center nav wrapper instead of spanning
 * the real viewport. Portaling to document.body escapes that ancestor
 * entirely so `fixed` (and the hinge math above) behaves as intended.
 *
 * IMPORTANT (mobile guard): because the portal escapes to document.body,
 * `hidden lg:flex` on the parent wrapper in Header.tsx does nothing to
 * this component. Desktop-only visibility is enforced two ways instead:
 * (1) `useIsDesktopNav()` bails out to `null` — no portal is even
 * created — below the `lg` breakpoint, and (2) `hidden lg:block` is
 * applied directly on the portaled node as a CSS backstop. Both must
 * stay in place, or this panel can render on top of the mobile
 * ShopBottomSheet.
 *
 * `id="shop-mega-menu-panel"` on the portaled root: Header.tsx opens/
 * closes this panel on click now (not hover), and closes it again on any
 * outside click. Because this node lives in document.body rather than
 * inside Header's own <nav>, Header's click-outside listener can't rely
 * on DOM containment within a ref — it instead looks up this element by
 * id and treats clicks inside it as "inside", so clicking a category or
 * store link doesn't get mistaken for an outside click. Keep this id in
 * sync with `SHOP_PANEL_ID` in Header.tsx if either ever changes.
 *
 * POINTER-EVENTS: the outer portaled wrapper below is `pointer-events-
 * none` unconditionally. A `rotateX` transform on the inner panel is a
 * paint-time effect only — it does NOT remove the inner panel from
 * normal layout flow, so even while folded shut (`rotateX(-100deg)`,
 * `invisible`) the inner panel still occupies its full untransformed
 * box (categories column + up to 480px of store grid). Without
 * `pointer-events-none` on this outer wrapper, that full-width,
 * full-height, fully transparent box sits `fixed` over the page at all
 * times and silently swallows clicks on whatever real content is
 * underneath it — the menu never has to be open for that to happen.
 * The inner panel re-enables `pointer-events-auto` for itself only in
 * the `isActive` branch, since `pointer-events` is inherited and would
 * otherwise be `none` for the open panel's own contents too.
 *
 * HOVER-CLOSE FIX: Header.tsx's notch trigger arms a short close-timer
 * on mouseleave (`handleNotchMouseLeave`) so the menu auto-closes when
 * you stop hovering the trigger. But because this panel lives in a
 * *different* DOM subtree (the portal) than that trigger, moving your
 * mouse from the trigger down into the panel to click a category/store
 * link ALSO fires the trigger's mouseleave — arming the close timer —
 * with nothing in the panel to cancel it. The panel would then vanish
 * (invisible + pointer-events-none) out from under the cursor before
 * the click landed. `onMouseEnter`/`onMouseLeave` are accepted as props
 * here and wired onto the actual pointer-events-auto inner panel (NOT
 * the outer pointer-events-none wrapper, which never receives mouse
 * events) so hovering the panel itself keeps cancelling that timer, the
 * same way hovering the trigger does.
 *
 * CLICK-BUBBLING FIX: this panel is portaled to document.body, but
 * React's *synthetic* event system dispatches according to the React
 * component tree, not the DOM tree — so a click on a StoreRow/category
 * link here still bubbles (in React terms) up through this component's
 * actual JSX parent in Header.tsx, which is the notch trigger div with
 * `onClick={handleNotchClick}`. That handler calls `e.preventDefault()`
 * (killing the link's navigation) and toggles `activeDesktopMenu` closed
 * (since the menu was already open) — so clicking a store/category used
 * to close the menu instead of navigating. `onClick={(e) =>
 * e.stopPropagation()}` on the inner pointer-events-auto panel below
 * stops the synthetic event right here, before it can reach
 * handleNotchClick, while leaving the link's own native navigation (and
 * the outside-click / Escape handling in Header.tsx, which reads real
 * DOM containment via getElementById(SHOP_PANEL_ID) rather than React
 * bubbling) completely unaffected.
 */
export function ShopMegaMenuPanel({
  isActive,
  onMouseEnter,
  onMouseLeave,
}: {
  isActive: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const isDesktop = useIsDesktopNav()
  const { stores } = useAffiliatedStores()
  const marketplaceStores = useMemo(() => stores.filter((s) => s.storeType === "marketplace"), [stores])
  // FIX: split out full local-store list from the capped preview grid,
  // so the "Browse all N" link below can count only real local sellers
  // instead of marketplaces + local combined (which is what
  // stores.length was doing before, e.g. 11 marketplaces + 4 local = 15
  // shown as "affiliated stores" even though only 4 are actually local).
  const localStores = useMemo(() => stores.filter((s) => s.storeType === "local"), [stores])
  // Preview of local stores in the mega menu — shows all local stores
  // (not filtered to `isNew` only), capped at 24 so the panel stays a
  // preview rather than a full duplicate of /stores. Capped separately
  // from `localStores` above so the "Browse all N" count doesn't freeze
  // at 24 once there are more than 24 real local sellers.
  const featuredLocalStores = useMemo(() => localStores.slice(0, 24), [localStores])
  useEffect(() => setMounted(true), [])
  if (!mounted || !isDesktop) return null

  return createPortal(
    <div
      id="shop-mega-menu-panel"
      className="pointer-events-none fixed inset-x-0 z-40 hidden [perspective:2200px] lg:block"
      style={{ top: PANEL_TOP }}
    >
      <div
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        // FIX: see the CLICK-BUBBLING FIX comment above this component
        // — without this, clicking any link inside the panel bubbled (in
        // React's synthetic-event tree) up to Header.tsx's notch
        // onClick handler, which preventDefault()'d the navigation and
        // toggled the menu shut instead.
        onClick={(e) => e.stopPropagation()}
        className={`origin-top border-b border-teal/20 bg-parchment shadow-2xl shadow-ink/25 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isActive
            ? "pointer-events-auto visible [transform:rotateX(0deg)] opacity-100"
            : "pointer-events-none invisible [transform:rotateX(-100deg)] opacity-0"
        }`}
      >
        <div className="mx-auto grid w-full max-w-[1600px] grid-cols-[minmax(0,420px)_1px_minmax(0,1fr)] px-4 xl:grid-cols-[minmax(0,500px)_1px_minmax(0,1fr)]">
          {/* Categories — every category, as photo tiles in two columns,
              with a button to the full /categories page underneath. */}
          <div className="p-4">
            <div className="px-1 pb-3 pt-4 text-xs font-semibold uppercase tracking-wider text-ink/40 font-body">
              Shop by category
            </div>
            <div className="grid grid-cols-2 gap-2">
              {menuCategories.map((category) => (
                <a
                  key={category.slug}
                  href={`/categories?category=${category.slug}`}
                  className="group flex min-w-0 items-center gap-2.5 rounded-xl p-1.5 pr-2 ring-1 ring-ink/[0.06] transition-colors duration-150 hover:bg-teal/10 hover:ring-teal/25"
                >
                  <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-ink/5">
                    <CategoryImage
                      category={category}
                      className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-105"
                      iconClassName="h-4 w-4"
                    />
                  </span>
                  <span className="min-w-0 text-[13px] font-medium leading-tight font-body text-ink">{category.name}</span>
                </a>
              ))}
            </div>
            <a
              href="/categories"
              className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-indigo px-4 py-2.5 text-sm font-semibold font-body text-parchment transition-colors duration-150 hover:bg-teal-deep"
            >
              All categories
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </a>
          </div>

          {/* Divider */}
          <div className="bg-teal/15" />

          {/* Affiliated stores — fixed 4-column grid. Auto-fill was tried
              here (packing by min tile width) but at this panel's full
              width it fit 6 columns, which squeezed store names down to
              truncated ellipses ("Santhiya Fas…"). A flat grid-cols-4
              gives each tile enough width for full names, at the cost of
              some empty space when a row isn't full (e.g. the last row
              of Affiliated Stores) — an acceptable trade for readable
              names. */}
          <div className="max-h-[480px] overflow-y-auto nav-scroll p-4 mt-8">
            <div className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-ink/40 font-body">
              Marketplaces
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 xl:grid-cols-3 2xl:grid-cols-4">
              {marketplaceStores.slice(0, 8).map((store) => (
                <StoreRow key={store.platform} store={store} />
              ))}
            </div>

            <div className="px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-ink/40 font-body">
              Affiliated Stores
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 xl:grid-cols-3 2xl:grid-cols-4">
              {featuredLocalStores.map((store) => (
                <StoreRow key={store.platform} store={store} />
              ))}
            </div>

            <a
              href="/stores"
              className="mt-2 block rounded-xl px-3 py-2.5 text-sm font-semibold font-body text-teal-deep transition-colors duration-150 hover:bg-teal/10"
            >
              {/* FIX: was {stores.length} (marketplaces + local combined) */}
              Browse all {localStores.length} affiliated stores →
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** Mobile accordion body — same two groups, stacked instead of side by side. */
/** Square logo tile for the phone sheet: logo on top, name below. */
function SheetStoreTile({ store, followed }: { store: AffiliatedStore; followed?: boolean }) {
  const isLocal = store.storeType === "local"
  const isExternal = !isLocal && Boolean(store.url)
  const href = isExternal ? store.url! : `/stores/${store.platform}`
  return (
    <a
      href={href}
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="group flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center transition-colors active:bg-teal/10"
    >
      <span
        className={`relative grid h-14 w-14 place-items-center overflow-hidden bg-card shadow-[0_2px_8px_-2px_rgba(32,36,43,0.15)] ring-1 transition-transform duration-150 group-active:scale-95 ${
          isLocal ? "rounded-2xl" : "rounded-full"
        } ${followed ? "ring-2 ring-teal" : "ring-ink/10"}`}
        style={isLocal ? store.bannerStyle : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={store.logo} alt="" className={`h-full w-full ${isLocal ? "object-cover" : "object-contain p-1.5"}`} />
      </span>
      <span className="w-full truncate font-body text-[11px] font-medium text-ink/80">{store.name}</span>
      {followed ? (
        <span className="-mt-1 font-body text-[9px] font-bold uppercase tracking-wider text-teal-deep">Following</span>
      ) : store.isNew ? (
        <span className="-mt-1 font-body text-[9px] font-bold uppercase tracking-wider text-gold-deep">New</span>
      ) : null}
    </a>
  )
}

function SheetHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pb-2 pt-5">
      <h3 className="font-body text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45">{children}</h3>
      {action}
    </div>
  )
}

/**
 * The phone "Shop" sheet (ShopBottomSheet): paste-a-link, search, stores
 * the shopper follows, categories, affiliated stores and marketplaces.
 * `onAddRequest` shows the "Buy with a link" card (opens the request form).
 */
export function ShopMegaMenuMobile({ onAddRequest }: { onAddRequest?: () => void } = {}) {
  const { stores, loading } = useAffiliatedStores()
  const { followedAt } = useFollowedStores()
  const [q, setQ] = useState("")
  const marketplaceStores = useMemo(() => stores.filter((s) => s.storeType === "marketplace"), [stores])
  const localStores = useMemo(() => stores.filter((s) => s.storeType === "local"), [stores])
  const followed = useMemo(
    () => followedFirst(localStores.filter((s) => followedAt.has(s.platform)), (s) => s.platform, followedAt),
    [localStores, followedAt],
  )
  const term = q.trim().toLowerCase()
  const matches = useMemo(
    () => (term ? stores.filter((s) => s.name.toLowerCase().includes(term) || s.categories?.some((c) => c.toLowerCase().includes(term))) : []),
    [stores, term],
  )
  const featured = useMemo(
    () => [...localStores.filter((s) => s.isNew && !followedAt.has(s.platform)), ...localStores.filter((s) => !s.isNew && !followedAt.has(s.platform))].slice(0, 12),
    [localStores, followedAt],
  )

  return (
    <div className="pb-2">
      {/* Search */}
      <div className="px-5 pt-1">
        <label className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 ring-1 ring-ink/10 focus-within:ring-2 focus-within:ring-teal/40">
          <Search className="h-4 w-4 flex-none text-ink/40" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search stores or categories"
            className="w-full bg-transparent font-body text-sm text-ink outline-none placeholder:text-ink/40"
          />
        </label>
      </div>

      {term ? (
        <>
          <SheetHeading>{matches.length ? `${matches.length} found` : "No stores found"}</SheetHeading>
          <div className="grid grid-cols-4 gap-1 px-3">
            {matches.map((store) => (
              <SheetStoreTile key={store.platform} store={store} followed={followedAt.has(store.platform)} />
            ))}
          </div>
          {!matches.length && onAddRequest && (
            <p className="px-5 font-body text-sm text-ink/55">
              Can&rsquo;t find it? Paste the product link and we&rsquo;ll buy it for you.
            </p>
          )}
        </>
      ) : (
        <>
          {/* Buy with a link */}
          {onAddRequest && (
            <div className="px-5 pt-4">
              <button
                type="button"
                onClick={onAddRequest}
                className="relative flex w-full items-center gap-3 overflow-hidden rounded-2xl bg-indigo p-4 text-left transition-transform active:scale-[0.99]"
              >
                <span className="absolute inset-x-0 top-0 h-[3px] bg-gold" aria-hidden />
                <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-gold/15 text-gold">
                  <Link2 className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base text-white">Buy anything with a link</span>
                  <span className="block font-body text-xs text-parchment/65">Paste a product link from any store. We buy it and deliver it.</span>
                </span>
                <ChevronRight className="h-4 w-4 flex-none text-parchment/50" aria-hidden />
              </button>
            </div>
          )}

          {/* Stores you follow */}
          {followed.length > 0 && (
            <>
              <SheetHeading
                action={
                  <a href="/account/my-following" className="font-body text-xs font-semibold text-teal-deep">
                    Manage
                  </a>
                }
              >
                Stores you follow
              </SheetHeading>
              <div className="flex gap-1 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {followed.map((store) => (
                  <div key={store.platform} className="w-[22%] flex-none">
                    <SheetStoreTile store={store} followed />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Categories */}
          <SheetHeading
            action={
              <a href="/categories" className="font-body text-xs font-semibold text-teal-deep">
                See all
              </a>
            }
          >
            Shop by category
          </SheetHeading>
          <div className="grid grid-cols-3 gap-2 px-5">
            {menuCategories.map((category) => (
              <a
                key={category.slug}
                href={`/categories?category=${category.slug}`}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-card p-1.5 pb-2.5 text-center ring-1 ring-ink/8 transition-colors active:bg-teal/10"
              >
                <span className="relative aspect-square w-full overflow-hidden rounded-xl bg-ink/5">
                  <CategoryImage category={category} className="absolute inset-0 h-full w-full" iconClassName="h-5 w-5" />
                </span>
                <span className="line-clamp-2 w-full px-0.5 font-body text-[11px] font-medium leading-tight text-ink/80">{category.name}</span>
              </a>
            ))}
          </div>

          {/* Affiliated stores */}
          <SheetHeading
            action={
              <a href="/stores" className="font-body text-xs font-semibold text-teal-deep">
                See all
              </a>
            }
          >
            Affiliated stores
          </SheetHeading>
          <div className="grid grid-cols-4 gap-1 px-3">
            {loading && !featured.length
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5 py-2">
                    <span className="h-14 w-14 animate-pulse rounded-2xl bg-ink/8" />
                    <span className="h-2.5 w-10 animate-pulse rounded bg-ink/8" />
                  </div>
                ))
              : featured.map((store) => <SheetStoreTile key={store.platform} store={store} />)}
          </div>

          {/* Marketplaces */}
          {marketplaceStores.length > 0 && (
            <>
              <SheetHeading>Marketplaces</SheetHeading>
              <div className="flex gap-1 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {marketplaceStores.map((store) => (
                  <div key={store.platform} className="w-[22%] flex-none">
                    <SheetStoreTile store={store} />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="px-5 pt-5">
            <a
              href="/stores"
              className="flex items-center justify-center gap-1.5 rounded-full bg-teal py-3 font-body text-sm font-semibold text-white transition-colors active:bg-teal-deep"
            >
              Browse all {localStores.length || ""} stores <ChevronRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </>
      )}
    </div>
  )
}
