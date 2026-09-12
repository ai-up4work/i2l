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
import { INNER_H } from "@/components/shared/headerMetrics"
import { AIRMAIL_STRIPE_HEIGHT } from "@/components/shared/AirmailStripe"
import { OPEN_SHOP_EVENT } from "@/components/shared/Header"

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
const featuredLocalStores = affiliatedStores
  .filter((s) => s.storeType === "local")
  .slice(0, 24)

const PANEL_TOP = AIRMAIL_STRIPE_HEIGHT + INNER_H
const PEEK_HEIGHT = 8

const DESKTOP_BREAKPOINT_QUERY = "(min-width: 1024px)"

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
  const href = store.url ?? `/stores/${store.platform}`
  const isExternal = Boolean(store.url)

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

export function ShopMegaMenuPanel({ isActive }: { isActive: boolean }) {
  const [mounted, setMounted] = useState(false)
  const isDesktop = useIsDesktopNav()
  useEffect(() => setMounted(true), [])
  if (!mounted || !isDesktop) return null

  return createPortal(
    <div
      id="shop-mega-menu-panel"
      className="pointer-events-none fixed inset-x-0 z-40 hidden [perspective:2200px] lg:block"
      style={{ top: PANEL_TOP }}
    >
      {/* Always-visible peek strip — the envelope-flap edge cue. Unlike
          before, this is now a REAL click target: it opts itself back
          into pointer-events (overriding the outer wrapper's
          pointer-events-none) and dispatches the same OPEN_SHOP_EVENT
          that Header.tsx already listens for elsewhere, so clicking the
          visible sliver behaves exactly like clicking the Shop trigger
          itself — no duplicated open/close state needed here.
          `hidden` while the panel is open (isActive) so it doesn't sit
          uselessly on top of the now-open panel intercepting clicks
          meant for the categories/stores beneath it. */}
      <button
        type="button"
        aria-label="Open shop menu"
        onClick={() => window.dispatchEvent(new Event(OPEN_SHOP_EVENT))}
        className={`absolute inset-x-0 top-0 block w-full cursor-pointer border-b border-teal/20 bg-parchment shadow-sm shadow-ink/10 transition-opacity duration-150 hover:bg-gold/5 pointer-events-auto ${
          isActive ? "invisible" : "visible"
        }`}
        style={{ height: PEEK_HEIGHT }}
      />

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

          {/* Affiliated stores */}
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