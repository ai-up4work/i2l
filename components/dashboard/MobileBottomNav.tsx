'use client'

import { Bookmark, Gift, Home, MapPin, User } from 'lucide-react'
import type { View } from './types'

type Tab = { label: string; icon: typeof Home; view: View; alsoActiveFor?: View[] }

const tabs: Tab[] = [
  { label: 'Home', icon: Home, view: 'home' },
  { label: 'Addresses', icon: MapPin, view: 'warehouseAddresses' },
  { label: 'Orders', icon: Bookmark, view: 'ordersHub', alsoActiveFor: ['requests', 'biddingRequests', 'shipmentOrders', 'addRequest', 'addShipment', 'preview'] },
  { label: 'Promo codes', icon: Gift, view: 'promoCodes' },
  { label: 'Account', icon: User, view: 'account', alsoActiveFor: ['shoppingCommunity', 'credits', 'referrals'] },
]

type MobileBottomNavProps = {
  view: View
  onNavigate: (view: View) => void
}

export default function MobileBottomNav({ view, onNavigate }: MobileBottomNavProps) {
  const activeIndex = tabs.findIndex(
    (t) => view === t.view || t.alsoActiveFor?.includes(view)
  )

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="relative flex items-stretch">
        {/* sliding selection pill — glides beneath the active icon */}
        {activeIndex >= 0 && (
          <span
            className="pointer-events-none absolute top-1.5 h-11 rounded-2xl border border-rust/20 bg-gold-soft shadow-[0_4px_10px_rgba(235,91,24,0.12)] transition-[left] duration-500 ease-nav-spring"
            style={{
              left: `calc(${(activeIndex / tabs.length) * 100}% + ${100 / tabs.length / 2}% - 22px)`,
              width: '44px',
            }}
            aria-hidden="true"
          />
        )}

        {tabs.map(({ label, icon: Icon, view: tabView, alsoActiveFor }) => {
          const isActive = view === tabView || alsoActiveFor?.includes(view)

          return (
            <button
              key={label}
              type="button"
              onClick={() => onNavigate(tabView)}
              aria-current={isActive ? 'page' : undefined}
              className="group relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-transform duration-150 active:scale-90"
            >
              <span
                key={isActive ? `${label}-on` : `${label}-off`}
                className={`relative grid size-11 shrink-0 place-items-center rounded-2xl transition-colors duration-300 ${
                  isActive ? 'text-rust animate-nav-pop' : 'text-ink/40'
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
                  isActive ? 'text-rust animate-nav-rise' : 'text-ink/50'
                }`}
              >
                {label}
              </span>
            </button>
          )
        })}
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