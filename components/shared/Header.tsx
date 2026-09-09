"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname } from "next/navigation"
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronLeft,
  Gift,
  Heart,
  Info,
  LogIn,
  LogOut,
  Menu,
  Package,
  Percent,
  ShoppingBag,
  Store,
  User,
  UserPlus,
} from "lucide-react"

import BrandMark from "@/components/shared/BrandMark"
import AirmailStripe, { AIRMAIL_STRIPE_HEIGHT } from "@/components/shared/AirmailStripe"
import { useAuth } from "@/contexts/AuthContext"
import { useCart } from "@/contexts/Cartcontext"
import { useWishlist } from "@/contexts/Wishlistcontext"
import { useNotifications, type NotificationCategory } from "@/contexts/Notificationcontext"
import { ShopMegaMenuPanel } from "@/components/stores/ShopMegaMenu"
import ShopBottomSheet from "@/components/stores/ShopBottomSheet"
import {
  focusRing,
  checkoutButtonClass,
  PREVIEW_ITEM_LIMIT,
  CountBadge,
  ProductThumb,
  SlideOverPanel,
} from "@/components/shared/HeaderPanels"

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

// Kept loose (string) rather than importing dashboard's `View` type, so
// Header doesn't take a hard dependency on the account section's route
// model — callers just need to pass "home" to suppress the back button.
type AccountView = string

interface HeaderProps {
  title?: string
  showBackButton?: boolean
  variant?: "public" | "account"
  /** Account-only. Current in-page account view; back button hides on "home". */
  view?: AccountView
  /** Account-only. Called when the back chevron is tapped. */
  onBack?: () => void
  /** Account-only. Opens the account Sidebar drawer (settings, shipments,
   *  etc.) — separate from this Header's own mobile nav overlay below. */
  onMenuClick?: () => void
}

const OUTER_H = 68
const INNER_H = 54
const MOBILE_ANIM_MS = 280
const LEFT_NOTCH = 320
const NOTCH_GAP = 40

export const HEADER_BAR_HEIGHT = INNER_H + AIRMAIL_STRIPE_HEIGHT
export const HEADER_BAR_HEIGHT_MOBILE = OUTER_H + AIRMAIL_STRIPE_HEIGHT
export const HEADER_BAR_HEIGHT_DESKTOP = INNER_H + AIRMAIL_STRIPE_HEIGHT
export const OPEN_SHOP_EVENT = "wishdrop:open-shop"
const MOBILE_BG = "bg-parchment"

const pillButtonClass =
  `flex items-center gap-2 rounded-lg border border-ink/15 bg-ink/5 px-3 py-1.5 text-ink transition-colors duration-200 hover:bg-teal/10 hover:border-teal/40 hover:text-teal-deep motion-reduce:transition-none lg:py-2 ${focusRing}`

const iconPillButtonClass =
  `flex h-9 w-9 lg:h-10 lg:w-10 items-center justify-center rounded-lg border border-ink/15 bg-ink/5 text-ink transition-colors duration-200 hover:bg-teal/10 hover:border-teal/40 hover:text-teal-deep motion-reduce:transition-none ${focusRing}`

// Quiet variant for Wishlist/Cart/Account/Notifications on mobile — no
// border or fill, just the icon. Only the menu toggle keeps the boxed
// treatment, since it's the one control that actually expands something.
const mobileIconQuietClass =
  `flex h-9 w-9 items-center justify-center rounded-lg text-ink/70 transition-colors duration-200 active:bg-teal/10 active:text-teal-deep motion-reduce:transition-none ${focusRing}`

// Boxed treatment for the two account-only nav controls (drawer trigger,
// back button) — matches Topbar's old iconButtonClass so their look
// carries over unchanged into Header's account variant.
const accountNavIconClass =
  `grid h-9 w-9 place-items-center rounded-lg border border-ink/15 text-ink/70 transition-colors duration-200 hover:border-teal/40 hover:bg-teal/10 hover:text-teal-deep motion-reduce:transition-none lg:h-10 lg:w-10 lg:rounded-xl ${focusRing}`

const CATEGORY_ICON: Record<NotificationCategory, React.ElementType> = {
  order: Package,
  promo: Percent,
  system: Info,
}

