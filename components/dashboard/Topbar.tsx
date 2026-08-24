'use client'

import { Bell, ChevronLeft, Gift } from 'lucide-react'
import type { View } from './types'

type TopbarProps = {
  view: View
  onBack: () => void
}

// No mobile hamburger here — MobileBottomNav.tsx is the primary nav on
// small screens, so this just needs the contextual back button plus the
// invite/notifications/avatar cluster.
export default function Topbar({ view, onBack }: TopbarProps) {
  return (
    <header className="flex h-20 items-center gap-4 px-6 lg:px-10">
      {view !== 'home' && (
        <button
          aria-label="Go back"
          onClick={onBack}
          className="grid h-10 w-10 place-items-center rounded-xl border border-ink/15 text-ink transition-colors hover:bg-ink/5"
        >
          <ChevronLeft size={18} />
        </button>
      )}

      <div className="flex-1" />

      <button className="flex items-center gap-2 rounded-full bg-gold-soft px-3 py-2.5 text-sm font-semibold text-rust transition-colors hover:bg-gold-soft/70 sm:px-4">
        <Gift size={17} /> <span className="hidden sm:inline">Invite &amp; Earn</span>
      </button>
      <button aria-label="Notifications" className="text-ink">
        <Bell size={22} />
      </button>
      <button
        aria-label="Account menu"
        className="grid h-11 w-11 place-items-center rounded-full bg-blue text-lg font-bold text-paper"
      >
        S
      </button>
    </header>
  )
}
