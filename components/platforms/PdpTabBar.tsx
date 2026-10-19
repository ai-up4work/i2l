'use client'

// components/platforms/PdpTabBar.tsx
//
// Description / Details / Shipping & Returns switcher for the store views
// in the item screen: the same sliding-pill look as the storefront's own
// product page (components/stores/ProductInfoTabs.tsx), so every view —
// and the storefront — share one tab style.

import { useLayoutEffect, useRef, useState } from 'react'

export const PDP_TAB_PANEL =
  'mt-4 min-h-[96px] rounded-2xl border border-ink/[0.06] bg-ink/[0.015] p-4 text-sm leading-relaxed text-ink/70 motion-safe:[animation:tabFadeIn_0.18s_ease-out_both] sm:p-5'

export default function PdpTabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly T[]
  active: T
  onChange: (tab: T) => void
}) {
  const railRef = useRef<HTMLDivElement | null>(null)
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const rail = railRef.current
    const btn = btnRefs.current.get(active)
    if (!rail || !btn) return
    const r = rail.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    setIndicator({ left: b.left - r.left + rail.scrollLeft, width: b.width })
  }, [active, tabs])

  return (
    <div
      ref={railRef}
      className="relative flex gap-1 overflow-x-auto rounded-full bg-ink/[0.035] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {indicator && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-1 rounded-full bg-parchment shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-ink/[0.06] transition-[transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
        />
      )}
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          ref={(el) => {
            if (el) btnRefs.current.set(tab, el)
            else btnRefs.current.delete(tab)
          }}
          onClick={() => onChange(tab)}
          aria-pressed={active === tab}
          className={`relative z-10 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold sm:px-3.5 sm:text-sm transition-colors duration-200 ${
            active === tab ? 'text-ink' : 'text-ink/45 hover:text-ink/70'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
