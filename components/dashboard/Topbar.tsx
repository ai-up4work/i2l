'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronLeft, Gift, Info, Menu, Package, Percent } from 'lucide-react'
import type { View } from './types'
import { useNotifications, type NotificationCategory } from '@/contexts/Notificationcontext'

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

const CATEGORY_ICON: Record<NotificationCategory, React.ElementType> = {
  order: Package,
  promo: Percent,
  system: Info,
}

export default function Topbar({ view, onBack, onMenuClick }: TopbarProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const [notifOpen, setNotifOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!notifOpen) return
    function handlePointerDown(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setNotifOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setNotifOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [notifOpen])

  return (
    <header className="flex h-20 items-center gap-2.5 px-6 lg:px-10">
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

      <div ref={panelRef} className="relative">
        <button
          type="button"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
          aria-expanded={notifOpen}
          onClick={() => setNotifOpen((v) => !v)}
          className={`relative ${iconButtonClass}`}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-deep px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <div
          className={`absolute right-0 top-full z-50 w-80 max-w-[calc(100vw-3rem)] pt-3 transition-all duration-200 ease-out motion-reduce:transition-none ${
            notifOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'
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
                          n.read ? 'bg-ink/5 text-ink/40' : 'bg-teal/15 text-teal-deep'
                        }`}
                      >
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className={`truncate text-sm ${n.read ? 'font-medium text-ink/70' : 'font-semibold text-ink'}`}>
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