"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
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
  User,
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
  checkoutButtonClass,
  PREVIEW_ITEM_LIMIT,
  CountBadge,
  ProductThumb,
  SlideOverPanel,
} from "@/components/shared/HeaderPanels"
import { OUTER_H, INNER_H, LEFT_NOTCH, NOTCH_GAP } from "@/components/shared/headerMetrics"

interface NavItem { name: string; desc: string; href: string }
interface NavLink {
  href: string
  label: string
  items?: NavItem[]
  megaMenu?: boolean
}

const navLinks: NavLink[] = [
  { href: "#shop", label: "Shop", megaMenu: true },
]

type AccountView = string

interface HeaderProps {
  title?: string
  showBackButton?: boolean
  variant?: "public" | "account"
  view?: AccountView
  onBack?: () => void
  onMenuClick?: () => void
}

export const HEADER_BAR_HEIGHT = INNER_H + AIRMAIL_STRIPE_HEIGHT
export const HEADER_BAR_HEIGHT_MOBILE = OUTER_H + AIRMAIL_STRIPE_HEIGHT
export const HEADER_BAR_HEIGHT_DESKTOP = INNER_H + AIRMAIL_STRIPE_HEIGHT
export const OPEN_SHOP_EVENT = "wishdrop:open-shop"
export { INNER_H }

const MOBILE_BG = "bg-parchment"

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep/60 focus-visible:ring-offset-2 focus-visible:ring-offset-parchment"

const pillButtonClass =
  `flex items-center gap-2 rounded-xl px-3 py-1.5 text-ink/70 transition-colors duration-200 hover:bg-gold/15 hover:text-gold-deep motion-reduce:transition-none lg:py-2 ${focusRing}`

const iconPillButtonClass =
  `flex h-9 w-9 lg:h-10 lg:w-10 items-center justify-center rounded-xl text-ink/60 transition-colors duration-200 hover:bg-gold/15 hover:text-gold-deep motion-reduce:transition-none ${focusRing}`

const mobileIconQuietClass =
  `flex h-9 w-9 items-center justify-center rounded-xl text-ink/60 transition-colors duration-200 active:bg-gold/15 active:text-gold-deep motion-reduce:transition-none ${focusRing}`

const accountNavIconClass =
  `grid h-9 w-9 place-items-center rounded-xl text-ink/60 transition-colors duration-200 active:bg-gold/15 active:text-gold-deep motion-reduce:transition-none ${focusRing}`

const notificationIconClass =
  `relative flex h-9 w-9 items-center justify-center rounded-xl text-ink/60 transition-colors duration-200 active:bg-gold/15 active:text-gold-deep hover:bg-gold/15 hover:text-gold-deep motion-reduce:transition-none lg:h-10 lg:w-10 ${focusRing}`

const CATEGORY_ICON: Record<NotificationCategory, React.ElementType> = {
  order: Package,
  promo: Percent,
  system: Info,
}

