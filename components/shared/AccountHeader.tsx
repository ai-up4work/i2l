"use client"

import { useEffect, useRef, useState } from "react"
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  Gift,
  Heart,
  Info,
  LogOut,
  Menu,
  Package,
  Percent,
  ShoppingBag,
  User,
} from "lucide-react"

import type { View } from "./types"
import { useAuth } from "@/contexts/AuthContext"
import { useCart } from "@/contexts/Cartcontext"
import { useWishlist } from "@/contexts/Wishlistcontext"
import { useNotifications, type NotificationCategory } from "@/contexts/Notificationcontext"
import {
  focusRing,
  checkoutButtonClass,
  PREVIEW_ITEM_LIMIT,
  CountBadge,
  ProductThumb,
  SlideOverPanel,
} from "@/components/shared/HeaderPanels"

type AccountHeaderProps = {
  view: View
  onBack: () => void
  /** Opens the account Sidebar drawer. Only rendered/used below `lg` —
   *  MobileBottomNav.tsx remains the primary mobile nav; this just gives
   *  access to the fuller Sidebar (settings, shipments, etc.) that don't
   *  all fit in the bottom tab bar. */
  onMenuClick: () => void
}

// Same hairline border / hover tint / focus ring as the public Header's
// account-variant chrome, so this reads as one consistent design language
// even though it's a simpler bar (no notch/marquee shape — it sits above
// the Personal Center sidebar rather than being a full marketing nav).
const iconButtonClass =
  `grid h-10 w-10 place-items-center rounded-xl border border-ink/15 text-ink/70 transition-colors duration-200 hover:border-teal/40 hover:bg-teal/10 hover:text-teal-deep motion-reduce:transition-none ${focusRing}`

const CATEGORY_ICON: Record<NotificationCategory, React.ElementType> = {
  order: Package,
  promo: Percent,
  system: Info,
}

export default function AccountHeader({ view, onBack, onMenuClick }: AccountHeaderProps) {
  const { logout } = useAuth()
  const cart = useCart()
  const wishlist = useWishlist()
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()

  const [notifOpen, setNotifOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [wishlistPanelOpen, setWishlistPanelOpen] = useState(false)
  const [cartPanelOpen, setCartPanelOpen] = useState(false)

  const notifRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)

  // Wishlist/cart data is populated client-side, so gate on hasMounted to
  // avoid an SSR/client mismatch on first paint — same pattern the public
  // Header uses.
  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => setHasMounted(true), [])
  const wishlistCount = hasMounted ? wishlist.count : 0
  const cartCount = hasMounted ? cart.itemCount : 0
  const wishlistPreview = hasMounted
    ? wishlist.items.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, PREVIEW_ITEM_LIMIT)
    : []
  const cartPreview = hasMounted
    ? cart.items.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, PREVIEW_ITEM_LIMIT)
    : []

  useEffect(() => {
    if (!notifOpen && !accountOpen) return
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node
      if (notifOpen && !notifRef.current?.contains(target)) setNotifOpen(false)
      if (accountOpen && !accountRef.current?.contains(target)) setAccountOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setNotifOpen(false)
        setAccountOpen(false)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [notifOpen, accountOpen])

  return (
    <>
      <header className="flex h-20 items-center gap-2.5 px-6 lg:px-10">
        {/* Mobile-only — opens the Personal Center Sidebar drawer. */}
        <button
          type="button"
          aria-label="Open account menu"
          onClick={onMenuClick}
          className={`${iconButtonClass} lg:hidden`}
        >
          <Menu size={18} />
        </button>

        {view !== "home" && (
          <button type="button" aria-label="Go back" onClick={onBack} className={iconButtonClass}>
            <ChevronLeft size={18} />
          </button>
        )}

        <div className="flex-1" />

        {/* Wishlist/Cart — new here vs. the old Topbar. Uses the same
            SlideOverPanel the public Header uses, so behavior matches
            everywhere the icons appear. */}
        <button
          type="button"
          aria-label={`Wishlist${wishlistCount > 0 ? `, ${wishlistCount} items` : ""}`}
          onClick={() => setWishlistPanelOpen(true)}
          className={`relative ${iconButtonClass}`}
        >
          <Heart size={18} />
          <CountBadge count={wishlistCount} />
        </button>

        <button
          type="button"
          aria-label={`Cart${cartCount > 0 ? `, ${cartCount} items` : ""}`}
          onClick={() => setCartPanelOpen(true)}
          className={`relative ${iconButtonClass}`}
        >
          <ShoppingBag size={18} />
          <CountBadge count={cartCount} />
        </button>

        <button
          type="button"
          className={`group hidden items-center gap-2 rounded-full bg-gold-soft px-3 py-2.5 text-sm font-semibold text-rust transition-colors duration-200 hover:bg-gold-soft/70 motion-reduce:transition-none sm:flex sm:px-4 ${focusRing}`}
        >
          <Gift size={17} className="transition-transform duration-200 motion-reduce:transition-none group-hover:-rotate-6" />
          <span className="hidden lg:inline">Invite &amp; Earn</span>
        </button>

        <div ref={notifRef} className="relative">
          <button
            type="button"
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
            aria-expanded={notifOpen}
            onClick={() => setNotifOpen((v) => !v)}
            className={`relative ${iconButtonClass}`}
          >
            <Bell size={18} />
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

        {/* Account avatar — now a real dropdown (Profile / Sign out)
            instead of the old inert "S" circle with no onClick. */}
        <div ref={accountRef} className="relative">
          <button
            type="button"
            aria-label="Account menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((v) => !v)}
            className={`grid h-11 w-11 place-items-center rounded-full bg-blue text-lg font-bold text-paper shadow-sm ring-2 ring-parchment transition-transform duration-200 hover:scale-[1.04] active:scale-95 motion-reduce:transition-none ${focusRing}`}
          >
            S
          </button>

          <div
            className={`absolute right-0 top-full z-50 w-56 pt-3 transition-all duration-200 ease-out motion-reduce:transition-none ${
              accountOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"
            }`}
          >
            <div className="rounded-2xl border border-teal/20 bg-parchment p-2 shadow-xl shadow-ink/10">
              <a href="/account/" className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-teal/10 ${focusRing}`}>
                <User size={16} className="text-teal-deep" />
                <span className="text-sm font-semibold text-ink">My Profile</span>
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
      </header>

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