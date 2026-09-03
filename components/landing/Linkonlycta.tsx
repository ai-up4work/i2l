// LinkOnlyCTA.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Link2, Search } from 'lucide-react'
import { pathForView } from '@/components/dashboard/routes'

export default function LinkOnlyCTA() {
  const router = useRouter()
  const [link, setLink] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const trimmed = link.trim()
    if (!trimmed || submitted) return

    setSubmitted(true)

    // Renders on the public landing page, outside app/account/layout.tsx,
    // so DashboardProvider (and useDashboard) isn't available here. Pass the
    // link via a query param instead — NewRequestPage reads it back out once
    // it's mounted inside the provider and calls setPastedLink itself.
    window.setTimeout(() => {
      router.push(`${pathForView('addRequest')}?link=${encodeURIComponent(trimmed)}`)
    }, 500)
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
      <div className="relative flex flex-col items-start gap-6 overflow-hidden rounded-[28px] border border-dashed border-ink/25 bg-card p-10 transition-colors duration-300 hover:border-gold/60 sm:flex-row sm:items-center sm:justify-between">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-indigo/10 blur-3xl" aria-hidden="true" />

        <div className="relative flex items-start gap-4">
          <div className="hidden h-12 w-12 flex-none place-items-center rounded-2xl bg-gold/10 text-gold-deep sm:grid">
            <Link2 size={20} aria-hidden="true" />
          </div>
          <div>
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
              Customs declaration
            </p>
            <h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">Have a product link?</h2>
            <p className="mt-1 font-body text-sm text-ink/60">Paste it here and start your request.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="relative flex w-full max-w-md flex-none flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink/15 bg-parchment px-4 transition-colors duration-200 focus-within:border-teal">
            <Search size={16} className="text-ink/40" aria-hidden="true" />
            <input
              aria-label="Product link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="Paste a product link"
              disabled={submitted}
              className="w-full bg-transparent py-3 font-body text-sm text-ink outline-none placeholder:text-ink/40 disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={submitted || !link.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3 font-body text-sm font-semibold text-parchment transition-all duration-200 hover:bg-teal-deep active:scale-95 disabled:cursor-default disabled:bg-teal disabled:active:scale-100"
          >
            {submitted ? (
              <>
                Request started <Check size={16} />
              </>
            ) : (
              <>
                Submit request <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </div>
    </section>
  )
}