'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { steps } from './data'

type PurchaseMode = 'forward' | 'proxy'

export default function HowItWorks() {
  const [mode, setMode] = useState<PurchaseMode>('forward')

  return (
    <section id="how" className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-rust">Start your</p>
      <h2 className="mt-4 font-display text-4xl text-ink sm:text-5xl">
        <em className="not-italic text-blue">Next purchase</em> with us
      </h2>

      <div className="mt-8 inline-flex rounded-full bg-ink/5 p-1.5">
        {(['forward', 'proxy'] as PurchaseMode[]).map((option) => (
          <button
            key={option}
            onClick={() => setMode(option)}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
              mode === option ? 'bg-ink text-paper' : 'text-ink/60 hover:text-ink'
            }`}
          >
            {option === 'forward' ? 'Parcel Forwarding' : 'Proxy Shopping'}
          </button>
        ))}
      </div>

      {/* Ticket-stub steps, joined by a perforated line — order carries real
          meaning here, so numbering the stops is earned, not decorative. */}
      <div className="relative mt-14 grid gap-6 lg:grid-cols-4">
        <div
          className="pointer-events-none absolute left-0 right-0 top-1/2 hidden -translate-y-1/2 border-t border-dashed border-ink/15 lg:block"
          aria-hidden="true"
        />
        {steps.map((step, stepIndex) => (
          <div key={step.title} className="relative rounded-2xl border border-dashed border-ink/20 bg-card p-7">
            <span className="absolute -left-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 rounded-full bg-paper lg:block" aria-hidden="true" />
            <p className="font-mono text-xs text-rust">0{stepIndex + 1}</p>
            <h3 className="mt-4 font-display text-lg text-ink">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">{step.text}</p>
          </div>
        ))}
      </div>

      <a
        href="/account"
        className="mx-auto mt-12 flex w-max items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
      >
        Sign up now <ArrowRight size={16} />
      </a>
    </section>
  )
}
