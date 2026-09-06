'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type NotificationCategory = 'order' | 'promo' | 'system'

export type AppNotification = {
  id: string
  category: NotificationCategory
  title: string
  message: string
  /** Preformatted for this seed data — e.g. "5m ago". Once this reads
   *  from a real notifications endpoint, swap in real timestamps and
   *  format them client-side after mount (same hydration-safety pattern
   *  Header already uses for cart/wishlist counts), rather than
   *  formatting a live Date on the server. */
  timeLabel: string
  read: boolean
  href?: string | null
}

// Mock seed data standing in for a real notifications API. The
// provider/hook shape below doesn't assume mock data anywhere — swapping
// this array for a fetch + the setter below for a mutation is the only
// change a real backend would need.
const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    category: 'order',
    title: 'Your parcel has shipped',
    message: 'HRX by Hrithik Roshan Men Running Shoes is on its way to the warehouse.',
    timeLabel: '5m ago',
    read: false,
    href: '/account/orders',
  },
  {
    id: 'n2',
    category: 'promo',
    title: 'LKR 1,000 off your first order',
    message: 'Verify your phone number before Friday to claim your discount.',
    timeLabel: '2h ago',
    read: false,
    href: '/account',
  },
  {
    id: 'n3',
    category: 'system',
    title: 'Warehouse address updated',
    message: "We've refreshed your UK warehouse address — check it before your next order.",
    timeLabel: '6h ago',
    read: false,
    href: '/account',
  },
  {
    id: 'n4',
    category: 'order',
    title: 'Quality check complete',
    message: 'Your item passed QC and is ready for consolidation.',
    timeLabel: '1d ago',
    read: true,
    href: '/account/orders',
  },
  {
    id: 'n5',
    category: 'promo',
    title: 'Refer a friend, earn LKR 500',
    message: 'Your referral code is ready to share.',
    timeLabel: '3d ago',
    read: true,
    href: '/account/referrals',
  },
]

type NotificationContextValue = {
  notifications: AppNotification[]
  unreadCount: number
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  dismiss: (id: string) => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(MOCK_NOTIFICATIONS)

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

  const value = useMemo<NotificationContextValue>(
    () => ({ notifications, unreadCount, markAsRead, markAllAsRead, dismiss }),
    [notifications, unreadCount, markAsRead, markAllAsRead, dismiss],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return ctx
}