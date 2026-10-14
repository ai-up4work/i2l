'use client'

import { Home, Package, Plus, Store, User } from 'lucide-react'
import type { View } from './types'
import { useHideOnScroll } from '@/hooks/useHideOnScroll'

type Tab = { label: string; icon: typeof Home; view: View; alsoActiveFor?: View[] }

// Promo Codes was dropped from here — it's one of seven peer items under
// the Sidebar's "My Assets" group (Credits, Referrals, Wallet, Coupons,
// Points, Gift Card, Promo Codes), no more top-level than the others, so
// it didn't earn a permanent bottom-nav slot. It's still reachable via
// the Topbar/Sidebar menu.
//

export const MOBILE_BOTTOM_NAV_HEIGHT = 76


// These are the four "flat" tabs, split left/right of the raised center
// Add Request button below — not rendered as a single array anymore
// since the center slot isn't a normal tab (no label under it, different
// shape, always navigates to the same view regardless of "active" state).
const leftTabs: Tab[] = [
  { label: 'Home', icon: Home, view: 'home' },
  { label: 'Orders', icon: Package, view: 'ordersHub', alsoActiveFor: ['requests', 'biddingRequests', 'shipmentOrders', 'preview'] },
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
   *  center + button is tapped — Wishdrop's whole loop is "paste a link,
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
  // Slides away while scrolling down, back when scrolling up — together
  // with the header (hooks/useHideOnScroll.ts).
  const hidden = useHideOnScroll() && !isAddRequestOpen
  const activeIndex = tabs.findIndex((t) => view === t.view || t.alsoActiveFor?.includes(view))
  // Position in the 5-slot row (2 tabs, centre button, 2 tabs).
  const activeVisualIndex = activeIndex < 0 ? -1 : activeIndex < 2 ? activeIndex : activeIndex + 1

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
        className="relative z-10 flex h-full flex-1 flex-col items-center justify-center gap-1 transition-transform duration-150 active:scale-90"
      >
        <Icon
          size={20}
          strokeWidth={isActive ? 2.3 : 1.8}
          className={`transition-colors duration-300 ${isActive ? 'text-gold' : 'text-parchment/55'}`}
          aria-hidden="true"
        />
        <span className={`font-body text-[10px] font-semibold leading-none tracking-wide transition-colors duration-300 ${isActive ? 'text-parchment' : 'text-parchment/50'}`}>
          {label}
        </span>
      </button>
    )
  }

  return (
    <nav
      aria-label="Primary"
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(10px,env(safe-area-inset-bottom))] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:hidden ${
        hidden ? 'translate-y-[calc(100%+40px)]' : ''
      }`}
    >
      {/* Floating dock: indigo glass with a hairline gold edge on top. */}
      <div className="pointer-events-auto relative mx-auto flex h-16 max-w-md items-stretch rounded-[26px] bg-indigo/95 px-1.5 shadow-[0_14px_34px_-10px_rgba(8,39,79,0.6),0_2px_6px_rgba(8,39,79,0.25)] ring-1 ring-white/10 backdrop-blur-xl">
        <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" aria-hidden="true" />

        {/* Sliding highlight behind the current tab. */}
        {activeVisualIndex >= 0 && (
          <span
            className="ease-nav-spring pointer-events-none absolute top-2 h-12 rounded-[18px] bg-white/[0.08] ring-1 ring-white/10 transition-[left] duration-500"
            style={{ left: `calc(6px + (100% - 12px) * ${activeVisualIndex} / 5 + 6px)`, width: 'calc((100% - 12px) / 5 - 12px)' }}
            aria-hidden="true"
          />
        )}

        {leftTabs.map(renderTab)}

        {/* Centre: paste a link / add a request. Raised out of the dock. */}
        <div className="relative z-10 flex flex-1 items-start justify-center">
          <button
            type="button"
            onClick={onOpenAddRequest}
            aria-label="Add request"
            aria-current={isAddRequestOpen ? 'page' : undefined}
            className="relative -mt-5 grid h-[58px] w-[58px] place-items-center rounded-full bg-gradient-to-br from-teal to-teal-deep text-parchment shadow-[0_10px_22px_-6px_rgba(14,140,156,0.7)] ring-[5px] ring-parchment transition-transform duration-200 active:scale-90"
          >
            <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/25 to-transparent" aria-hidden="true" />
            <Plus size={26} strokeWidth={2.4} className={`relative transition-transform duration-300 ${isAddRequestOpen ? 'rotate-45' : ''}`} />
          </button>
        </div>

        {rightTabs.map(renderTab)}
      </div>

      <style jsx>{`
        .ease-nav-spring {
          transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </nav>
  )
}
