"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname } from "next/navigation"
import { ArrowLeft, LogIn, LogOut, Heart, ShoppingBag, UserPlus, ChevronDown, User, Bell, Gift, ImageOff, Store, X } from "lucide-react"

import BrandMark from "@/components/shared/BrandMark"
import AirmailStripe, { AIRMAIL_STRIPE_HEIGHT } from "@/components/shared/AirmailStripe"
import { useAuth } from "@/contexts/AuthContext"
import { useCart } from "@/contexts/Cartcontext"
import { useWishlist } from "@/contexts/Wishlistcontext"
import { ShopMegaMenuPanel } from "@/components/stores/ShopMegaMenu"
import ShopBottomSheet from "@/components/stores/ShopBottomSheet"

interface NavItem { name: string; desc: string; href: string }
interface NavLink {
  href: string
  label: string
  items?: NavItem[]
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
  title?: string
  showBackButton?: boolean
  variant?: "public" | "account"
}

const OUTER_H = 68
const INNER_H = 54
const MOBILE_ANIM_MS = 280
const LEFT_NOTCH = 320
const NOTCH_GAP = 40
// Cap how many rows render in the Wishlist/Cart preview dropdowns/sheets
// before falling back to "View all" — keeps the panel from growing unbounded.
const PREVIEW_ITEM_LIMIT = 4

export const HEADER_BAR_HEIGHT = OUTER_H + AIRMAIL_STRIPE_HEIGHT
export const OPEN_SHOP_EVENT = "wishdrop:open-shop"
const MOBILE_BG = "bg-parchment"

const pillButtonClass =
  "flex items-center gap-2 rounded-lg border border-ink/15 bg-ink/5 px-3 py-1.5 text-ink transition-all duration-200 hover:bg-teal/10 hover:border-teal/40 hover:text-teal-deep lg:py-2"

const iconPillButtonClass =
  "flex h-9 w-9 lg:h-10 lg:w-10 items-center justify-center rounded-lg border border-ink/15 bg-ink/5 text-ink transition-all duration-200 hover:bg-teal/10 hover:border-teal/40 hover:text-teal-deep"

// Compact variant for the tight mobile action row — smaller footprint
// (h-8 w-8) and a lighter border so several icons sitting next to each
// other don't read as a wall of boxes.
const mobileIconPillClass =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 bg-ink/[0.04] text-ink transition-colors duration-200 active:bg-teal/10 active:border-teal/40 active:text-teal-deep"

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-deep px-1 text-[10px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  )
}

// Small thumbnail used in both dropdown/sheet previews — falls back to a
// plain icon tile when a product has no image, rather than a broken <img>.
function ProductThumb({ image, alt }: { image?: string | null; alt: string }) {
  if (!image) {
    return (
      <div className="grid h-11 w-11 flex-none place-items-center rounded-lg border border-ink/10 bg-card">
        <ImageOff size={16} className="text-ink/25" />
      </div>
    )
  }
  return (
    <div className="h-11 w-11 flex-none overflow-hidden rounded-lg border border-ink/10 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={alt} className="h-full w-full object-contain p-1" />
    </div>
  )
}

const SHEET_ANIM_MS = 240

