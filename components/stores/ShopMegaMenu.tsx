"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  Shirt,
  Layers,
  Gem,
  Smartphone,
  Sparkles,
  Baby,
  Heart,
  Package,
} from "lucide-react"
import { affiliatedStores, type AffiliatedStore } from "@/data/stores/data"
import Flag from "@/components/ui/Flag"

// Category chips link into /stores?category=<name>, filtering the same
// `categories[]` field on AffiliatedStore that the /stores browse page
// already reads. These 8 are real strings pulled straight from
// affiliatedStores — not an invented taxonomy — so a click always finds a
// non-empty result set. Add an icon here if a new category should surface
// in the header; anything else still lives on the /stores page itself.
const categoryIcons: { name: string; icon: typeof Shirt }[] = [
  { name: "Clothing", icon: Shirt },
  { name: "Ethnic Wear", icon: Layers },
  { name: "Jewellery", icon: Gem },
  { name: "Electronics", icon: Smartphone },
  { name: "Beauty", icon: Sparkles },
  { name: "Maternity Wear", icon: Baby },
  { name: "Handmade", icon: Heart },
  { name: "Collectibles", icon: Package },
]

const marketplaceStores = affiliatedStores.filter((s) => s.storeType === "marketplace")
// Preview of local stores in the mega menu — shows all local stores
// (not filtered to `isNew` only), capped at 24 so the panel stays a
// preview rather than a full duplicate of /stores. Raise this cap (or
// drop it) if the full local catalog should always fit without needing
// "Browse all".
const featuredLocalStores = affiliatedStores
  .filter((s) => s.storeType === "local")
  .slice(0, 24)

// Matches Header.tsx's OUTER_H — the panel's hinge sits at the bottom edge
// of the header bar. Kept as a local constant rather than imported so this
// file has no dependency on Header.tsx; update both if the header height
// ever changes.
const HEADER_H = 40

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
  // Local sellers already carry their own brand color as `bannerStyle`
  // (used on their store banner) — reuse it here so each logo sits on its
  // real brand ground instead of one flat tile color for every store.
  //
  // Local `/store-icon/*.png` files are square badges, often with
  // whitespace baked into the file — a fixed square tile with
  // `object-cover` fills edge-to-edge and is safe to crop since they're
  // square-on-square.
  //
  // Marketplace `/logos/*.png` files are circular badges per the brand
  // reference (white circle, logo centered with a little breathing room,
  // regardless of the logo's own aspect ratio) — fixed circle,
  // `object-contain` with padding so nothing gets cropped or stretched.
  const isLocal = store.storeType === "local"
  return (
    <a
      href={`/stores/${store.platform}`}
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
          <img src={store.logo} alt="" className="h-full w-full object-contain p-1" />
        )}
        {store.isNew && (
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center text-gold">
            <Spark className="h-3.5 w-3.5" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-medium font-body text-ink">
        <Flag flag={store.flag} />
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
 * - The hinge is the panel's own top edge, pinned to HEADER_H (the
 *   header's bottom edge) via `top`, NOT via a `translateY` inside the
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
 */
export function ShopMegaMenuPanel({ isActive }: { isActive: boolean }) {
  const [mounted, setMounted] = useState(false)
  const isDesktop = useIsDesktopNav()
  useEffect(() => setMounted(true), [])
  if (!mounted || !isDesktop) return null

  return createPortal(
    <div
      id="shop-mega-menu-panel"
      className="pointer-events-none fixed inset-x-0 z-40 hidden [perspective:2200px] lg:block"
      style={{ top: HEADER_H }}
    >
      <div
        className={`origin-top border-b border-teal/20 bg-parchment shadow-2xl shadow-ink/25 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isActive
            ? "pointer-events-auto visible [transform:rotateX(0deg)] opacity-100"
            : "pointer-events-none invisible [transform:rotateX(-100deg)] opacity-0"
        }`}
      >
        <div className="mx-auto grid w-full max-w-[1600px] grid-cols-[minmax(0,240px)_1px_minmax(0,1fr)] px-4">
          {/* Categories */}
          <div className="p-4">
            <div className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-ink/40 font-body">
              Shop by category
            </div>
            <div className="flex flex-col">
              {categoryIcons.map(({ name, icon: Icon }) => (
                <a
                  key={name}
                  href={`/stores?category=${encodeURIComponent(name)}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-teal/10"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal/10 text-teal-deep">
                    <Icon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <span className="text-sm font-medium font-body text-ink">{name}</span>
                </a>
              ))}
            </div>
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
            <div className="grid grid-cols-4 gap-x-2 gap-y-0.5">
              {marketplaceStores.map((store) => (
                <StoreRow key={store.platform} store={store} />
              ))}
            </div>

            <div className="px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-ink/40 font-body">
              Affiliated Stores
            </div>
            <div className="grid grid-cols-4 gap-x-2 gap-y-0.5">
              {featuredLocalStores.map((store) => (
                <StoreRow key={store.platform} store={store} />
              ))}
            </div>

            <a
              href="/stores"
              className="mt-2 block rounded-xl px-3 py-2.5 text-sm font-semibold font-body text-teal-deep transition-colors duration-150 hover:bg-teal/10"
            >
              Browse all {affiliatedStores.length} affiliated stores →
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** Mobile accordion body — same two groups, stacked instead of side by side. */
export function ShopMegaMenuMobile() {
  return (
    <div className="bg-teal/[0.06] px-2 pb-3">
      <div className="px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-ink/40 font-body">
        Shop by category
      </div>
      <div className="grid grid-cols-2 gap-1 px-2">
        {categoryIcons.map(({ name, icon: Icon }) => (
          <a
            key={name}
            href={`/stores?category=${encodeURIComponent(name)}`}
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 font-body"
          >
            <Icon className="h-4 w-4 shrink-0 text-teal-deep" strokeWidth={2} />
            <span className="text-sm font-medium text-ink">{name}</span>
          </a>
        ))}
      </div>

      <div className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-ink/40 font-body">
        Marketplaces
      </div>
      <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 px-2">
        {marketplaceStores.map((store) => (
          <StoreRow key={store.platform} store={store} />
        ))}
      </div>

      <div className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-ink/40 font-body">
        Affiliated Stores
      </div>
      <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 px-2">
        {featuredLocalStores.map((store) => (
          <StoreRow key={store.platform} store={store} />
        ))}
      </div>

      <a
        href="/stores"
        className="mx-2 mt-2 block rounded-xl px-3 py-2.5 text-sm font-semibold text-teal-deep font-body"
      >
        Browse all {affiliatedStores.length} affiliated stores →
      </a>
    </div>
  )
}