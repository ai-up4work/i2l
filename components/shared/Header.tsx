"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname } from "next/navigation"
import { ArrowLeft, LogIn, LogOut, Heart, ShoppingBag, UserPlus, ChevronDown } from "lucide-react"

import BrandMark from "@/components/shared/BrandMark"
import AirmailStripe, { AIRMAIL_STRIPE_HEIGHT } from "@/components/shared/AirmailStripe"
import { useAuth } from "@/contexts/AuthContext"
import { useCart } from "@/contexts/Cartcontext"
import { useWishlist } from "@/contexts/Wishlistcontext"
import { ShopMegaMenuPanel } from "@/components/stores/ShopMegaMenu"
import ShopBottomSheet from "@/components/stores/ShopBottomSheet"
import Image from "next/image"

interface NavItem { name: string; desc: string; href: string }
interface NavLink {
  href: string
  label: string
  items?: NavItem[]
  /** "Shop" renders ShopMegaMenuPanel on desktop; on mobile it's its own
   *  header-bar trigger (see the Shop button below), not part of this list. */
  megaMenu?: boolean
}

const navLinks: NavLink[] = [
  { href: "#shop", label: "Shop", megaMenu: true },
  { href: "#help", label: "Support", items: [
    { name: "How it works", desc: "Paste a link or pick a product — we buy, QC & ship it", href: "/how-it-works/" },
    { name: "Service notices", desc: "Warehouses updates & service alerts", href: "/blog/categories/notices/" },
    { name: "Help centres", desc: "Frequently asked questions by users", href: "https://help.buyandship.com.my/hc/en-my" },
  ]},
  { href: "#destinations", label: "Discovery", items: [
    { name: "Trending products", desc: "Based on what other users are buying", href: "/community/discover/recommended/" },
    { name: "Shopping guides", desc: "Step-by-step guides for buying from top brands", href: "/shopping-guides/" },
    { name: "Coupons", desc: "Save on service fees with promo codes", href: "/coupons/" },
  ]},
]

interface HeaderProps {
  /** Optional label shown on the mobile nav trigger. Falls back to "Menu". */
  title?: string
  showBackButton?: boolean
}

const OUTER_H = 68
const INNER_H = 54
const MOBILE_ANIM_MS = 280

/**
 * The header's TOTAL rendered height, including AirmailStripe which
 * renders above the OUTER_H bar inside this component. This is the
 * single source of truth for anyone reserving top-space for the fixed
 * header — other layouts (e.g. the account/dashboard shell, which places
 * its own content below this fixed header) MUST import this rather than
 * re-deriving or hardcoding a number, or the two will drift out of sync.
 */
export const HEADER_BAR_HEIGHT = OUTER_H + AIRMAIL_STRIPE_HEIGHT

// Shared event name so other parts of the page (e.g. the Hero CTA) can
// ask the header to open the Shop mega menu / bottom sheet without
// needing this component's internal state lifted or passed as props.
export const OPEN_SHOP_EVENT = "wishdrop:open-shop"

// Single source of truth for the mobile background so the collapsed header
// bar and the full-screen nav overlay never drift apart. It's a light
// (parchment) surface, so all mobile foreground content uses `ink` tones.
const MOBILE_BG = "bg-parchment"

// Shared styling for the pill-shaped icon buttons on the right of the bar.
const pillButtonClass =
  "flex items-center gap-2 rounded-lg border border-ink/15 bg-ink/5 px-3 py-1.5 text-ink transition-all duration-200 hover:bg-teal/10 hover:border-teal/40 hover:text-teal-deep lg:py-2"

/** Small numeric badge for the Cart/Wishlist pill buttons. Caps display at 99+. */
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-deep px-1 text-[10px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  )
}

