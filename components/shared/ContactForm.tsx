// components/shared/ContactForm.tsx
//
// Contact form → WhatsApp. The form used to show "Message sent" without
// sending anything. Now it composes the customer's message (name, topic,
// order number, message) and opens a WhatsApp chat with our business
// number, ready to send — the same number the chat widget hands over to
// (NEXT_PUBLIC_WHATSAPP_NUMBER, lib/chat/waLink.ts). Nothing is stored;
// the conversation lives in WhatsApp where the team already works.
'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { buildWhatsAppLink } from '@/lib/chat/waLink'

const topics = [
  'An existing request or order',
  'Shipping, customs, or delivery',
  'Billing, refunds, or coupons',
  'Whether you can get an item',
  'Becoming a Wishdrop seller',
  'Something else',
]

const fieldClass =
  'rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 font-body text-sm text-ink outline-none transition-colors focus:border-teal'

export default function ContactForm() {
  const [name, setName] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [topic, setTopic] = useState(topics[0])
  const [message, setMessage] = useState('')
  const [opened, setOpened] = useState(false)

  const composed = [
    `Hi Wishdrop, this is ${name.trim() || 'a customer'}.`,
    `Topic: ${topic}`,
    orderNo.trim() ? `Order: ${orderNo.trim().toUpperCase()}` : null,
    '',
    message.trim(),
  ]
    .filter((line) => line !== null)
    .join('\n')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !message.trim()) return
    window.open(buildWhatsAppLink(null, composed), '_blank', 'noopener,noreferrer')
    setOpened(true)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Message us on WhatsApp</h2>
        <p className="mt-1 font-body text-sm text-ink/55">
          Fill this in and we&apos;ll open WhatsApp with your message ready to send. Replies usually within one business day.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-xs font-semibold text-ink/50">Your name</span>
          <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Your name" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-xs font-semibold text-ink/50">Order number (optional)</span>
          <input type="text" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} className={fieldClass} placeholder="e.g. WD-10423" />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-body text-xs font-semibold text-ink/50">What&apos;s this about?</span>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className={fieldClass}>
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
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${fieldClass} resize-none`}
          placeholder="Tell us what's going on, or paste the link of an item you're asking about…"
        />
      </label>

      <button
        type="submit"
        disabled={!name.trim() || !message.trim()}
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#1f8f4e] px-6 py-3 font-body text-sm font-semibold text-white transition-colors hover:bg-[#177540] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MessageCircle size={16} />
        Continue on WhatsApp
      </button>

      {opened && (
        <p className="rounded-xl bg-teal/[0.06] px-4 py-3 font-body text-sm text-ink/70 ring-1 ring-teal/15">
          WhatsApp should have opened in a new tab with your message. Tap <span className="font-semibold">Send</span> there
          to reach us. Didn&apos;t open?{' '}
          <a href={buildWhatsAppLink(null, composed)} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-deep underline">
            Open WhatsApp
          </a>
          .
        </p>
      )}
    </form>
  )
}
