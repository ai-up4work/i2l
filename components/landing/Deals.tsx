'use client'

import { useState } from 'react'
import { guides } from './data'

type GuideTab = 'guides' | 'offers'

export default function Deals() {
  const [tab, setTab] = useState<GuideTab>('guides')

  const filtered = tab === 'guides' ? guides.filter((g) => g.tag !== 'Offers') : guides.filter((g) => g.tag === 'Offers')

  return (
    <section id="shopping" className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-4xl text-ink sm:text-5xl">Fresh deals &amp; guides</h2>

        <div className="flex gap-1.5 rounded-full bg-ink/5 p-1.5">
          {(['guides', 'offers'] as GuideTab[]).map((option) => (
            <button
              key={option}
              onClick={() => setTab(option)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                tab === option ? 'bg-paper text-ink shadow-sm' : 'text-ink/60 hover:text-ink'
              }`}
            >
              {option === 'guides' ? 'Shopping guides' : 'Offers & notices'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((guide) => (
          <article key={guide.title} className="overflow-hidden rounded-2xl border border-ink/10">
            <img src={guide.img} alt="" className="h-40 w-full object-cover" />
            <div className="p-5">
              <span className="font-mono text-[11px] uppercase tracking-widest text-rust">{guide.meta}</span>
              <h3 className="mt-2 font-display text-base leading-snug text-ink">{guide.title}</h3>
            </div>
          </article>
        ))}
      </div>

      <a
        href="#"
        className="mx-auto mt-10 flex w-max items-center gap-2 rounded-full border-2 border-ink px-7 py-3 text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-paper"
      >
        View more
      </a>
    </section>
  )
}
