'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'

const topics = [
  'An existing request or order',
  'Shipping, customs, or delivery',
  'Billing, refunds, or credits',
  'Becoming a Wishdrop seller',
  'Something else',
]

export default function ContactForm() {
  const [submitted, setSubmitted] = useState(false)
  const [topic, setTopic] = useState(topics[0])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-start gap-3 py-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal/10 text-teal-deep">
          <Send size={20} />
        </div>
        <h2 className="font-display text-xl font-semibold text-ink">Message sent</h2>
        <p className="font-body text-sm text-ink/60">
          Thanks — our support team will get back to you shortly, usually within one business day.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <h2 className="font-display text-xl font-semibold text-ink">Send a message</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-xs font-semibold text-ink/50">Full name</span>
          <input
            required
            type="text"
            className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal"
            placeholder="Your name"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-xs font-semibold text-ink/50">Email</span>
          <input
            required
            type="email"
            className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal"
            placeholder="you@example.com"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-body text-xs font-semibold text-ink/50">Order number (optional)</span>
        <input
          type="text"
          className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal"
          placeholder="e.g. WD-238491"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-body text-xs font-semibold text-ink/50">What's this about?</span>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal"
        >
          {topics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-body text-xs font-semibold text-ink/50">Message</span>
        <textarea
          required
          rows={5}
          className="resize-none rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none focus:border-teal"
          placeholder="Tell us what's going on..."
        />
      </label>

      <button
        type="submit"
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-body text-sm font-semibold text-parchment transition-colors hover:bg-teal-deep"
      >
        <Send size={15} />
        Send message
      </button>
    </form>
  )
}
