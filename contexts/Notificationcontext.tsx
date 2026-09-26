'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { createClient } from '@/lib/supabase/client'

export type NotificationCategory = 'order' | 'promo' | 'system'

export type AppNotification = {
  id: string
  category: NotificationCategory
  title: string
  message: string
  /** Preformatted — e.g. "5m ago". Computed client-side from the real
   *  `created_at` timestamp after mount, same hydration-safety pattern
   *  Header already uses for cart/wishlist counts (never format a live
   *  Date during SSR). */
  timeLabel: string
  read: boolean
  href?: string | null
}

/**
 * Real `notifications.type` is free text (see
 * data/Wishdrop-supabase-schema.sql: 'order_update' | 'price_drop' |
 * 'chat_reply' | ...) — this is the one place that maps it down to the
 * 3-category vocabulary the UI (Topbar's CATEGORY_ICON) actually
 * switches on. Extend this, not the UI, when a new notification type is
 * introduced elsewhere (e.g. confirmRequestReal, the QC-issue flow).
 */
function categoryForType(type: string): NotificationCategory {
  if (type === 'promo' || type === 'discount' || type === 'referral' || type === 'coupon_issued') return 'promo'
  if (type.startsWith('order_') || type === 'qc_issue' || type === 'chat_reply' || type === 'shipment_update') return 'order'
  return 'system'
}

function formatTimeLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

type NotificationRow = {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

function mapRowToNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    category: categoryForType(row.type),
    title: row.title,
    message: row.body ?? '',
    timeLabel: formatTimeLabel(row.created_at),
    read: row.read,
    href: row.link,
  }
}

type NotificationContextValue = {
  notifications: AppNotification[]
  unreadCount: number
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  dismiss: (id: string) => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const supabaseRef = useRef(createClient())

  const load = useCallback(async () => {
    if (!user) {
      setNotifications([])
      return
    }
    const { data, error } = await supabaseRef.current
      .from('notifications')
      .select('id, type, title, body, link, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      console.error('[notifications] failed to load', error)
      return
    }
    setNotifications((data ?? []).map(mapRowToNotification))
    // Keyed on user?.id, not user — see Ordercontexts.tsx for the full
    // explanation. Kept as user?.id here too (not just fixing the
    // useEffect below) since this useCallback getting a new identity on
    // every tab-focus event is what was re-triggering the effect at
    // [load] below in the first place.
  }, [user?.id])

  useEffect(() => {
    load()
  }, [load])

  // Live updates — a new notification (order update, QC issue, coupon
  // issued, etc.) shows up without the user needing to reload the page,
  // same realtime pattern lib/supabase/chat.ts already uses for messages.
  useEffect(() => {
    if (!user) return
    const supabase = supabaseRef.current
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [mapRowToNotification(payload.new as NotificationRow), ...prev])
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // Keyed on user?.id, not user — same fix as above; otherwise this
    // tore down and re-created the realtime subscription on every tab
    // focus, not just on an actual login/logout.
  }, [user?.id])

  const markAsRead = useCallback(
    (id: string) => {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
      supabaseRef.current.from('notifications').update({ read: true }).eq('id', id).then(({ error }) => {
        if (error) console.error('[notifications] markAsRead failed', error)
      })
    },
    [],
  )

  const markAllAsRead = useCallback(() => {
    if (!user) return
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    supabaseRef.current
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)
      .then(({ error }) => {
        if (error) console.error('[notifications] markAllAsRead failed', error)
      })
  }, [user?.id])

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    supabaseRef.current.from('notifications').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('[notifications] dismiss failed', error)
    })
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