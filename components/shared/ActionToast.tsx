// components/shared/ActionToast.tsx
//
// One small confirmation card, bottom of the screen: "Added to bag ·
// View bag" / "Saved to your wishlist · View". Listens for
// showActionToast() (lib/action-toast.ts). Not shown on the bag page
// itself (changing a size there isn't news) or on the wishlist page.
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check, Heart, X } from 'lucide-react'
import { ACTION_TOAST_EVENT, type ActionToastDetail } from '@/lib/action-toast'

const SHOW_MS = 4000

export default function ActionToast() {
  const pathname = usePathname()
  const [toast, setToast] = useState<(ActionToastDetail & { key: number }) | null>(null)
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ActionToastDetail>).detail
      const path = pathRef.current ?? ''
      if (detail.kind === 'bag' && path.startsWith('/account/cart')) return
      if (detail.kind === 'wishlist' && path.startsWith('/account/wishlist')) return
      setToast({ ...detail, key: Date.now() })
      setVisible(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setVisible(false), SHOW_MS)
    }
    window.addEventListener(ACTION_TOAST_EVENT, onToast)
    return () => {
      window.removeEventListener(ACTION_TOAST_EVENT, onToast)
      clearTimeout(timer.current)
    }
  }, [])

  // Leaving the page (e.g. "View bag") closes it.
  useEffect(() => setVisible(false), [pathname])

  if (!toast) return null
  const bag = toast.kind === 'bag'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[300] flex justify-center px-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] sm:bottom-6 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div
        key={toast.key}
        className={`flex w-full max-w-md items-center gap-3 rounded-2xl bg-indigo p-2.5 pr-3 text-parchment shadow-[0_18px_40px_-14px_rgba(8,20,45,0.6)] ${
          visible ? 'pointer-events-auto' : ''
        }`}
      >
        <span className="relative h-11 w-11 flex-none overflow-hidden rounded-xl bg-parchment/10">
          {toast.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={toast.image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
          )}
          <span className={`absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full ring-2 ring-indigo ${bag ? 'bg-teal' : 'bg-rose-500'}`}>
            {bag ? <Check size={11} strokeWidth={3} /> : <Heart size={10} fill="currentColor" />}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{bag ? 'Added to bag' : 'Saved to your wishlist'}</span>
          <span className="block truncate text-xs text-parchment/60">
            {toast.detail ? `${toast.detail} · ` : ''}
            {toast.title}
          </span>
        </span>
        <Link
          href={bag ? '/account/cart' : '/account/wishlist'}
          className="flex-none rounded-full bg-parchment px-3.5 py-2 text-xs font-bold text-indigo transition-colors hover:bg-gold"
        >
          {bag ? 'View bag' : 'View'}
        </Link>
        <button type="button" onClick={() => setVisible(false)} aria-label="Dismiss" className="grid h-7 w-7 flex-none place-items-center rounded-full text-parchment/50 hover:bg-parchment/10 hover:text-parchment">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