const HOVER_OPEN_DELAY = 120
const HOVER_CLOSE_DELAY = 200

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
  const router = useRouter()

  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const [activeDesktopMenu, setActiveDesktopMenu] = useState<string | null>(null)
  const [shopSheetOpen, setShopSheetOpen] = useState(false)
  const [wishlistPanelOpen, setWishlistPanelOpen] = useState(false)
  const [cartPanelOpen, setCartPanelOpen] = useState(false)

  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => { setHasMounted(true) }, [])
  const wishlistCount = hasMounted ? wishlist.count : 0
  const cartCount = hasMounted ? cart.itemCount : 0

  const visibleNavLinks = isAccount ? navLinks.filter((l) => l.megaMenu) : navLinks
  const shopLink = visibleNavLinks[0]

  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const SHOP_PANEL_ID = "shop-mega-menu-panel"
  const ACCOUNT_MENU_ID = "#account"

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearHoverTimer() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  function handleNotchMouseEnter(href: string) {
    clearHoverTimer()
    hoverTimerRef.current = setTimeout(() => {
      setActiveDesktopMenu(href)
    }, HOVER_OPEN_DELAY)
  }

  function handleNotchMouseLeave() {
    clearHoverTimer()
    hoverTimerRef.current = setTimeout(() => {
      setActiveDesktopMenu(null)
    }, HOVER_CLOSE_DELAY)
  }

  function handleNotchClick(e: React.MouseEvent) {
    if (!shopLink) return
    const hasDropdown = shopLink.megaMenu || !!shopLink.items
    if (!hasDropdown) return
    e.preventDefault()
    clearHoverTimer()
    setActiveDesktopMenu((prev) => (prev === shopLink.href ? null : shopLink.href))
  }

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
    return () => clearHoverTimer()
  }, [])

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

  const desktopClipPath =
    `polygon(0 0, 100% 0, 100% ${OUTER_H}px, calc(100% - ${rightNotch}px) ${OUTER_H}px, ` +
    `calc(100% - ${rightNotch + NOTCH_GAP}px) ${INNER_H}px, ${LEFT_NOTCH + NOTCH_GAP}px ${INNER_H}px, ${LEFT_NOTCH}px ${OUTER_H}px, 0 ${OUTER_H}px)`

  const isAccountMenuOpen = activeDesktopMenu === ACCOUNT_MENU_ID

  const wishlistPreview = hasMounted
    ? wishlist.items.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, PREVIEW_ITEM_LIMIT)
    : []
  const cartPreview = hasMounted
    ? cart.items.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, PREVIEW_ITEM_LIMIT)
    : []

  function goToAccountHome() {
    if (isAuthenticated) {
      router.push("/account/")
    } else {
      login()
    }
  }

  function goToAccountRoute(path: string) {
    setActiveDesktopMenu(null)
    router.push(path)
  }

  const notificationBell = (
    <div ref={notifRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={notifOpen}
        onClick={() => setNotifOpen((v) => !v)}
        className={notificationIconClass}
      >
        <Bell size={17} className="lg:hidden" />
        <Bell size={18} className="hidden lg:block" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gold-deep px-1 text-[10px] font-bold leading-none text-white ring-2 ring-parchment">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <div
        className={`absolute right-0 top-full z-50 w-80 max-w-[calc(100vw-3rem)] pt-3 transition-all duration-200 ease-out motion-reduce:transition-none ${
          notifOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"
        }`}
      >
        <div className="rounded-2xl border border-gold/20 bg-parchment shadow-xl shadow-black/10">
          <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className={`rounded text-xs font-semibold text-gold-deep hover:underline ${focusRing}`}
              >
                Mark all as read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink/50">You&apos;re all caught up.</div>
          ) : (
            <div className="max-h-96 overflow-y-auto nav-scroll p-2">
              {notifications.map((n) => {
                const Icon = CATEGORY_ICON[n.category]
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markAsRead(n.id)}
                    className={`flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-150 hover:bg-gold/10 ${focusRing}`}
                  >
                    <span
                      className={`mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full ${
                        n.read ? "bg-ink/5 text-ink/35" : "bg-gold/15 text-gold-deep"
                      }`}
                    >
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={`truncate text-sm ${n.read ? "font-medium text-ink/60" : "font-semibold text-ink"}`}>
                          {n.title}
                        </span>
                        {!n.read && <span className="h-1.5 w-1.5 flex-none rounded-full bg-gold-deep" />}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink/50">{n.message}</span>
                      <span className="mt-1 block text-[11px] text-ink/35">{n.timeLabel}</span>
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
          <div className="hidden lg:block absolute inset-0 pointer-events-none drop-shadow-[0_4px_18px_rgba(0,0,0,0.12)]">
            <div className="w-full h-full bg-parchment border-b border-teal/30" style={{ clipPath: desktopClipPath }} />
            <div className="absolute left-0 top-0 w-1/2 h-full overflow-hidden pointer-events-none z-10">
              <svg className="absolute left-0 top-0 w-[2000px] h-full" xmlns="http://www.w3.org/2000/svg">
                <path
                  d={`M 0 ${OUTER_H} L ${LEFT_NOTCH} ${OUTER_H} L ${LEFT_NOTCH + NOTCH_GAP} ${INNER_H} L 2000 ${INNER_H}`}
                  stroke="rgba(14, 140, 156, 0.5)"
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
            </div>
            <div className="absolute right-0 top-0 w-1/2 h-full overflow-hidden pointer-events-none z-10" style={{ transform: "scaleX(-1)" }}>
              <svg className="absolute left-0 top-0 w-[2000px] h-full" xmlns="http://www.w3.org/2000/svg">
                <path
                  d={`M 0 ${OUTER_H} L ${rightNotch} ${OUTER_H} L ${rightNotch + NOTCH_GAP} ${INNER_H} L 2000 ${INNER_H}`}
                  stroke="rgba(14, 140, 156, 0.5)"
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
            </div>
          </div>

          <div className={`lg:hidden absolute inset-0 ${MOBILE_BG} shadow-[0_1px_0_0_rgba(201,138,42,0.35),0_6px_16px_-8px_rgba(0,0,0,0.15)]`} />

          <div className="relative z-10 container mx-auto px-4 flex items-center justify-between w-full max-w-[1600px] h-full">
            <div className="flex items-center gap-2 flex-shrink-0 z-20 pr-3 h-full">
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

              {showBackButton ? (
                <button
                  type="button"
                  aria-label="Go back"
                  onClick={onBack}
                  className={pillButtonClass}
                >
                  <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5" />
                  <span className="hidden sm:inline text-sm font-semibold font-body">Back</span>
                </button>
              ) : (
                <div className="flex items-center cursor-pointer group min-w-0">
                  <BrandMark className="h-8 w-32 lg:h-9 lg:w-36" />
                </div>
              )}
            </div>

           {shopLink && (
            <button
              type="button"
              aria-label="Shop"
              aria-haspopup="true"
              aria-expanded={shopSheetOpen}
              onClick={() => setShopSheetOpen(true)}
              className={`hidden flex-1 items-center justify-center gap-1 h-full min-w-0 px-2 text-ink/70 transition-colors duration-150 active:bg-gold/10 active:text-gold-deep motion-reduce:transition-none ${focusRing}`}
            >
              <span className="text-sm font-semibold font-body truncate">{shopLink.label}</span>
              <ChevronDown
                size={13}
                className={`shrink-0 text-ink/40 transition-transform duration-200 motion-reduce:transition-none ${shopSheetOpen ? "-rotate-180" : ""}`}
              />
            </button>
          )}

            <div
              className="hidden lg:flex items-center justify-center absolute top-0 z-20 cursor-pointer transition-colors duration-150 hover:bg-gold/5"
              style={{
                height: INNER_H,
                left: LEFT_NOTCH + NOTCH_GAP,
                right: rightNotch + NOTCH_GAP,
              }}
              onMouseEnter={() => shopLink && handleNotchMouseEnter(shopLink.href)}
              onMouseLeave={handleNotchMouseLeave}
              onClick={handleNotchClick}
            >
              <nav ref={navRef} className="flex items-center gap-6 -mt-2" aria-label="Primary navigation">
                {visibleNavLinks.map((link) => {
                  const isActive = activeDesktopMenu === link.href
                  const hasDropdown = link.megaMenu || !!link.items
                  return (
                    <div key={link.href} className="relative h-full flex items-center">
                      <a
                        href={link.href}
                        aria-expanded={hasDropdown ? isActive : undefined}
                        className={`group relative flex items-center gap-1 rounded text-sm font-semibold font-body tracking-wide transition-colors duration-200 ${
                          isActive ? "text-gold-deep" : "text-ink/80"
                        } ${focusRing}`}
                        onFocus={() => handleNotchMouseEnter(link.href)}
                      >
                        {link.label}
                        {hasDropdown && (
                          <ChevronDown size={13} className={`text-ink/40 transition-transform duration-200 motion-reduce:transition-none ${isActive ? "-rotate-180" : ""}`} />
                        )}
                        <span
                          className={`teal-shimmer absolute -bottom-1.5 left-0 h-[1.5px] w-full origin-center scale-x-0 transition-transform duration-200 ease-out motion-reduce:transition-none ${isActive ? "scale-x-100" : ""}`}
                        />
                      </a>

                      {link.megaMenu && <ShopMegaMenuPanel isActive={isActive} />}

                      {link.items && (
                        <div className={`absolute left-1/2 top-full z-50 w-80 -translate-x-1/2 pt-3 transition-all duration-200 ease-out motion-reduce:transition-none ${isActive ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}>
                          <div className="rounded-2xl border border-gold/20 bg-parchment p-2 shadow-xl shadow-black/10">
                            {link.items.map((item, i) => (
                              <a key={item.name} href={item.href} className={`block rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-gold/10 ${focusRing}`} style={{ transitionDelay: isActive ? `${i * 25}ms` : "0ms" }}>
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

            {/* MOBILE action icons — notification bell now shown on every
                page, not just isAccount, so it's pulled out from behind
                that gate here as well. */}
            <div className="flex lg:hidden items-center gap-1 h-full">
              {notificationBell}

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

              {isAuthenticated ? (
                <button
                  type="button"
                  aria-label="Account"
                  onClick={goToAccountHome}
                  className={`relative ${mobileIconQuietClass}`}
                >
                  <User className="w-[17px] h-[17px]" />
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-gold-deep ring-2 ring-parchment" />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Sign in"
                  onClick={login}
                  className={`flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-ink/60 transition-colors duration-200 active:bg-gold/15 active:text-gold-deep motion-reduce:transition-none ${focusRing}`}
                >
                  <User className="w-[17px] h-[17px]" />
                  <span className="text-xs font-semibold">Sign in</span>
                </button>
              )}
            </div>

            {/* DESKTOP action icons — same change: notification bell no
                longer gated behind isAccount, always rendered. */}
            <div ref={actionsRef} className="hidden lg:flex items-center justify-end gap-2.5 flex-shrink-0 z-20 pl-2 h-full">
              {notificationBell}

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

                  {/* Account dropdown — "Notifications" row removed:
                      the bell (now visible on every page, including here
                      in the account menu bar) already covers that job,
                      so this was a duplicate entry point to the same
                      thing. */}
                  <div className={`absolute right-0 top-full z-50 w-64 pt-3 transition-all duration-200 ease-out motion-reduce:transition-none ${isAccountMenuOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}>
                    <div className="rounded-2xl border border-gold/20 bg-parchment p-2 shadow-xl shadow-black/10">
                      <button
                        type="button"
                        onClick={() => goToAccountRoute("/account/")}
                        className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors duration-150 hover:bg-gold/10 ${focusRing}`}
                      >
                        <User size={16} className="text-gold-deep" />
                        <span className="text-sm font-semibold text-ink">My Profile</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => goToAccountRoute("/account/referrals")}
                        className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors duration-150 hover:bg-gold/10 ${focusRing}`}
                      >
                        <Gift size={16} className="text-gold-deep" />
                        <span className="text-sm font-semibold text-ink">Invite &amp; Earn</span>
                      </button>
                      <div className="my-1 border-t border-ink/10" />
                      <button
                        type="button"
                        onClick={logout}
                        className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors duration-150 hover:bg-gold/10 ${focusRing}`}
                      >
                        <LogOut size={16} className="text-ink/50" />
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
                    onClick={() => router.push("/auth/signup")}
                    className={`rounded-xl bg-gold-deep px-4 py-2 text-[13px] font-semibold text-white shadow-sm shadow-gold-deep/20 transition-all duration-200 hover:bg-gold hover:shadow-md hover:shadow-gold/25 ${focusRing}`}
                  >
                    Get started
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <ShopBottomSheet open={shopSheetOpen} onClose={() => setShopSheetOpen(false)} />

      <SlideOverPanel
        open={wishlistPanelOpen}
        onClose={() => setWishlistPanelOpen(false)}
        title="Wishlist"
        icon={<Heart size={18} className="text-gold-deep" />}
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
            className={`flex items-center gap-3 rounded-xl border border-ink/10 bg-ink/[0.03] p-3 transition-colors duration-150 hover:bg-gold/10 ${focusRing}`}
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
        icon={<ShoppingBag size={18} className="text-gold-deep" />}
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
            className={`flex items-center gap-3 rounded-xl border border-ink/10 bg-ink/[0.03] p-3 transition-colors duration-150 hover:bg-gold/10 ${focusRing}`}
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