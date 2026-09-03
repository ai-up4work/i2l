'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import PromoCodeCard from '@/components/shared/PromoCodeCard'
import { promoCodes } from './data'

export default function PromoCodesPage() {
  const categories = useMemo(() => ['All', ...Array.from(new Set(promoCodes.map((p) => p.category)))], [])
  const [activeCategory, setActiveCategory] = useState('All')

  const visible = activeCategory === 'All' ? promoCodes : promoCodes.filter((p) => p.category === activeCategory)

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const activeIndex = categories.findIndex((c) => c === activeCategory)
    const el = tabRefs.current[activeIndex]
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth })
  }, [activeCategory, categories])

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8 lg:px-10">
      <h1 className="text-4xl font-extrabold tracking-tight text-ink">Promo codes</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/60">
        Apply any available code at checkout on the Request Preview page.
      </p>

      {/* Segmented pill tabs with a sliding active indicator */}
      <div className="relative mt-6 flex gap-1 overflow-x-auto rounded-full bg-ink/[0.04] p-1.5">
        <span
          className="absolute inset-y-1.5 rounded-full bg-card shadow-sm transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
          style={{ left: indicator.left, width: indicator.width }}
          aria-hidden
        />
        {categories.map((category, i) => {
          const isActive = activeCategory === category
          return (
            <button
              key={category}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              onClick={() => setActiveCategory(category)}
              className={`relative z-10 shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 ${
                isActive ? 'text-ink' : 'text-ink/50 hover:text-ink/80'
              }`}
            >
              {category}
            </button>
          )
        })}
      </div>

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        {visible.map((promo, i) => (
          <div
            key={promo.code}
            className="motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <PromoCodeCard
              tag={promo.category}
              discount={promo.discount}
              title={promo.title}
              code={promo.code}
              expiresOn={promo.expiresOn}
              disabled={promo.status !== 'Available'}
              statusLabel={promo.status !== 'Available' ? promo.status : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  )
}