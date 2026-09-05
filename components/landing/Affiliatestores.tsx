'use client'

import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { affiliatedStores } from '@/data/stores/data'

/* ============================================================================
 * AFFILIATE STORES STRIP
 * A dense trust-signal banner sitting right under the hero: real store
 * logos in a divided row, with a "View all stores" escape hatch. Pulls
 * from the same `affiliatedStores` array the /stores pages use, so new
 * marketplaces show up here automatically — no separate list to maintain.
 * ==========================================================================*/

// Marketplaces lead here since they're the most globally recognizable
// names for a first-time visitor. Swap/extend this filter if local
// sellers (GIVA, Chickadee, etc.) should also get a slot in the strip.
const featuredStores = affiliatedStores.filter((store) => store.storeType === 'marketplace')

function WaveMark() {
  // Small decorative squiggle, standing in for a "signal / discovery"
  // motif next to the section label — no meaning beyond decoration.
  return (
    <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden="true" className="shrink-0 text-ink/25">
      <path d="M1 3.5c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M1 8c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M1 12.5c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export default function AffiliateStores() {
  return (
    <section className="mx-auto max-w-7xl px-6 lg:px-10">
      <div className="overflow-hidden rounded-2xl border border-black/5 bg-parchment shadow-lift">
        <div className="flex items-center justify-between gap-4 px-6 py-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <WaveMark />
            <span className="font-body text-sm font-semibold text-ink">Our Affiliate Stores</span>
          </div>

          <a
            href="/stores"
            className="group inline-flex shrink-0 items-center gap-1.5 font-body text-sm font-semibold text-teal-deep transition-colors hover:text-indigo-deep"
          >
            View all stores
            <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </a>
        </div>

        <div className="flex flex-wrap items-stretch divide-x divide-ink/10 border-t border-black/5">
          {featuredStores.map((store) => (
            <a
              key={store.platform}
              href={`/stores/${store.platform}`}
              className="flex min-w-[130px] flex-1 items-center justify-center px-6 py-7 transition-colors duration-200 hover:bg-ink/[0.03] sm:px-8"
            >
              <Image
                src={store.logo}
                alt={store.name}
                width={110}
                height={32}
                className="h-6 w-auto object-contain opacity-80 grayscale transition-all duration-200 hover:opacity-100 hover:grayscale-0 sm:h-7"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}