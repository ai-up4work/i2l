'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { testimonials } from './data'
import Image from 'next/image'

export default function Testimonials() {
  const [index, setIndex] = useState(0)

  function showPrevious() {
    setIndex((current) => (current - 1 + testimonials.length) % testimonials.length)
  }

  function showNext() {
    setIndex((current) => (current + 1) % testimonials.length)
  }

  return (
    <section className="bg-indigo-deep px-6 py-24 text-center text-parchment lg:px-10">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-3xl sm:text-4xl">What people are saying</h2>

        <div className="mt-8 flex justify-center gap-3">
          <button
            onClick={showPrevious}
            aria-label="Previous testimonial"
            className="grid h-10 w-10 place-items-center rounded-full border border-parchment/25 transition-colors hover:border-gold hover:text-gold"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={showNext}
            aria-label="Next testimonial"
            className="grid h-10 w-10 place-items-center rounded-full border border-parchment/25 transition-colors hover:border-gold hover:text-gold"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="mt-10 grid gap-5 text-left sm:grid-cols-3">
          {[0, 1, 2].map((offset) => {
            const testimonial = testimonials[(index + offset) % testimonials.length]
            return (
              <blockquote key={testimonial.name} className="rounded-2xl bg-indigo p-7">
                {/* Avatar + name side by side */}
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 flex-none overflow-hidden rounded-full border border-dashed border-gold/60">
                    <Image
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      width={48}
                      height={48}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <cite className="block font-body text-sm font-semibold not-italic text-parchment">
                      {testimonial.name}
                    </cite>
                    <div className="mt-0.5 flex gap-0.5 text-gold">
                      {Array.from({ length: 5 }).map((_, starIndex) => (
                        <Star key={starIndex} size={11} fill="currentColor" />
                      ))}
                    </div>
                  </div>
                </div>

                <p className="mt-5 min-h-[84px] font-body text-sm leading-relaxed text-parchment/85">
                  {testimonial.quote}
                </p>
              </blockquote>
            )
          })}
        </div>

        <a
          href="#"
          className="mt-10 inline-flex items-center gap-2 font-body font-semibold text-gold transition-colors hover:text-gold-deep"
        >
          <Star size={15} /> View more on Trustpilot
        </a>
      </div>
    </section>
  )
}