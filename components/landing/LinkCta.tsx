'use client'

import { useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'

export default function LinkCta() {
  const [link, setLink] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (link) setSubmitted(true)
  }

  return (
    <section id="track" className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
      <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] border border-dashed border-ink/25 bg-card p-10 lg:flex-row lg:items-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-rust">Customs declaration</p>
          <h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">Have a product link?</h2>
          <p className="mt-1 text-sm text-ink/60">Paste it here and start your request.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink/15 bg-paper px-4">
            <Search size={16} className="text-muted" aria-hidden="true" />
            <input
              aria-label="Product link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="Paste a product link"
              className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted"
            />
          </div>
          <button
            type="submit"
            className="flex items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
          >
            {submitted ? 'Request started' : 'Submit request'} <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </section>
  )
}