// Shared bottom sheet used for Wishlist and Cart previews on mobile.
// Mirrors the desktop dropdown content but renders as a slide-up sheet
// with a backdrop, matching the pattern used by ShopBottomSheet.
function PreviewBottomSheet({
  open,
  onClose,
  title,
  icon,
  children,
  isEmpty,
  emptyLabel,
  emptyHref,
  emptyCta,
  viewAllHref,
  viewAllLabel,
}: {
  open: boolean
  onClose: () => void
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  isEmpty: boolean
  emptyLabel: string
  emptyHref: string
  emptyCta: string
  viewAllHref: string
  viewAllLabel: string
}) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    timeout = setTimeout(() => setMounted(false), SHEET_ANIM_MS)
    return () => clearTimeout(timeout)
  }, [open])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [open])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-[110] lg:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 ease-out ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-teal/20 bg-parchment shadow-[0_-8px_30px_-8px_rgba(13,29,65,0.35)] transition-transform duration-[240ms] ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "80vh" }}
      >
        <div className="flex items-center justify-between border-b border-teal/15 px-5 py-4">
          <span className="flex items-center gap-2.5 text-base font-display font-semibold tracking-wide text-ink">
            {icon}
            {title}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/60 transition-colors duration-200 hover:bg-teal/10 hover:text-teal-deep"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(80vh-64px)] overflow-y-auto px-3 pb-6 pt-2">
          {isEmpty ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm text-ink/60">{emptyLabel}</p>
              <a
                href={emptyHref}
                onClick={onClose}
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-teal-deep hover:underline"
              >
                {emptyCta} →
              </a>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">{children}</div>
              <div className="mt-1 border-t border-ink/10 pt-2">
                <a
                  href={viewAllHref}
                  onClick={onClose}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal/10"
                >
                  {viewAllLabel}
                  <ArrowLeft size={14} className="rotate-180" />
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Header({ title, showBackButton = false, variant = "public" }: HeaderProps) {
  const { isAuthenticated, login, logout } = useAuth()
  const cart = useCart()
  const wishlist = useWishlist()
  const [activeDesktopMenu, setActiveDesktopMenu] = useState<string | null>(null)
  const [navOpen, setNavOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [activeMobileMenu, setActiveMobileMenu] = useState<string | null>(null)
  const [shopSheetOpen, setShopSheetOpen] = useState(false)
  const [wishlistSheetOpen, setWishlistSheetOpen] = useState(false)
  const [cartSheetOpen, setCartSheetOpen] = useState(false)

  // Wishlist/cart counts are populated client-side (e.g. from localStorage),
  // so the server always renders 0/empty. Gate on `hasMounted` so the very
  // first client render still matches SSR — the real counts appear right
  // after hydration instead of causing a mismatch.
  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => { setHasMounted(true) }, [])
  const wishlistCount = hasMounted ? wishlist.count : 0
  const cartCount = hasMounted ? cart.itemCount : 0

  const visibleNavLinks = variant === "account" ? navLinks.filter((l) => l.megaMenu) : navLinks
  // Shop is rendered as its own row above this list (opens the bottom sheet
  // directly) instead of as a collapsible section, so exclude it here.
  const mobileNavLinks = visibleNavLinks.filter((link) => !link.megaMenu)

  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const SHOP_PANEL_ID = "shop-mega-menu-panel"
  const ACCOUNT_MENU_ID = "#account"
  const WISHLIST_MENU_ID = "#wishlist"
  const CART_MENU_ID = "#cart"

  const [rightNotch, setRightNotch] = useState(LEFT_NOTCH)
  useEffect(() => {
    const el = actionsRef.current
    if (!el) return
    const update = () => setRightNotch(Math.max(LEFT_NOTCH, el.offsetWidth + 32))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isAuthenticated, variant])

  useEffect(() => {
    if (!activeDesktopMenu) return
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node
      const insideNav = navRef.current?.contains(target)
      const insideActions = actionsRef.current?.contains(target)
      const insideShopPanel = document.getElementById(SHOP_PANEL_ID)?.contains(target)
      if (!insideNav && !insideActions && !insideShopPanel) setActiveDesktopMenu(null)
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

  useEffect(() => {
    setActiveDesktopMenu(null)
  }, [pathname])

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
    `polygon(0 0, 100% 0, 100% ${OUTER_H}px, calc(100% - ${rightNotch}px) ${OUTER_H}px, ` +
    `calc(100% - ${rightNotch + NOTCH_GAP}px) ${INNER_H}px, ${LEFT_NOTCH + NOTCH_GAP}px ${INNER_H}px, ${LEFT_NOTCH}px ${OUTER_H}px, 0 ${OUTER_H}px)`

  const isAccountMenuOpen = activeDesktopMenu === ACCOUNT_MENU_ID
  const isWishlistOpen = activeDesktopMenu === WISHLIST_MENU_ID
  const isCartOpen = activeDesktopMenu === CART_MENU_ID

  const wishlistPreview = wishlist.items
    .slice()
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, PREVIEW_ITEM_LIMIT)
  const cartPreview = cart.items
    .slice()
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, PREVIEW_ITEM_LIMIT)

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-50">
        <AirmailStripe />

        <div className="relative w-full" style={{ height: OUTER_H }}>
          <div className="hidden lg:block absolute inset-0 pointer-events-none drop-shadow-[0_6px_14px_rgba(13,29,65,0.25)]">
            <div className="w-full h-full bg-parchment border-b border-teal/30" style={{ clipPath: desktopClipPath }} />
            <div className="absolute left-0 top-0 w-1/2 h-full overflow-hidden pointer-events-none z-10">
              <svg className="absolute left-0 top-0 w-[2000px] h-full" xmlns="http://www.w3.org/2000/svg">
                <path d={`M 0 ${OUTER_H} L ${LEFT_NOTCH} ${OUTER_H} L ${LEFT_NOTCH + NOTCH_GAP} ${INNER_H} L 2000 ${INNER_H}`} stroke="rgba(14, 140, 156, 0.5)" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
            <div className="absolute right-0 top-0 w-1/2 h-full overflow-hidden pointer-events-none z-10" style={{ transform: "scaleX(-1)" }}>
              <svg className="absolute left-0 top-0 w-[2000px] h-full" xmlns="http://www.w3.org/2000/svg">
                <path d={`M 0 ${OUTER_H} L ${rightNotch} ${OUTER_H} L ${rightNotch + NOTCH_GAP} ${INNER_H} L 2000 ${INNER_H}`} stroke="rgba(14, 140, 156, 0.5)" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
          </div>

          <div className={`lg:hidden absolute inset-0 ${MOBILE_BG} shadow-[0_1px_0_0_rgba(14,140,156,0.3),0_6px_18px_-10px_rgba(13,29,65,0.5)]`} />

          <div className="relative z-10 container mx-auto px-4 flex items-center justify-between w-full max-w-[1600px] h-full">
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

            <div className="hidden lg:flex items-center justify-center min-w-0 px-5 absolute left-1/2 top-0 -translate-x-1/2 z-20" style={{ height: INNER_H }}>
              <nav ref={navRef} className="flex items-center gap-6 -mt-2" aria-label="Primary navigation">
                {visibleNavLinks.map((link) => {
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

            {/* Mobile actions — Heart and Bag now open bottom-sheet previews
                (matching the desktop dropdowns) instead of navigating away.
                Account still goes straight to /account (or triggers login). */}
            <div className="flex lg:hidden flex-1 items-center justify-end gap-1 h-full">
              <button
                type="button"
                aria-label={`Wishlist${wishlistCount > 0 ? `, ${wishlistCount} items` : ""}`}
                onClick={() => setWishlistSheetOpen(true)}
                className={`relative ${mobileIconPillClass}`}
              >
                <Heart className="w-[17px] h-[17px]" />
                <CountBadge count={wishlistCount} />
              </button>

              <button
                type="button"
                aria-label={`Cart${cartCount > 0 ? `, ${cartCount} items` : ""}`}
                onClick={() => setCartSheetOpen(true)}
                className={`relative ${mobileIconPillClass}`}
              >
                <ShoppingBag className="w-[17px] h-[17px]" />
                <CountBadge count={cartCount} />
              </button>

              <button
                type="button"
                aria-label={isAuthenticated ? "Account" : "Sign in"}
                onClick={() => { if (isAuthenticated) { window.location.href = "/account/" } else { login() } }}
                className={`relative ${mobileIconPillClass}`}
              >
                <User className="w-[17px] h-[17px]" />
                {isAuthenticated && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-gold-deep ring-2 ring-parchment" />
                )}
              </button>

              <button type="button" aria-label={navOpen ? "Close menu" : "Open menu"} aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}
                className={`group flex items-center justify-center h-8 w-8 rounded-lg border transition-all duration-300 active:scale-95 ${
                  navOpen ? "bg-teal/10 border-teal/50 text-teal-deep" : "bg-ink/5 border-ink/15 text-ink active:bg-teal/10 active:border-teal/40 active:text-teal-deep"
                }`}>
                <span className="relative flex h-4 w-5 items-center justify-center">
                  <span className={`absolute h-[1.5px] w-5 rounded-full bg-current transition-all duration-300 ease-out ${navOpen ? "rotate-45" : "-translate-y-[5px]"}`} />
                  <span className={`absolute h-[1.5px] w-5 rounded-full bg-current transition-all duration-200 ease-out ${navOpen ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100"}`} />
                  <span className={`absolute h-[1.5px] w-5 rounded-full bg-current transition-all duration-300 ease-out ${navOpen ? "-rotate-45" : "translate-y-[5px]"}`} />
                </span>
              </button>
            </div>

            {/* Right — desktop only. Wishlist/Cart preview panels render real
                rows (thumbnail + title + price) sourced from
                WishlistEntry/CartLineItem, sorted newest-first, capped at
                PREVIEW_ITEM_LIMIT with a "View all" link when there's more. */}
            <div ref={actionsRef} className="hidden lg:flex items-center justify-end gap-2.5 flex-shrink-0 z-20 pl-2 h-full">
              <div className="relative h-full flex items-center">
                <button
                  type="button"
                  aria-label="Wishlist"
                  aria-expanded={isWishlistOpen}
                  onClick={() => setActiveDesktopMenu((prev) => (prev === WISHLIST_MENU_ID ? null : WISHLIST_MENU_ID))}
                  className={`relative ${iconPillButtonClass}`}
                >
                  <Heart className="w-[18px] h-[18px]" />
                  <CountBadge count={wishlistCount} />
                </button>
                <div className={`absolute right-0 top-full z-50 w-80 pt-3 transition-all duration-200 ease-out ${isWishlistOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}>
                  <div className="rounded-2xl border border-teal/20 bg-parchment p-3 shadow-xl shadow-ink/10">
                    {wishlistPreview.length > 0 ? (
                      <>
                        <div className="flex flex-col gap-1">
                          {wishlistPreview.map((entry) => (
                            <a
                              key={entry.id}
                              href={entry.url || "/wishlist"}
                              className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-teal/10"
                            >
                              <ProductThumb image={entry.image} alt={entry.title} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-ink">{entry.title}</p>
                                {entry.price && (
                                  <p className="text-xs text-ink/55">
                                    {entry.currencyCode ?? ""} {entry.price}
                                  </p>
                                )}
                              </div>
                            </a>
                          ))}
                        </div>
                        <div className="mt-1 border-t border-ink/10 pt-2">
                          <a href="/wishlist" className="flex items-center justify-between rounded-xl px-2 py-2 text-sm font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal/10">
                            View wishlist ({wishlistCount})
                            <ArrowLeft size={14} className="rotate-180" />
                          </a>
                        </div>
                      </>
                    ) : (
                      <div className="px-2 py-3">
                        <p className="text-sm text-ink/60">Your wishlist is empty.</p>
                        <a href="/wishlist" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-teal-deep hover:underline">
                          Browse products →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="relative h-full flex items-center">
                <button
                  type="button"
                  aria-label="Cart"
                  aria-expanded={isCartOpen}
                  onClick={() => setActiveDesktopMenu((prev) => (prev === CART_MENU_ID ? null : CART_MENU_ID))}
                  className={`relative ${iconPillButtonClass}`}
                >
                  <ShoppingBag className="w-[18px] h-[18px]" />
                  <CountBadge count={cartCount} />
                </button>
                <div className={`absolute right-0 top-full z-50 w-80 pt-3 transition-all duration-200 ease-out ${isCartOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}>
                  <div className="rounded-2xl border border-teal/20 bg-parchment p-3 shadow-xl shadow-ink/10">
                    {cartPreview.length > 0 ? (
                      <>
                        <div className="flex flex-col gap-1">
                          {cartPreview.map((line) => (
                           <a 
                              key={line.product.id}
                              href={line.product.url || "/cart"}
                              className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-teal/10"
                            >
                              <ProductThumb image={line.product.image} alt={line.product.title} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-ink">{line.product.title}</p>
                                <div className="flex items-center gap-2 text-xs text-ink/55">
                                  {line.product.estimatedPrice ? (
                                    <span>{line.product.estimatedPrice}</span>
                                  ) : line.product.sourcePrice ? (
                                    <span>{line.product.currencyCode ?? ""} {line.product.sourcePrice}</span>
                                  ) : null}
                                  <span>· Qty {line.qty}</span>
                                </div>
                              </div>
                            </a>
                          ))}
                        </div>
                        <div className="mt-1 border-t border-ink/10 pt-2">
                          <a href="/cart" className="flex items-center justify-between rounded-xl px-2 py-2 text-sm font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal/10">
                            View cart ({cartCount})
                            <ArrowLeft size={14} className="rotate-180" />
                          </a>
                        </div>
                      </>
                    ) : (
                      <div className="px-2 py-3">
                        <p className="text-sm text-ink/60">Your cart is empty.</p>
                        <a href="/cart" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-teal-deep hover:underline">
                          Start shopping →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {isAuthenticated ? (
                <div className="relative h-full flex items-center">
                  <button
                    type="button"
                    aria-label="Account menu"
                    aria-expanded={isAccountMenuOpen}
                    onClick={() => setActiveDesktopMenu((prev) => (prev === ACCOUNT_MENU_ID ? null : ACCOUNT_MENU_ID))}
                    className={`relative ${pillButtonClass} lg:px-3`}
                  >
                    <User className="w-4 h-4 lg:w-[18px] lg:h-[18px]" />
                    <span className="hidden sm:inline text-[11px] lg:text-[13px] font-semibold tracking-wider">ACCOUNT</span>
                    <ChevronDown size={13} className={`text-ink/40 transition-transform duration-200 ${isAccountMenuOpen ? "-rotate-180" : ""}`} />
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-gold-deep ring-2 ring-parchment" />
                  </button>

                  <div className={`absolute right-0 top-full z-50 w-64 pt-3 transition-all duration-200 ease-out ${isAccountMenuOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}>
                    <div className="rounded-2xl border border-teal/20 bg-parchment p-2 shadow-xl shadow-ink/10">
                      <a href="/account/" className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-teal/10">
                        <User size={16} className="text-teal-deep" />
                        <span className="text-sm font-semibold text-ink">My Profile</span>
                      </a>
                      <a href="/account/notifications" className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-teal/10">
                        <Bell size={16} className="text-teal-deep" />
                        <span className="text-sm font-semibold text-ink">Notifications</span>
                      </a>
                      <a href="/account/referrals" className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-teal/10">
                        <Gift size={16} className="text-teal-deep" />
                        <span className="text-sm font-semibold text-ink">Invite &amp; Earn</span>
                      </a>
                      <div className="my-1 border-t border-ink/10" />
                      <button
                        type="button"
                        onClick={logout}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors duration-150 hover:bg-teal/10"
                      >
                        <LogOut size={16} className="text-ink/60" />
                        <span className="text-sm font-semibold text-ink">Sign out</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Sign in" title="Sign in" onClick={login} className={`group ${pillButtonClass} lg:px-4`}>
                    <LogIn className="w-4 h-4 lg:w-[18px] lg:h-[18px] transition-transform duration-300 group-hover:translate-x-0.5" />
                    <span className="hidden sm:inline text-[11px] lg:text-[13px] font-semibold tracking-wider">SIGN IN</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Get started"
                    onClick={() => { window.location.href = "/signup" }}
                    className="rounded-lg bg-teal-deep px-4 py-2 text-[11px] lg:text-[13px] font-semibold tracking-wider text-white transition-colors duration-200 hover:bg-indigo-deep"
                  >
                    GET STARTED
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

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
            {/* Shop — moved here from the top bar. Same visual weight as the
                other top-level rows below, but has no expandable sub-items:
                it just opens the Shop bottom sheet directly. */}
            <div className={`border-b border-teal/15 transition-all duration-300 ease-out ${visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}`}
              style={{ transitionDelay: visible ? "60ms" : "0ms" }}>
              <button
                type="button"
                onClick={() => { setNavOpen(false); setShopSheetOpen(true) }}
                className="flex w-full items-center justify-between px-6 py-5 text-left text-base font-display font-semibold text-ink tracking-wide"
              >
                <span className="flex items-center gap-2.5">
                  <Store size={18} className="text-teal-deep" />
                  Shop
                </span>
              </button>
            </div>

            {mobileNavLinks.map((link, index) => {
              const isExpanded = activeMobileMenu === link.href
              return (
                <div key={link.href} className={`border-b border-teal/15 transition-all duration-300 ease-out ${visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}`}
                  style={{ transitionDelay: visible ? `${100 + index * 40}ms` : "0ms" }}>
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

          <div className={`flex-none space-y-3 px-6 pb-8 pt-4 transition-all duration-300 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
            {!isAuthenticated && (
              <button type="button" onClick={() => { window.location.href = "/signup"; setNavOpen(false) }} className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-teal-deep py-3 text-sm font-semibold text-white hover:bg-indigo-deep transition-colors duration-200">
                <UserPlus className="w-4 h-4" /> Register
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

      <PreviewBottomSheet
        open={wishlistSheetOpen}
        onClose={() => setWishlistSheetOpen(false)}
        title="Wishlist"
        icon={<Heart size={18} className="text-teal-deep" />}
        isEmpty={wishlistPreview.length === 0}
        emptyLabel="Your wishlist is empty."
        emptyHref="/wishlist"
        emptyCta="Browse products"
        viewAllHref="/wishlist"
        viewAllLabel={`View wishlist (${wishlistCount})`}
      >
        {wishlistPreview.map((entry) => (
          <a
            key={entry.id}
            href={entry.url || "/wishlist"}
            onClick={() => setWishlistSheetOpen(false)}
            className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-teal/10"
          >
            <ProductThumb image={entry.image} alt={entry.title} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{entry.title}</p>
              {entry.price && (
                <p className="text-xs text-ink/55">
                  {entry.currencyCode ?? ""} {entry.price}
                </p>
              )}
            </div>
          </a>
        ))}
      </PreviewBottomSheet>

      <PreviewBottomSheet
        open={cartSheetOpen}
        onClose={() => setCartSheetOpen(false)}
        title="Cart"
        icon={<ShoppingBag size={18} className="text-teal-deep" />}
        isEmpty={cartPreview.length === 0}
        emptyLabel="Your cart is empty."
        emptyHref="/cart"
        emptyCta="Start shopping"
        viewAllHref="/cart"
        viewAllLabel={`View cart (${cartCount})`}
      >
        {cartPreview.map((line) => (
          <a
            key={line.product.id}
            href={line.product.url || "/cart"}
            onClick={() => setCartSheetOpen(false)}
            className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-teal/10"
          >
            <ProductThumb image={line.product.image} alt={line.product.title} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{line.product.title}</p>
              <div className="flex items-center gap-2 text-xs text-ink/55">
                {line.product.estimatedPrice ? (
                  <span>{line.product.estimatedPrice}</span>
                ) : line.product.sourcePrice ? (
                  <span>{line.product.currencyCode ?? ""} {line.product.sourcePrice}</span>
                ) : null}
                <span>· Qty {line.qty}</span>
              </div>
            </div>
          </a>
        ))}
      </PreviewBottomSheet>
    </>
  )
}