export default function Header({ title, showBackButton = false }: HeaderProps) {
  const { isAuthenticated, login, logout } = useAuth()
  const cart = useCart()
  const wishlist = useWishlist()
  const [activeDesktopMenu, setActiveDesktopMenu] = useState<string | null>(null)
  const [navOpen, setNavOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [activeMobileMenu, setActiveMobileMenu] = useState<string | null>(null)
  const [shopSheetOpen, setShopSheetOpen] = useState(false)

  // Mobile nav links only — Shop lives on its own trigger in the bar,
  // so it's excluded here rather than rendered as an accordion item.
  const mobileNavLinks = navLinks.filter((link) => !link.megaMenu)

  const pathname = usePathname()

  // Desktop dropdowns (Shop / Support / Discovery) now open on click, not
  // hover — avoids any "opens just from moving the mouse near it" feel,
  // and sidesteps the whole class of phantom/stale-hover bugs that came
  // from the header persisting across route changes. `navRef` scopes the
  // click-outside listener below; `SHOP_PANEL_ID` lets that same listener
  // recognize clicks inside the Shop mega menu even though it's portaled
  // to `document.body` (outside `navRef`'s DOM subtree) — see
  // ShopMegaMenuPanel in ShopMegaMenu.tsx, which sets this id on its
  // portaled root.
  const navRef = useRef<HTMLElement>(null)
  const SHOP_PANEL_ID = "shop-mega-menu-panel"

  // Close any open dropdown on an outside click/tap, or Escape.
  useEffect(() => {
    if (!activeDesktopMenu) return
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node
      const insideNav = navRef.current?.contains(target)
      const insideShopPanel = document.getElementById(SHOP_PANEL_ID)?.contains(target)
      if (!insideNav && !insideShopPanel) setActiveDesktopMenu(null)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveDesktopMenu(null)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [activeDesktopMenu])

  // Closes any open dropdown on route change, so a menu never carries
  // over open from whatever page you navigated away from.
  useEffect(() => {
    setActiveDesktopMenu(null)
  }, [pathname])

  // Lets any component on the page (e.g. the Hero's secondary CTA) ask
  // the header to open the Shop panel — desktop gets the mega menu,
  // mobile/tablet gets the bottom sheet. Mirrors the lg breakpoint used
  // everywhere else in this component to decide which UI is active.
  useEffect(() => {
    function handleOpenShop() {
      if (typeof window === "undefined") return
      if (window.innerWidth >= 1024) {
        setActiveDesktopMenu((prev) => (prev === "#shop" ? null : "#shop"))
      } else {
        setShopSheetOpen(true)
      }
    }
    window.addEventListener(OPEN_SHOP_EVENT, handleOpenShop)
    return () => window.removeEventListener(OPEN_SHOP_EVENT, handleOpenShop)
  }, [])

  // Open/close choreography for the mobile overlay (mirrors the old
  // marketing header so the animation feel is identical everywhere).
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    if (navOpen) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    timeout = setTimeout(() => { setMounted(false); setActiveMobileMenu(null) }, MOBILE_ANIM_MS)
    return () => clearTimeout(timeout)
  }, [navOpen])

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [navOpen])

  const desktopClipPath =
    `polygon(0 0, 100% 0, 100% ${OUTER_H}px, calc(100% - 320px) ${OUTER_H}px, ` +
    `calc(100% - 360px) ${INNER_H}px, 360px ${INNER_H}px, 320px ${OUTER_H}px, 0 ${OUTER_H}px)`

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-50">
        {/* Stripe renders in normal flow, above the header bar's own positioning context. */}
        <AirmailStripe />

        <div className="relative w-full" style={{ height: OUTER_H }}>
          {/* Desktop background */}
          <div className="hidden lg:block absolute inset-0 pointer-events-none drop-shadow-[0_6px_14px_rgba(13,29,65,0.25)]">
            <div className="w-full h-full bg-parchment border-b border-teal/30" style={{ clipPath: desktopClipPath }} />
            <div className="absolute left-0 top-0 w-1/2 h-full overflow-hidden pointer-events-none z-10">
              <svg className="absolute left-0 top-0 w-[2000px] h-full" xmlns="http://www.w3.org/2000/svg">
                <path d={`M 0 ${OUTER_H} L 320 ${OUTER_H} L 360 ${INNER_H} L 2000 ${INNER_H}`} stroke="rgba(14, 140, 156, 0.5)" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
            <div className="absolute right-0 top-0 w-1/2 h-full overflow-hidden pointer-events-none z-10" style={{ transform: "scaleX(-1)" }}>
              <svg className="absolute left-0 top-0 w-[2000px] h-full" xmlns="http://www.w3.org/2000/svg">
                <path d={`M 0 ${OUTER_H} L 320 ${OUTER_H} L 360 ${INNER_H} L 2000 ${INNER_H}`} stroke="rgba(14, 140, 156, 0.5)" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
          </div>

          {/* Mobile background — shares MOBILE_BG with the overlay below */}
          <div className={`lg:hidden absolute inset-0 ${MOBILE_BG} shadow-[0_1px_0_0_rgba(14,140,156,0.3),0_6px_18px_-10px_rgba(13,29,65,0.5)]`} />

          <div className="relative z-10 container mx-auto px-4 flex items-center justify-between w-full max-w-[1600px] h-full">
            {/* Left — vertically centered in OUTER_H (the thick strip) */}
            <div className="flex items-center gap-3 flex-shrink-0 z-20 pr-3 h-full">
              {showBackButton ? (
                <button type="button" aria-label="Go back" className={pillButtonClass}>
                  <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5" />
                  <span className="hidden sm:inline text-sm font-semibold font-body">BACK</span>
                </button>
              ) : (
                <div className="flex items-center cursor-pointer group min-w-0">
                  <BrandMark className="h-8 w-32 lg:h-9 lg:w-36" />
                </div>
              )}
            </div>

            {/* Desktop nav — vertically centered in the thin INNER_H notch */}
            <div className="hidden lg:flex items-center justify-center min-w-0 px-5 absolute left-1/2 top-0 -translate-x-1/2 z-20" style={{ height: INNER_H }}>
              <nav ref={navRef} className="flex items-center gap-6 -mt-2" aria-label="Primary navigation">
                {navLinks.map((link) => {
                  const isActive = activeDesktopMenu === link.href
                  const hasDropdown = link.megaMenu || !!link.items
                  return (
                    <div key={link.href} className="relative h-full flex items-center">
                    <a  
                        href={link.href}
                        aria-expanded={hasDropdown ? isActive : undefined}
                        className="group relative flex items-center gap-1 text-sm font-semibold font-body tracking-wide text-ink/85 transition-colors duration-200 hover:text-teal-deep"
                        onClick={(e) => {
                          if (!hasDropdown) return
                          e.preventDefault()
                          setActiveDesktopMenu((prev) => (prev === link.href ? null : link.href))
                        }}
                      >
                        {link.label}
                        {hasDropdown && (
                          <ChevronDown size={13} className={`text-ink/40 transition-transform duration-200 group-hover:text-teal-deep ${isActive ? "-rotate-180" : ""}`} />
                        )}
                        <span className={`absolute -bottom-1.5 left-0 h-[1.5px] w-full origin-center scale-x-0 bg-teal transition-transform duration-200 ease-out ${isActive ? "scale-x-100" : "group-hover:scale-x-100"}`} />
                      </a>

                      {link.megaMenu && <ShopMegaMenuPanel isActive={isActive} />}

                      {link.items && (
                        <div className={`absolute left-1/2 top-full z-50 w-80 -translate-x-1/2 pt-3 transition-all duration-200 ease-out ${isActive ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}>
                          <div className="rounded-2xl border border-teal/20 bg-parchment p-2 shadow-xl shadow-ink/10">
                            {link.items.map((item, i) => (
                              <a key={item.name} href={item.href} className="block rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-teal/10" style={{ transitionDelay: isActive ? `${i * 25}ms` : "0ms" }}>
                                <div className="text-sm font-semibold font-body text-ink">{item.name}</div>
                                <div className="mt-0.5 text-xs text-ink/55 font-body">{item.desc}</div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </nav>
            </div>

            {/* Mobile trigger group — Shop, Menu, and the auth action live together,
                right-aligned, so there's no dead space between them. Shop is its own
                always-visible trigger (opens ShopBottomSheet directly) rather than
                being nested inside the hamburger menu. */}
            <div className="flex lg:hidden flex-1 items-center justify-end gap-2 h-full">
              <button
                type="button"
                aria-label="Shop"
                onClick={() => setShopSheetOpen(true)}
                className={pillButtonClass}
              >
                <span className="font-display text-sm font-semibold tracking-wide">Shop</span>
              </button>

              <button type="button" aria-label={navOpen ? "Close menu" : "Open menu"} aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}
                className={`group flex items-center gap-2.5 rounded-full border px-4 py-2 transition-all duration-300 active:scale-95 ${
                  navOpen ? "bg-teal/10 border-teal/50 text-teal-deep" : "bg-ink/5 border-ink/15 text-ink hover:bg-teal/10 hover:border-teal/40 hover:text-teal-deep"
                }`}>
                <span className="font-display text-sm font-semibold tracking-wide">{title ?? "Menu"}</span>
                <span className="relative flex h-4 w-5 items-center justify-center">
                  <span className={`absolute h-[1.5px] w-5 rounded-full bg-current transition-all duration-300 ease-out ${navOpen ? "rotate-45" : "-translate-y-[5px]"}`} />
                  <span className={`absolute h-[1.5px] w-5 rounded-full bg-current transition-all duration-200 ease-out ${navOpen ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100"}`} />
                  <span className={`absolute h-[1.5px] w-5 rounded-full bg-current transition-all duration-300 ease-out ${navOpen ? "-rotate-45" : "translate-y-[5px]"}`} />
                </span>
              </button>
            </div>

            {/* Right — desktop only, vertically centered in OUTER_H.
                The old avatar + name + email button is gone from here —
                Cart and Wishlist are what a returning shopper actually
                wants one click away, so they get the prime spot instead.
                Account access still exists (via the mobile menu / a
                dedicated account link elsewhere); this bar's job now is
                "where's my stuff", not "who am I". */}
            <div className="hidden lg:flex items-center justify-end gap-3 flex-shrink-0 z-20 pl-2 h-full">
              <button
                type="button"
                aria-label="Wishlist"
                title="Wishlist"
                onClick={() => { window.location.href = "/wishlist" }}
                className={`relative ${pillButtonClass} lg:px-3`}
              >
                <Heart className="w-4 h-4 lg:w-[18px] lg:h-[18px]" />
                <span className="hidden sm:inline text-[11px] lg:text-[13px] font-semibold tracking-wider">WISHLIST</span>
                <CountBadge count={wishlist.count} />
              </button>

              <button
                type="button"
                aria-label="Cart"
                title="Cart"
                onClick={() => { window.location.href = "/cart" }}
                className={`relative ${pillButtonClass} lg:px-3`}
              >
                <ShoppingBag className="w-4 h-4 lg:w-[18px] lg:h-[18px]" />
                <span className="hidden sm:inline text-[11px] lg:text-[13px] font-semibold tracking-wider">CART</span>
                <CountBadge count={cart.itemCount} />
              </button>

              {isAuthenticated ? (
                <button type="button" aria-label="Log out" title="Logout" onClick={logout} className={`group ${pillButtonClass} lg:px-4`}>
                  <LogOut className="w-4 h-4 lg:w-[18px] lg:h-[18px] transition-transform duration-300 group-hover:-translate-x-0.5" />
                  <span className="hidden sm:inline text-[11px] lg:text-[13px] font-semibold tracking-wider">LOGOUT</span>
                </button>
              ) : (
                <button type="button" aria-label="Sign in" title="Sign in" onClick={login} className={`group ${pillButtonClass} lg:px-4`}>
                  <LogIn className="w-4 h-4 lg:w-[18px] lg:h-[18px] transition-transform duration-300 group-hover:translate-x-0.5" />
                  <span className="hidden sm:inline text-[11px] lg:text-[13px] font-semibold tracking-wider">SIGN IN</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile nav overlay — same light MOBILE_BG, so all content is ink-toned.
          Shop is intentionally absent here; it's its own header-bar trigger above. */}
      {mounted && (
        <div className={`fixed inset-0 z-[100] flex h-dvh flex-col ${MOBILE_BG} transition-opacity duration-[280ms] ease-out lg:hidden ${visible ? "opacity-100" : "opacity-0"}`}>
          <AirmailStripe />

          <div className={`flex items-center justify-between px-6 transition-all duration-300 ease-out ${visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`} style={{ height: OUTER_H }}>
            <BrandMark className="h-8 w-32" />
            <button type="button" aria-label="Close menu" onClick={() => setNavOpen(false)} className="flex items-center justify-center w-9 h-9 rounded-lg text-ink hover:bg-teal/10 transition-colors duration-200">
              <span className="relative block h-4 w-5">
                <span className="absolute left-0 top-1/2 h-0.5 w-5 -translate-y-1/2 rotate-45 rounded-full bg-ink" />
                <span className="absolute left-0 top-1/2 h-0.5 w-5 -translate-y-1/2 -rotate-45 rounded-full bg-ink" />
              </span>
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto nav-scroll" aria-label="Mobile navigation">
            {mobileNavLinks.map((link, index) => {
              const isExpanded = activeMobileMenu === link.href
              return (
                <div key={link.href} className={`border-b border-teal/15 transition-all duration-300 ease-out ${visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}`}
                  style={{ transitionDelay: visible ? `${60 + index * 40}ms` : "0ms" }}>
                  <button type="button" onClick={() => setActiveMobileMenu(isExpanded ? null : link.href)} aria-expanded={isExpanded}
                    className="flex w-full items-center justify-between px-6 py-5 text-left text-base font-display font-semibold text-ink tracking-wide">
                    {link.label}
                    {!!link.items && (
                      <ChevronDown size={18} className={`text-ink/40 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                    )}
                  </button>
                  <div className={`grid overflow-hidden bg-teal/[0.06] transition-[grid-template-rows] duration-300 ease-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="min-h-0 overflow-hidden pb-2">
                      {link.items?.map((item) => (
                        <a key={item.name} href={item.href} onClick={() => setNavOpen(false)} className="block px-6 py-3 font-body">
                          <div className="text-sm font-semibold text-ink">{item.name}</div>
                          <div className="mt-0.5 text-xs text-ink/60">{item.desc}</div>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </nav>

          {/* Cart + Wishlist replace the old profile summary here too, so the
              mobile menu and desktop bar offer the same "here's your stuff"
              shortcut instead of drifting into two different layouts. */}
          <div className={`flex-none space-y-3 px-6 pb-8 pt-4 transition-all duration-300 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { window.location.href = "/wishlist"; setNavOpen(false) }}
                className="relative flex items-center justify-center gap-2 rounded-lg border border-ink/15 py-3 text-sm font-semibold text-ink hover:bg-teal/10 transition-colors duration-200"
              >
                <Heart className="w-4 h-4 text-teal-deep" /> Wishlist
                <CountBadge count={wishlist.count} />
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = "/cart"; setNavOpen(false) }}
                className="relative flex items-center justify-center gap-2 rounded-lg border border-ink/15 py-3 text-sm font-semibold text-ink hover:bg-teal/10 transition-colors duration-200"
              >
                <ShoppingBag className="w-4 h-4 text-teal-deep" /> Cart
                <CountBadge count={cart.itemCount} />
              </button>
            </div>

            {!isAuthenticated && (
              <button type="button" onClick={() => setNavOpen(false)} className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-ink/15 py-3 text-sm font-semibold text-ink hover:bg-teal/10 transition-colors duration-200">
                <UserPlus className="w-4 h-4 text-teal-deep" /> Register
              </button>
            )}
            {isAuthenticated ? (
              <button type="button" onClick={() => { logout(); setNavOpen(false) }} className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-ink/5 py-3 text-sm font-semibold text-ink hover:bg-teal/10 transition-colors duration-200">
                <LogOut className="w-4 h-4" /> Logout
              </button>
            ) : (
              <button type="button" onClick={() => { login(); setNavOpen(false) }} className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-teal/10 py-3 text-sm font-semibold text-teal-deep hover:bg-teal/20 transition-colors duration-200">
                <LogIn className="w-4 h-4" /> Sign in
              </button>
            )}
          </div>
        </div>
      )}

      <ShopBottomSheet open={shopSheetOpen} onClose={() => setShopSheetOpen(false)} />
    </>
  )
}