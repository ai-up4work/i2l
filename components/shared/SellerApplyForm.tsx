'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

export default function SellerApplyForm() {
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-start gap-3 py-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal/10 text-teal-deep">
          <CheckCircle2 size={22} />
        </div>
        <h2 className="font-display text-xl font-semibold text-ink">Application received</h2>
        <p className="max-w-md font-body text-sm text-ink/60">
          Our sales team reviews every application and will reach out by email or WhatsApp, usually
          within 3–5 business days, with next steps or follow-up questions.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <h2 className="font-display text-xl font-semibold text-ink">Tell us about your store</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-xs font-semibold text-ink/50">Store / business name</span>
          <input required type="text" className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal" placeholder="e.g. Skye Clothing" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-xs font-semibold text-ink/50">Contact person</span>
          <input required type="text" className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal" placeholder="Your name" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-xs font-semibold text-ink/50">Email</span>
          <input required type="email" className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal" placeholder="you@store.com" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-xs font-semibold text-ink/50">WhatsApp number</span>
          <input required type="tel" className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal" placeholder="+91 98765 43210" />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-body text-xs font-semibold text-ink/50">Store website or platform (Shopify, WooCommerce, Instagram, etc.)</span>
        <input required type="text" className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal" placeholder="https://" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-xs font-semibold text-ink/50">Primary category</span>
          <input type="text" className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal" placeholder="e.g. Fashion, Beauty, Electronics" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-xs font-semibold text-ink/50">Approximate monthly orders</span>
          <input type="text" className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal" placeholder="e.g. 50–100" />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-body text-xs font-semibold text-ink/50">Anything else we should know?</span>
        <textarea rows={4} className="resize-none rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal" placeholder="Optional" />
      </label>

      <label className="flex items-start gap-2.5 font-body text-xs text-ink/55">
        <input required type="checkbox" className="mt-0.5" />
        I confirm the information provided is accurate and agree to WishDrop's{' '}
        <a href="/terms" className="text-teal-deep underline underline-offset-2">Terms of Use</a>.
      </label>

      <button
        type="submit"
        className="mt-2 inline-flex w-fit items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-body text-sm font-semibold text-parchment transition-colors hover:bg-teal-deep"
      >
        Submit application
      </button>
    </form>
  )
}
