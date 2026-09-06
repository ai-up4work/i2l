'use client'

import { Bell, ChevronLeft, Gift, Menu } from 'lucide-react'
import type { View } from './types'

type TopbarProps = {
  view: View
  onBack: () => void
  /** Opens the account Sidebar drawer. Only rendered/used below `lg` —
   *  MobileBottomNav.tsx remains the primary mobile nav; this just gives
   *  access to the fuller Sidebar (settings, shipments, etc.) that don't
   *  all fit in the bottom tab bar. */
  onMenuClick: () => void
}

// Shared with Header's account-variant chrome so both bars read as one
// piece of UI: same hairline border, same hover tint, same focus ring.
const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep focus-visible:ring-offset-2 focus-visible:ring-offset-parchment'

const iconButtonClass =
  `grid h-10 w-10 place-items-center rounded-xl border border-ink/15 text-ink/70 transition-colors duration-200 hover:border-teal/40 hover:bg-teal/10 hover:text-teal-deep motion-reduce:transition-none ${focusRing}`

export default function Topbar({ view, onBack, onMenuClick }: TopbarProps) {
  return (
    <header className="flex h-20 items-center gap-2.5  px-6 lg:px-10">
      {/* Mobile-only account menu trigger — lives in the same row as the
          rest of the icon cluster instead of a separate bar above it. */}
      <button
        type="button"
        aria-label="Open account menu"
        onClick={onMenuClick}
        className={`${iconButtonClass} lg:hidden`}
      >
        <Menu size={18} />
      </button>

      {view !== 'home' && (
        <button type="button" aria-label="Go back" onClick={onBack} className={iconButtonClass}>
          <ChevronLeft size={18} />
        </button>
      )}

      <div className="flex-1" />

      <button
        type="button"
        className={`group flex items-center gap-2 rounded-full bg-gold-soft px-3 py-2.5 text-sm font-semibold text-rust transition-colors duration-200 hover:bg-gold-soft/70 motion-reduce:transition-none sm:px-4 ${focusRing}`}
      >
        <Gift size={17} className="transition-transform duration-200 motion-reduce:transition-none group-hover:-rotate-6" />
        <span className="hidden sm:inline">Invite &amp; Earn</span>
      </button>

      <button type="button" aria-label="Notifications" className={iconButtonClass}>
        <Bell size={18} />
      </button>

      <button
        type="button"
        aria-label="Account menu"
        className={`grid h-11 w-11 place-items-center rounded-full bg-blue text-lg font-bold text-paper shadow-sm ring-2 ring-parchment transition-transform duration-200 hover:scale-[1.04] active:scale-95 motion-reduce:transition-none ${focusRing}`}
      >
        S
      </button>
    </header>
  )
}