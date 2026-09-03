// InfoRail.tsx
'use client';

import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import Image from 'next/image'

type Partner = {
  name: string
  logo: string
  href?: string
}

// Add/remove partners here — nothing else needs to change.
const PARTNERS: Partner[] = [
  { name: 'eBay', logo: '/logos/ebay.png', href: '/stores/ebay' },
  { name: 'Amazon', logo: '/logos/amazon.png', href: '/stores/amazon' },
  { name: 'flipkart', logo: '/logos/flipkart.png', href: '/stores/flipkart' },
]

const AUTO_ADVANCE_MS = 4000

function PartnerCarousel({ partners }: { partners: Partner[] }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (partners.length <= 1) return
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % partners.length)
    }, AUTO_ADVANCE_MS)
    return () => clearInterval(id)
  }, [partners.length])

  if (partners.length === 0) return null

  const current = partners[index]

  return (
    <div>
      <div className="mt-2 grid h-[90px] place-items-center rounded-xl border border-ink/10 bg-parchment overflow-hidden">
        <Image
          key={current.logo}
          src={current.logo}
          alt={`${current.name} logo`}
          width={120}
          height={40}
          className="h-12 w-auto object-contain animate-[fadeIn_0.3s_ease]"
        />
      </div>

      {partners.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {partners.map((p, i) => (
            <button
              key={p.name}
              type="button"
              aria-label={`Show ${p.name}`}
              onClick={() => setIndex(i)}
              className={
                'h-1.5 rounded-full transition-all ' +
                (i === index ? 'w-4 bg-teal-deep' : 'w-1.5 bg-ink/15 hover:bg-ink/25')
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function InfoRail() {
  return (
    <aside className="flex flex-col gap-5 lg:w-[330px] lg:flex-none pt-0 lg:pt-[188px]">
      <div className="rounded-2xl border border-ink/10 bg-card pb-6 px-6 pt-3">
        <h3 className="flex items-center justify-between font-display text-lg text-ink">
          Official partners
        </h3>

        <PartnerCarousel partners={PARTNERS} />

        <p className="mt-4 text-sm leading-relaxed text-ink/60">
          Official marketplace partners — shop with ease and ship straight to your door.
        </p>

        <a href="/stores" className="mt-3 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-teal-deep">
          Explore products <ChevronRight size={15} />
        </a>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-card p-6">
        <h3 className="font-display text-lg text-ink">Relevant information</h3>
        <div className="mt-2 flex flex-col gap-2.5">
          <a
            href="/prohibited-items"
            className="flex items-center justify-between rounded-xl border border-ink/10 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-ink/5"
          >
            Prohibited items <ChevronRight size={16} className="text-ink/45" />
          </a>
        </div>
      </div>
    </aside>
  )
}