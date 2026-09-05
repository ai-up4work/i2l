'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'

export interface FanStore {
  platform: string
  name: string
  logo: string
}

/* ============================================================================
 * STORE FAN CAROUSEL
 * Small fanned deck of store logos, echoing a hand of cards. Sits beside the
 * hero copy on large screens as a quiet trust signal — "these are real
 * stores" — that idles on autoplay and responds to a click or hover.
 * ==========================================================================*/

const ROTATE_MS = 2600

export default function StoreFanCarousel({ stores }: { stores: FanStore[] }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = stores.length

  const go = useCallback((delta: number) => setActive((a) => (a + delta + count) % count), [count])

  useEffect(() => {
    if (paused || count <= 1) return
    const id = window.setInterval(() => go(1), ROTATE_MS)
    return () => window.clearInterval(id)
  }, [paused, go, count])

  if (count === 0) return null

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="w-[300px] rounded-3xl border border-black/5 bg-card/90 p-6 shadow-lift backdrop-blur-sm"
    >
      <p className="font-body text-xs font-extrabold uppercase tracking-[0.2em] text-gold">
        Real stores, delivered
      </p>

      <div className="relative mt-6 h-[190px]">
        {stores.map((store, i) => {
          let offset = i - active
          if (offset > count / 2) offset -= count
          if (offset < -count / 2) offset += count

          const isActive = offset === 0
          const abs = Math.abs(offset)
          const clamped = Math.min(abs, 3)

          const rotate = offset * 9
          const translateX = offset * 30
          const translateY = clamped * 10
          const scale = isActive ? 1 : 1 - clamped * 0.08
          const zIndex = 50 - clamped
          const opacity = abs > 3 ? 0 : 1

          return (
            <button
              key={store.platform}
              type="button"
              onClick={() => setActive(i)}
              aria-label={store.name}
              aria-current={isActive}
              className="absolute left-1/2 top-0 h-20 w-20 -ml-10 cursor-pointer border-none bg-transparent p-0"
              style={{
                transformOrigin: '50% 210px',
                transform: `translate(${translateX}px, ${translateY}px) rotate(${rotate}deg) scale(${scale})`,
                zIndex,
                opacity,
                transition: 'transform 420ms cubic-bezier(.22,1,.36,1), opacity 250ms ease',
              }}
            >
              <span
                className={`flex h-full w-full items-center justify-center rounded-2xl bg-parchment shadow-sm ${
                  isActive ? 'border-2 border-gold' : 'border border-black/5'
                }`}
              >
                <span className="relative h-10 w-10">
                  <Image src={store.logo} alt="" fill className="object-contain" />
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="font-body text-sm font-semibold text-teal-deep">{stores[active].name}</p>
        <div className="flex gap-1">
          {stores.map((store, i) => (
            <button
              key={store.platform}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show ${store.name}`}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === active ? 'w-4 bg-gold' : 'w-1.5 bg-ink/15'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}