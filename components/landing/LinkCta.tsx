'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Link2, Search } from 'lucide-react'
import { pathForView } from '@/components/dashboard/routes'

export default function LinkCTA() {
  const router = useRouter()
  const [link, setLink] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const trimmed = link.trim()
    if (!trimmed || submitted) return

    setSubmitted(true)

    // LinkCTA renders on the public landing page, outside app/account/layout.tsx,
    // so DashboardProvider (and useDashboard) isn't available here. Pass the
    // link via a query param instead — NewRequestPage reads it back out once
    // it's mounted inside the provider and calls setPastedLink itself.
    window.setTimeout(() => {
      router.push(`${pathForView('addRequest')}?link=${encodeURIComponent(trimmed)}`)
    }, 500)
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        {/* Gift banner */}
        <div className="relative h-full overflow-hidden rounded-[28px] bg-ink px-10 py-12 text-parchment">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gold/10 blur-3xl" aria-hidden="true" />

          <div className="relative">
            <h3 className="font-display text-2xl sm:text-3xl">
              Welcome gift: <em className="not-italic text-gold">sign up for Rs 1,200 off</em>
            </h3>
            <p className="mt-2 max-w-md font-body text-sm text-parchment/60">
              New here? You&apos;ll get money off shipping for your first order.
            </p>
            <a
              href="/account"
              className="mt-6 inline-flex rounded-full bg-gold px-7 py-3 font-body text-sm font-semibold text-ink transition-colors hover:bg-gold-deep"
            >
              Sign up
            </a>
          </div>
        </div>

        {/* Link CTA */}
        <div className="relative flex h-full flex-col items-start justify-between gap-6 overflow-hidden rounded-[28px] border border-dashed border-ink/25 bg-card p-10 transition-colors duration-300 hover:border-gold/60">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-3xl" aria-hidden="true" />

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

          <form onSubmit={handleSubmit} className="relative flex w-full max-w-md flex-col gap-3 sm:flex-row">
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
      </div>
    </section>
  )
}