export default function Header({
  title,
  showBackButton = false,
  variant = "public",
  view,
  onBack,
  onMenuClick,
}: HeaderProps) {
  const { isAuthenticated, login, logout } = useAuth()
  const cart = useCart()
  const wishlist = useWishlist()
  const isAccount = variant === "account"

  // Notifications only matter in the account variant — the hook is still
  // safe to call unconditionally (hooks can't be conditional), it's just
  // that its output is only rendered when isAccount is true.
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const [activeDesktopMenu, setActiveDesktopMenu] = useState<string | null>(null)
  const [navOpen, setNavOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [activeMobileMenu, setActiveMobileMenu] = useState<string | null>(null)
  const [shopSheetOpen, setShopSheetOpen] = useState(false)
  const [wishlistPanelOpen, setWishlistPanelOpen] = useState(false)
  const [cartPanelOpen, setCartPanelOpen] = useState(false)

  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => { setHasMounted(true) }, [])
  const wishlistCount = hasMounted ? wishlist.count : 0
  const cartCount = hasMounted ? cart.itemCount : 0

  const visibleNavLinks = isAccount ? navLinks.filter((l) => l.megaMenu) : navLinks
  const mobileNavLinks = visibleNavLinks.filter((link) => !link.megaMenu)

  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const SHOP_PANEL_ID = "shop-mega-menu-panel"
  const ACCOUNT_MENU_ID = "#account"

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
    if (!activeDesktopMenu && !notifOpen) return
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node
      const insideNav = navRef.current?.contains(target)
      const insideActions = actionsRef.current?.contains(target)
      const insideShopPanel = document.getElementById(SHOP_PANEL_ID)?.contains(target)
      const insideNotif = notifRef.current?.contains(target)
      if (activeDesktopMenu && !insideNav && !insideActions && !insideShopPanel) setActiveDesktopMenu(null)
      if (notifOpen && !insideNotif) setNotifOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActiveDesktopMenu(null)
        setNotifOpen(false)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [activeDesktopMenu, notifOpen])

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
  const showAccountBack = isAccount && !!onBack && view !== undefined && view !== "home"

  const wishlistPreview = hasMounted
    ? wishlist.items.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, PREVIEW_ITEM_LIMIT)
    : []
  const cartPreview = hasMounted
    ? cart.items.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, PREVIEW_ITEM_LIMIT)
    : []

  // Shared notification bell + dropdown — rendered once and reused in both
  // the mobile and desktop action rows below, so markup/behavior can't
  // drift between the two. Ported over from the old Topbar unchanged.
  const notificationBell = (
    <div ref={notifRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={notifOpen}
        onClick={() => setNotifOpen((v) => !v)}
        className={`relative ${accountNavIconClass}`}
      >
        <Bell size={17} className="lg:hidden" />
        <Bell size={18} className="hidden lg:block" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-deep px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <div
        className={`absolute right-0 top-full z-50 w-80 max-w-[calc(100vw-3rem)] pt-3 transition-all duration-200 ease-out motion-reduce:transition-none ${
          notifOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"
        }`}
      >
        <div className="rounded-2xl border border-teal/20 bg-parchment shadow-xl shadow-ink/10">
          <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className={`rounded text-xs font-semibold text-teal-deep hover:underline ${focusRing}`}
              >
                Mark all as read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink/55">You&apos;re all caught up.</div>
          ) : (
            <div className="max-h-96 overflow-y-auto p-2">
              {notifications.map((n) => {
                const Icon = CATEGORY_ICON[n.category]
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markAsRead(n.id)}
                    className={`flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-150 hover:bg-teal/10 ${focusRing}`}
                  >
                    <span
                      className={`mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full ${
                        n.read ? "bg-ink/5 text-ink/40" : "bg-teal/15 text-teal-deep"
                      }`}
                    >
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={`truncate text-sm ${n.read ? "font-medium text-ink/70" : "font-semibold text-ink"}`}>
                          {n.title}
                        </span>
                        {!n.read && <span className="h-1.5 w-1.5 flex-none rounded-full bg-teal-deep" />}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink/55">{n.message}</span>
                      <span className="mt-1 block text-[11px] text-ink/40">{n.timeLabel}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )

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
            <div className="flex items-center gap-2 flex-shrink-0 z-20 pr-3 h-full">
              {/* Account-only: drawer trigger (opens account Sidebar) and
                  back button, ported from the old Topbar. Both mobile-only
                  (lg:hidden) since on desktop the account Sidebar is
                  presumably always visible and there's no "back" concept
                  in a persistently-visible nested nav. */}
              {isAccount && onMenuClick && (
                <button
                  type="button"
                  aria-label="Open account menu"
                  onClick={onMenuClick}
                  className={`${accountNavIconClass} lg:hidden`}
                >
                  <Menu size={17} />
                </button>
              )}

              {isAccount && showAccountBack && (
                <button type="button" aria-label="Go back" onClick={onBack} className={`${accountNavIconClass} lg:hidden`}>
                  <ChevronLeft size={17} />
                </button>
              )}

              {showBackButton ? (
                <button type="button" aria-label="Go back" className={pillButtonClass}>
                  <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5" />
                  <span className="hidden sm:inline text-sm font-semibold font-body">Back</span>
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
                        className={`group relative flex items-center gap-1 rounded text-sm font-semibold font-body tracking-wide text-ink/85 transition-colors duration-200 hover:text-teal-deep ${focusRing}`}
                        onClick={(e) => {
                          if (!hasDropdown) return
                          e.preventDefault()
                          setActiveDesktopMenu((prev) => (prev === link.href ? null : link.href))
                        }}
                      >
                        {link.label}
                        {hasDropdown && (
                          <ChevronDown size={13} className={`text-ink/40 transition-transform duration-200 motion-reduce:transition-none group-hover:text-teal-deep ${isActive ? "-rotate-180" : ""}`} />
                        )}
                        <span className={`absolute -bottom-1.5 left-0 h-[1.5px] w-full origin-center scale-x-0 bg-teal transition-transform duration-200 ease-out motion-reduce:transition-none ${isActive ? "scale-x-100" : "group-hover:scale-x-100"}`} />
                      </a>

                      {link.megaMenu && <ShopMegaMenuPanel isActive={isActive} />}

                      {link.items && (
                        <div className={`absolute left-1/2 top-full z-50 w-80 -translate-x-1/2 pt-3 transition-all duration-200 ease-out motion-reduce:transition-none ${isActive ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}>
                          <div className="rounded-2xl border border-teal/20 bg-parchment p-2 shadow-xl shadow-ink/10">
                            {link.items.map((item, i) => (
                              <a key={item.name} href={item.href} className={`block rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-teal/10 ${focusRing}`} style={{ transitionDelay: isActive ? `${i * 25}ms` : "0ms" }}>
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

            {/* Mobile actions — Wishlist/Cart/Account are quiet icon-only
                controls. Heart and Bag open the shared SlideOverPanel
                (same one desktop uses) instead of navigating away.
                Notification bell is inserted here, account-variant only. */}
            <div className="flex lg:hidden flex-1 items-center justify-end gap-0.5 h-full">
              <button
                type="button"
                aria-label={`Wishlist${wishlistCount > 0 ? `, ${wishlistCount} items` : ""}`}
                onClick={() => setWishlistPanelOpen(true)}
                className={`relative ${mobileIconQuietClass}`}
              >
                <Heart className="w-[17px] h-[17px]" />
                <CountBadge count={wishlistCount} />
              </button>

              <button
                type="button"
                aria-label={`Cart${cartCount > 0 ? `, ${cartCount} items` : ""}`}
                onClick={() => setCartPanelOpen(true)}
                className={`relative ${mobileIconQuietClass}`}
              >
                <ShoppingBag className="w-[17px] h-[17px]" />
                <CountBadge count={cartCount} />
              </button>

              {isAccount && notificationBell}

              <button
                type="button"
                aria-label={isAuthenticated ? "Account" : "Sign in"}
                onClick={() => { if (isAuthenticated) { window.location.href = "/account/" } else { login() } }}
                className={`relative ${mobileIconQuietClass}`}
              >
                <User className="w-[17px] h-[17px]" />
                {isAuthenticated && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-gold-deep ring-2 ring-parchment" />
                )}
              </button>

              <button type="button" aria-label={navOpen ? "Close menu" : "Open menu"} aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}
                className={`group ml-1 flex items-center justify-center h-9 w-9 rounded-lg border transition-all duration-300 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing} ${
                  navOpen ? "bg-teal/10 border-teal/50 text-teal-deep" : "bg-ink/5 border-ink/15 text-ink active:bg-teal/10 active:border-teal/40 active:text-teal-deep"
                }`}>
                <span className="relative flex h-4 w-5 items-center justify-center">
                  <span className={`absolute h-[1.5px] w-5 rounded-full bg-current transition-all duration-300 ease-out motion-reduce:transition-none ${navOpen ? "rotate-45" : "-translate-y-[5px]"}`} />
                  <span className={`absolute h-[1.5px] w-5 rounded-full bg-current transition-all duration-200 ease-out motion-reduce:transition-none ${navOpen ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100"}`} />
                  <span className={`absolute h-[1.5px] w-5 rounded-full bg-current transition-all duration-300 ease-out motion-reduce:transition-none ${navOpen ? "-rotate-45" : "translate-y-[5px]"}`} />
                </span>
              </button>
            </div>

            {/* Desktop actions — Notification bell inserted before
                Wishlist/Cart, account-variant only. */}
            <div ref={actionsRef} className="hidden lg:flex items-center justify-end gap-2.5 flex-shrink-0 z-20 pl-2 h-full">
              {isAccount && notificationBell}

              <button
                type="button"
                aria-label="Wishlist"
                onClick={() => setWishlistPanelOpen(true)}
                className={`relative ${iconPillButtonClass}`}
              >
                <Heart className="w-[18px] h-[18px]" />
                <CountBadge count={wishlistCount} />
              </button>

              <button
                type="button"
                aria-label="Cart"
                onClick={() => setCartPanelOpen(true)}
                className={`relative ${iconPillButtonClass}`}
              >
                <ShoppingBag className="w-[18px] h-[18px]" />
                <CountBadge count={cartCount} />
              </button>

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
                    <span className="hidden sm:inline text-[13px] font-semibold">Account</span>
                    <ChevronDown size={13} className={`text-ink/40 transition-transform duration-200 motion-reduce:transition-none ${isAccountMenuOpen ? "-rotate-180" : ""}`} />
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-gold-deep ring-2 ring-parchment" />
                  </button>

                  <div className={`absolute right-0 top-full z-50 w-64 pt-3 transition-all duration-200 ease-out motion-reduce:transition-none ${isAccountMenuOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}>
                    <div className="rounded-2xl border border-teal/20 bg-parchment p-2 shadow-xl shadow-ink/10">
                      <a href="/account/" className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-teal/10 ${focusRing}`}>
                        <User size={16} className="text-teal-deep" />
                        <span className="text-sm font-semibold text-ink">My Profile</span>
                      </a>
                      <a href="/account/notifications" className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-teal/10 ${focusRing}`}>
                        <Bell size={16} className="text-teal-deep" />
                        <span className="text-sm font-semibold text-ink">Notifications</span>
                      </a>
                      <a href="/account/referrals" className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-teal/10 ${focusRing}`}>
                        <Gift size={16} className="text-teal-deep" />
                        <span className="text-sm font-semibold text-ink">Invite &amp; Earn</span>
                      </a>
                      <div className="my-1 border-t border-ink/10" />
                      <button
                        type="button"
                        onClick={logout}
                        className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors duration-150 hover:bg-teal/10 ${focusRing}`}
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
                    <LogIn className="w-4 h-4 lg:w-[18px] lg:h-[18px] transition-transform duration-300 motion-reduce:transition-none group-hover:translate-x-0.5" />
                    <span className="hidden sm:inline text-[13px] font-semibold">Sign in</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Get started"
                    onClick={() => { window.location.href = "/signup" }}
                    className={`rounded-lg bg-teal-deep px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-200 hover:bg-indigo-deep ${focusRing}`}
                  >
                    Get started
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {mounted && (
        <div className={`fixed inset-0 z-[100] flex h-dvh flex-col ${MOBILE_BG} transition-opacity duration-[280ms] ease-out motion-reduce:transition-none lg:hidden ${visible ? "opacity-100" : "opacity-0"}`}>
          <AirmailStripe />

          <div className={`flex items-center justify-between px-6 transition-all duration-300 ease-out motion-reduce:transition-none ${visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`} style={{ height: OUTER_H }}>
            <BrandMark className="h-8 w-32" />
            <button type="button" aria-label="Close menu" onClick={() => setNavOpen(false)} className={`flex items-center justify-center w-9 h-9 rounded-lg text-ink hover:bg-teal/10 transition-colors duration-200 ${focusRing}`}>
              <span className="relative block h-4 w-5">
                <span className="absolute left-0 top-1/2 h-0.5 w-5 -translate-y-1/2 rotate-45 rounded-full bg-ink" />
                <span className="absolute left-0 top-1/2 h-0.5 w-5 -translate-y-1/2 -rotate-45 rounded-full bg-ink" />
              </span>
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto nav-scroll" aria-label="Mobile navigation">
            <div className={`border-b border-teal/15 transition-all duration-300 ease-out motion-reduce:transition-none ${visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}`}
              style={{ transitionDelay: visible ? "60ms" : "0ms" }}>
              <button
                type="button"
                onClick={() => { setNavOpen(false); setShopSheetOpen(true) }}
                className={`flex w-full items-center justify-between px-6 py-5 text-left text-base font-display font-semibold text-ink tracking-wide ${focusRing}`}
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
                <div key={link.href} className={`border-b border-teal/15 transition-all duration-300 ease-out motion-reduce:transition-none ${visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}`}
                  style={{ transitionDelay: visible ? `${100 + index * 40}ms` : "0ms" }}>
                  <button type="button" onClick={() => setActiveMobileMenu(isExpanded ? null : link.href)} aria-expanded={isExpanded}
                    className={`flex w-full items-center justify-between px-6 py-5 text-left text-base font-display font-semibold text-ink tracking-wide ${focusRing}`}>
                    {link.label}
                    {!!link.items && (
                      <ChevronDown size={18} className={`text-ink/40 transition-transform duration-200 motion-reduce:transition-none ${isExpanded ? "rotate-180" : ""}`} />
                    )}
                  </button>
                  <div className={`grid overflow-hidden bg-teal/[0.06] transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="min-h-0 overflow-hidden pb-2">
                      {link.items?.map((item) => (
                        <a key={item.name} href={item.href} onClick={() => setNavOpen(false)} className={`block px-6 py-3 font-body ${focusRing}`}>
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

          <div className={`flex-none space-y-3 px-6 pb-8 pt-4 transition-all duration-300 ease-out motion-reduce:transition-none ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
            {!isAuthenticated && (
              <button type="button" onClick={() => { window.location.href = "/signup"; setNavOpen(false) }} className={`flex w-full items-center justify-center gap-2.5 rounded-lg bg-teal-deep py-3 text-sm font-semibold text-white hover:bg-indigo-deep transition-colors duration-200 ${focusRing}`}>
                <UserPlus className="w-4 h-4" /> Register
              </button>
            )}
            {isAuthenticated ? (
              <button type="button" onClick={() => { logout(); setNavOpen(false) }} className={`flex w-full items-center justify-center gap-2.5 rounded-lg bg-ink/5 py-3 text-sm font-semibold text-ink hover:bg-teal/10 transition-colors duration-200 ${focusRing}`}>
                <LogOut className="w-4 h-4" /> Logout
              </button>
            ) : (
              <button type="button" onClick={() => { login(); setNavOpen(false) }} className={`flex w-full items-center justify-center gap-2.5 rounded-lg bg-teal/10 py-3 text-sm font-semibold text-teal-deep hover:bg-teal/20 transition-colors duration-200 ${focusRing}`}>
                <LogIn className="w-4 h-4" /> Sign in
              </button>
            )}
          </div>
        </div>
      )}

      <ShopBottomSheet open={shopSheetOpen} onClose={() => setShopSheetOpen(false)} />

      <SlideOverPanel
        open={wishlistPanelOpen}
        onClose={() => setWishlistPanelOpen(false)}
        title="Wishlist"
        icon={<Heart size={18} className="text-teal-deep" />}
        isEmpty={wishlistPreview.length === 0}
        emptyLabel="Your wishlist is empty."
        emptyHref="/account/wishlist"
        emptyCta="Browse products"
        viewAllHref="/account/wishlist"
        viewAllLabel={`View wishlist (${wishlistCount})`}
      >
        {wishlistPreview.map((entry) => (
          <a
            key={entry.id}
            href={entry.url || "/account/wishlist"}
            onClick={() => setWishlistPanelOpen(false)}
            className={`flex items-center gap-3 rounded-xl border border-ink/10 bg-card p-3 transition-colors duration-150 hover:bg-teal/10 ${focusRing}`}
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
      </SlideOverPanel>

      <SlideOverPanel
        open={cartPanelOpen}
        onClose={() => setCartPanelOpen(false)}
        title="Cart"
        icon={<ShoppingBag size={18} className="text-teal-deep" />}
        isEmpty={cartPreview.length === 0}
        emptyLabel="Your cart is empty."
        emptyHref="/account/cart"
        emptyCta="Start shopping"
        viewAllHref="/account/cart"
        viewAllLabel={`View cart (${cartCount})`}
        footer={
          <a href="/account/cart" onClick={() => setCartPanelOpen(false)} className={checkoutButtonClass}>
            CHECKOUT
          </a>
        }
      >
        {cartPreview.map((line) => (
          <a
            key={line.product.id}
            href={line.product.url || "/account/cart"}
            onClick={() => setCartPanelOpen(false)}
            className={`flex items-center gap-3 rounded-xl border border-ink/10 bg-card p-3 transition-colors duration-150 hover:bg-teal/10 ${focusRing}`}
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
      </SlideOverPanel>
    </>
  )
}