'use client'

import { useMemo, useState } from 'react'
import PromoCodeCard from '@/components/shared/PromoCodeCard'
import { promoCodes } from './data'

export default function PromoCodesPage() {
  const categories = useMemo(() => ['All', ...Array.from(new Set(promoCodes.map((p) => p.category)))], [])
  const [activeCategory, setActiveCategory] = useState('All')

  const visible = activeCategory === 'All' ? promoCodes : promoCodes.filter((p) => p.category === activeCategory)

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8 lg:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Promo codes</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/60">
        Apply any available code at checkout on the Request Preview page.
      </p>

      <div className="mt-6 flex gap-6 overflow-x-auto border-b border-ink/10">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`whitespace-nowrap border-b-2 pb-3 text-sm font-semibold transition-colors ${
              activeCategory === category ? 'border-rust text-ink' : 'border-transparent text-ink/50 hover:text-ink'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        {visible.map((promo) => (
          <PromoCodeCard
            key={promo.code}
            tag={promo.category}
            discount={promo.discount}
            title={promo.title}
            code={promo.code}
            expiresOn={promo.expiresOn}
            disabled={promo.status !== 'Available'}
            statusLabel={promo.status !== 'Available' ? promo.status : undefined}
          />
        ))}
      </div>
    </div>
  )
}
