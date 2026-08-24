'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { testimonials } from './data'

export default function Testimonials() {
  const [index, setIndex] = useState(0)

  function showPrevious() {
    setIndex((current) => (current - 1 + testimonials.length) % testimonials.length)
  }

  function showNext() {
    setIndex((current) => (current + 1) % testimonials.length)
  }

  return (
    <section className="bg-blue px-6 py-24 text-center text-paper lg:px-10">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-3xl sm:text-4xl">What people are saying</h2>

        <div className="mt-8 flex justify-center gap-3">
          <button
            onClick={showPrevious}
            aria-label="Previous testimonial"
            className="grid h-10 w-10 place-items-center rounded-full border border-paper/25 transition-colors hover:border-paper/50"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={showNext}
            aria-label="Next testimonial"
            className="grid h-10 w-10 place-items-center rounded-full border border-paper/25 transition-colors hover:border-paper/50"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="mt-10 grid gap-5 text-left sm:grid-cols-3">
          {[0, 1, 2].map((offset) => {
            const testimonial = testimonials[(index + offset) % testimonials.length]
            return (
              <blockquote key={testimonial.name} className="rounded-2xl bg-blue-deep p-7">
                <div className="grid h-9 w-9 place-items-center rounded-full border border-dashed border-gold/60 font-display text-lg text-gold">
                  &rdquo;
                </div>
                <p className="mt-5 min-h-[84px] text-sm leading-relaxed text-paper/85">{testimonial.quote}</p>
                <div className="mt-4 flex gap-1 text-gold">
                  {Array.from({ length: 5 }).map((_, starIndex) => (
                    <Star key={starIndex} size={13} fill="currentColor" />
                  ))}
                </div>
                <cite className="mt-2 block text-xs font-semibold not-italic text-paper/70">{testimonial.name}</cite>
              </blockquote>
            )
          })}
        </div>

        <a href="#" className="mt-10 inline-flex items-center gap-2 font-semibold text-gold">
          <Star size={15} /> View more on Trustpilot
        </a>
      </div>
    </section>
  )
}
