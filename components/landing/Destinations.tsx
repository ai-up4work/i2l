'use client'

import { useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, Plane } from 'lucide-react'
import { destinations } from './data'

export default function Destinations() {
  const [index, setIndex] = useState(0)

  const visible = [0, 1, 2, 3].map((offset) => destinations[(index + offset) % destinations.length])

  function showPrevious() {
    setIndex((current) => (current - 1 + destinations.length) % destinations.length)
  }

  function showNext() {
    setIndex((current) => (current + 1) % destinations.length)
  }

  return (
    <section id="destinations" className="bg-blue-deep px-6 py-24 text-paper lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-lg">
            <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-gold">
              <Plane size={14} aria-hidden="true" /> Flight paths
            </p>
            <h2 className="mt-4 font-display text-4xl sm:text-5xl">Your next shopping destination</h2>
            <p className="mt-4 leading-relaxed text-paper/70">
              Unlock bigger discounts, access exclusive items, and save on shipping
              effortlessly &mdash; wherever the parcel starts its trip.
            </p>
            <a
              href="/account"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-gold/90"
            >
              Calculate shipping rate <ArrowRight size={16} />
            </a>
          </div>

          <div className="flex gap-3">
            <button
              onClick={showPrevious}
              aria-label="Previous destination"
              className="grid h-11 w-11 place-items-center rounded-full border border-paper/25 text-paper transition-colors hover:border-paper/50"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={showNext}
              aria-label="Next destination"
              className="grid h-11 w-11 place-items-center rounded-full border border-paper/25 text-paper transition-colors hover:border-paper/50"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="relative mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Dashed route line running behind the cards — the flight-path motif */}
          <div
            className="pointer-events-none absolute left-0 right-0 top-1/2 hidden h-px -translate-y-1/2 border-t border-dashed border-gold/40 lg:block"
            aria-hidden="true"
          />
          {visible.map((destination) => (
            <div
              key={destination.code + destination.name}
              className="group relative aspect-[4/5] overflow-hidden rounded-2xl"
            >
              <img
                src={destination.img}
                alt={destination.name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
              <span className="absolute bottom-4 left-4 font-display text-lg text-paper">
                {destination.name}
              </span>
              <span className="absolute right-4 top-4 rounded-full border border-paper/30 bg-ink/30 px-2 py-1 font-mono text-[10px] tracking-widest text-paper/80 backdrop-blur">
                {destination.code}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
