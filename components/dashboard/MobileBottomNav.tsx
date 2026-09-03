'use client'

import { Bookmark, Home, Plus, Store, User } from 'lucide-react'
import type { View } from './types'

type Tab = { label: string; icon: typeof Home; view: View; alsoActiveFor?: View[] }

// Promo Codes was dropped from here — it's one of seven peer items under
// the Sidebar's "My Assets" group (Credits, Referrals, Wallet, Coupons,
// Points, Gift Card, Promo Codes), no more top-level than the others, so
// it didn't earn a permanent bottom-nav slot. It's still reachable via
// the Topbar/Sidebar menu.
//
// These are the four "flat" tabs, split left/right of the raised center
// Add Request button below — not rendered as a single array anymore
// since the center slot isn't a normal tab (no label under it, different
// shape, always navigates to the same view regardless of "active" state).
const leftTabs: Tab[] = [
  { label: 'Home', icon: Home, view: 'home' },
  { label: 'Orders', icon: Bookmark, view: 'ordersHub', alsoActiveFor: ['requests', 'biddingRequests', 'shipmentOrders', 'preview'] },
]

const rightTabs: Tab[] = [
  { label: 'Stores', icon: Store, view: 'affiliatedStores' },
  { label: 'Account', icon: User, view: 'account', alsoActiveFor: ['shoppingCommunity', 'credits', 'referrals'] },
]

const tabs: Tab[] = [...leftTabs, ...rightTabs]

// The "Stores" tab is the same destination the desktop header's "Shop"
// mega menu and the old mobile "Shop" button both pointed at, so instead
// of navigating to a full page it opens ShopBottomSheet — same content
// (ShopMegaMenuMobile), consistent with desktop.
const SHOP_TAB_VIEW: View = 'affiliatedStores'

type MobileBottomNavProps = {
  view: View
  onNavigate: (view: View) => void
  /** Opens ShopBottomSheet. Called instead of onNavigate when the Stores
   *  tab is tapped. */
  onOpenShop: () => void
  /** Opens AddRequestOverlay. Called instead of onNavigate when the
   *  center + button is tapped — WishDrop's whole loop is "paste a link,
   *  we buy it", so this gets an always-visible, unmissable slot rather
   *  than routing away from wherever the user currently is. */
  onOpenAddRequest: () => void
  /** Whether AddRequestOverlay is currently open, so the center button
   *  can reflect active state without relying on `view`. */
  isAddRequestOpen?: boolean
}

export default function MobileBottomNav({
  view,
  onNavigate,
  onOpenShop,
  onOpenAddRequest,
  isAddRequestOpen = false,
}: MobileBottomNavProps) {
  const activeIndex = tabs.findIndex(
    (t) => view === t.view || t.alsoActiveFor?.includes(view)
  )
  // Index within the visual 5-slot row (2 left tabs, center button, 2
  // right tabs) — used only to position the sliding pill under the
  // correct flat tab; the center slot never carries the pill.
  const activeVisualIndex = activeIndex < 0 ? -1 : activeIndex < 2 ? activeIndex : activeIndex + 1
  const isAddRequestActive = isAddRequestOpen

  function handleTabClick(tabView: View) {
    if (tabView === SHOP_TAB_VIEW) {
      onOpenShop()
      return
    }
    onNavigate(tabView)
  }

  function renderTab({ label, icon: Icon, view: tabView, alsoActiveFor }: Tab) {
    const isActive = view === tabView || alsoActiveFor?.includes(view)

    return (
      <button
        key={label}
        type="button"
        onClick={() => handleTabClick(tabView)}
        aria-current={isActive ? 'page' : undefined}
        className="group relative flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-transform duration-150 active:scale-90"
      >
        <span
          key={isActive ? `${label}-on` : `${label}-off`}
          className={`relative grid size-11 shrink-0 place-items-center rounded-2xl transition-colors duration-300 ${
            isActive ? 'text-teal-deep animate-nav-pop' : 'text-ink/40'
          }`}
          aria-hidden="true"
        >
          <span className="absolute inset-x-2 top-1.5 h-px bg-current opacity-15" />
          <Icon size={19} strokeWidth={1.8} />
          <span className="absolute bottom-1.5 h-0.5 w-2 rounded-full bg-current opacity-25" />
        </span>

        <span
          key={isActive ? `${label}-label-on` : `${label}-label-off`}
          className={`text-[10.5px] font-semibold leading-none transition-colors duration-300 ${
            isActive ? 'text-teal-deep animate-nav-rise' : 'text-ink/50'
          }`}
        >
          {label}
        </span>
      </button>
    )
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-parchment/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="relative flex items-stretch">
        {/* sliding selection pill — glides beneath the active flat tab.
            Never shown under the center Add Request button, which has
            its own always-on filled treatment instead. top-1 keeps it
            vertically centered against the tabs' py-2 padding (was top-1.5
            for py-2.5, before the bar was shortened). */}
        {activeVisualIndex >= 0 && (
          <span
            className="pointer-events-none absolute top-1 h-11 rounded-2xl border border-teal/20 bg-gold/10 shadow-[0_4px_10px_rgba(14,140,156,0.12)] transition-[left] duration-500 ease-nav-spring"
            style={{
              left: `calc(${(activeVisualIndex / 5) * 100}% + ${100 / 5 / 2}% - 22px)`,
              width: '44px',
            }}
            aria-hidden="true"
          />
        )}

        {leftTabs.map(renderTab)}

        {/* Raised center Add Request button — opens AddRequestOverlay as
            an overlay on top of the current page instead of navigating
            to a dedicated route, so users don't lose their place (e.g.
            mid-browse in Stores) just to submit a link. -mt-7 (was -mt-6)
            pulls it up a bit further so it protrudes more above the
            now-shorter bar. */}
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={onOpenAddRequest}
            aria-label="Add request"
            aria-current={isAddRequestActive ? 'page' : undefined}
            className={`relative -mt-7 flex h-14 w-14 items-center justify-center rounded-full shadow-[0_6px_16px_rgba(14,140,156,0.35)] ring-4 ring-parchment transition-transform duration-150 active:scale-90 ${
              isAddRequestActive
                ? 'bg-teal-deep'
                : 'bg-teal hover:bg-teal-deep'
            }`}
          >
            <Plus size={24} strokeWidth={2.25} className="text-parchment" />
          </button>
        </div>

        {rightTabs.map(renderTab)}
      </div>

      <style jsx>{`
        @keyframes nav-pop {
          0% {
            transform: scale(0.6) rotate(-10deg);
          }
          55% {
            transform: scale(1.2) rotate(4deg);
          }
          80% {
            transform: scale(0.95) rotate(-1deg);
          }
          100% {
            transform: scale(1) rotate(0deg);
          }
        }
        @keyframes nav-rise {
          0% {
            opacity: 0;
            transform: translateY(5px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-nav-pop {
          animation: nav-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .animate-nav-rise {
          animation: nav-rise 0.3s ease-out 0.05s both;
        }
        .ease-nav-spring {
          transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </nav>
  )
}