// components/store-modules/casecraft/likes.tsx
//
// Hearts on Case Craft designs and printed-case photos. Guests can like
// too: they get a random id kept on this device (app/api/casecraft/likes
// uses the account instead when signed in). Counts start from the server
// (StorefrontData) and update straight away when tapped.
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Heart } from 'lucide-react'

type Key = `${'design' | 'print'}:${string}`
type Ctx = {
  liked: (k: Key) => boolean
  count: (k: Key, base: number) => number
  toggle: (k: Key, base: number) => void
}

const LikesContext = createContext<Ctx | null>(null)
const DEVICE_KEY = 'wd:casecraft:liker'

function deviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY)
    if (!id || !/^[0-9a-f-]{20,40}$/i.test(id)) {
      id = crypto.randomUUID()
      window.localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return ''
  }
}

export function LikesProvider({ store, children }: { store: string; children: ReactNode }) {
  const [mine, setMine] = useState<Set<string>>(new Set())
  // Count changes made here, on top of the server's totals.
  const [delta, setDelta] = useState<Record<string, number>>({})

  useEffect(() => {
    const device = deviceId()
    fetch(`/api/casecraft/likes?store=${encodeURIComponent(store)}&device=${encodeURIComponent(device)}`)
      .then((r) => r.json())
      .then((b) => setMine(new Set((b.mine ?? []) as string[])))
      .catch(() => {})
  }, [store])

  const toggle = useCallback(
    (k: Key, _base: number) => {
      const like = !mine.has(k)
      const [type, id] = k.split(':') as ['design' | 'print', string]
      setMine((cur) => {
        const next = new Set(cur)
        if (like) next.add(k)
        else next.delete(k)
        return next
      })
      setDelta((d) => ({ ...d, [k]: (d[k] ?? 0) + (like ? 1 : -1) }))
      fetch('/api/casecraft/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store, type, id, like, device: deviceId() }),
      })
        .then((r) => (r.ok ? null : Promise.reject()))
        .catch(() => {
          // Put it back if it didn't save.
          setMine((cur) => {
            const next = new Set(cur)
            if (like) next.delete(k)
            else next.add(k)
            return next
          })
          setDelta((d) => ({ ...d, [k]: (d[k] ?? 0) + (like ? -1 : 1) }))
        })
    },
    [mine, store],
  )

  const value = useMemo<Ctx>(
    () => ({
      liked: (k) => mine.has(k),
      count: (k, base) => Math.max(0, base + (delta[k] ?? 0)),
      toggle,
    }),
    [mine, delta, toggle],
  )
  return <LikesContext.Provider value={value}>{children}</LikesContext.Provider>
}

export function LikeButton({
  type,
  id,
  base,
  look = 'overlay',
  className = '',
}: {
  type: 'design' | 'print'
  id: string
  /** The server's like count. */
  base: number
  /** overlay: a round button over a photo · inline: heart + count in text. */
  look?: 'overlay' | 'inline'
  className?: string
}) {
  const ctx = useContext(LikesContext)
  const k = `${type}:${id}` as Key
  const on = ctx?.liked(k) ?? false
  const n = ctx?.count(k, base) ?? base
  const [pop, setPop] = useState(false)
  if (!ctx) return null

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        ctx.toggle(k, base)
        if (!on) {
          setPop(true)
          window.setTimeout(() => setPop(false), 300)
        }
      }}
      aria-pressed={on}
      aria-label={on ? 'Unlike' : 'Like'}
      className={`${
        look === 'overlay'
          ? 'inline-flex h-8 items-center gap-1 rounded-full bg-card/92 px-2.5 shadow-sm ring-1 ring-ink/8 backdrop-blur'
          : 'inline-flex items-center gap-1 rounded-full px-1.5 py-1 hover:bg-ink/5'
      } font-body text-xs font-semibold tabular-nums text-ink transition-transform active:scale-95 ${className}`}
    >
      <Heart
        size={look === 'overlay' ? 14 : 15}
        className={`transition-transform duration-300 motion-reduce:transition-none ${pop ? 'scale-125' : ''} ${on ? 'fill-[#e5484d] text-[#e5484d]' : 'text-ink/60'}`}
        aria-hidden
      />
      {n > 0 && <span>{n}</span>}
    </button>
  )
}
