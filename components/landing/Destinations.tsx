'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react'
import { destinations } from './data'
import Image from 'next/image'

function Flag({
  code,
  className = '',
}: {
  code: string
  className?: string
}) {
  return (
    <Image
      src={`https://flagcdn.com/${code.toLowerCase()}.svg`}
      alt={`${code} flag`}
      fill
      className={`object-cover ${className}`}
      unoptimized
    />
  )
}

export default function Destinations() {
  const [index, setIndex] = useState(0)

  const visible = [0, 1, 2].map((offset) => destinations[(index + offset) % destinations.length])

  function showPrevious() {
    setIndex((current) => (current - 1 + destinations.length) % destinations.length)
  }

  function showNext() {
    setIndex((current) => (current + 1) % destinations.length)
  }

  return (
    <section id="destinations" className="bg-indigo px-6 py-12 text-parchment lg:px-10 lg:py-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex justify-end lg:hidden">
          <NavArrows onPrev={showPrevious} onNext={showNext} />
        </div>

        <div className="flex flex-col gap-0 lg:flex-row lg:items-center">
          <div className="w-full shrink-0 lg:w-[300px] mt-16">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Popular destinations
            </p>
            <h2 className="mt-3 font-display text-3xl leading-tight text-parchment sm:text-4xl">
              Explore top shopping destinations
            </h2>
            <p className="mt-3 font-body text-sm leading-relaxed text-parchment/60">
              Shop from leading stores in the world&rsquo;s most popular countries.
            </p>
            <a
              href="/account"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 font-body text-sm font-semibold text-ink transition-colors hover:bg-gold-deep"
            >
              Explore all destinations
            </a>
          </div>

          <div className="min-w-0 flex-1 sm:mt-8">
            <div className="mb-4 hidden justify-end lg:flex">
              <NavArrows onPrev={showPrevious} onNext={showNext} />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {visible.map((destination) => (
                <a
                  key={destination.code + destination.name}
                  href={`/destinations/${destination.code.toLowerCase()}`}
                  className="group w-full overflow-hidden rounded-lg shadow-lg shadow-indigo-deep/30 transition-transform duration-300 hover:-translate-y-1"
                >
                  <div className="relative aspect-[4/3.6] overflow-hidden rounded-t-full bg-indigo-deep">
                    <img
                      src={destination.img}
                      alt={destination.name}
                      className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-parchment/40 bg-indigo-deep/40 backdrop-blur">
                      <Flag code={destination.code} />
                    </span>
                  </div>

                  {/* Redesigned label: left accent bar, name/CTA split left-right */}
                  <div className="relative bg-card px-5 py-4">
                    <span className="absolute inset-y-0 left-0 w-1 bg-gold" />
                    <div className="flex items-center justify-between gap-3 pl-2">
                      <p className="font-display text-base font-semibold uppercase tracking-wide text-ink">
                        {destination.name}
                      </p>
                      <span className="flex shrink-0 items-center gap-1 font-body text-xs font-semibold uppercase tracking-wide text-teal transition-colors group-hover:text-teal-deep">
                        Shop
                        <ArrowUpRight
                          size={13}
                          className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        />
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function NavArrows({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onPrev}
        aria-label="Previous destination"
        className="grid h-9 w-9 place-items-center rounded-full border border-parchment/25 text-parchment transition-colors hover:border-gold hover:text-gold"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        onClick={onNext}
        aria-label="Next destination"
        className="grid h-9 w-9 place-items-center rounded-full border border-parchment/25 text-parchment transition-colors hover:border-gold hover:text-gold"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}