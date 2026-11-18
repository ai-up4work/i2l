'use client'

// components/shared/ChatWhatsAppNumber.tsx
//
// Small button + popover in the chat header, next to the WhatsApp icon.
// The signed-in customer gives their WhatsApp number and ticks consent to be
// messaged there. It's saved on their account as "given, not verified"
// (/api/account/whatsapp/claim); then "Verify on WhatsApp" opens WhatsApp
// with a pre-written message (name, handle, email, number, reference) that
// staff match to the account and confirm.

import { useEffect, useState } from 'react'
import { Check, Loader2, Phone, X } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { formatPhone, normalizeWhatsAppNumber } from '@/lib/whatsapp/verification'

type State = { verifiedPhone: string | null; suggestedPhone: string | null }

export default function ChatWhatsAppNumber() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State | null>(null)
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open || state) return
    fetch('/api/account/whatsapp/verification-request', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setState({ verifiedPhone: d.verifiedPhone ?? null, suggestedPhone: d.suggestedPhone ?? null })
        if (!phone && (d.request?.phone || d.suggestedPhone)) setPhone(d.request?.phone ?? d.suggestedPhone)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function save() {
    setError(null)
    if (!normalizeWhatsAppNumber(phone)) return setError('Enter a valid number, e.g. 077 123 4567 (or +91… / +44…).')
    if (!consent) return setError('Please tick the box to agree to be messaged on WhatsApp.')
    setBusy(true)
    try {
      const res = await fetch('/api/account/whatsapp/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, consent: true, explicit: true }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) return setError(d.error ?? 'Could not save your number.')
      setSaved(true)
    } finally {
      setBusy(false)
    }
  }

  // Starts a review request and opens WhatsApp with the message to send.
  async function verifyOnWhatsApp() {
    setError(null)
    setBusy(true)
    // Open the tab inside the click so mobile browsers don't block it.
    const win = window.open('about:blank', '_blank')
    try {
      const res = await fetch('/api/account/whatsapp/verification-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.link) {
        win?.close()
        return setError(d.error ?? 'Could not start verification.')
      }
      if (win) win.location.href = d.link
      else window.location.href = d.link
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Add your WhatsApp number"
        title="Add your WhatsApp number"
        className="rounded-full p-1.5 text-parchment/70 transition-colors hover:bg-parchment/10 hover:text-parchment"
      >
        <Phone size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-2xl border border-ink/10 bg-card p-4 text-ink shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <p className="font-display text-sm font-semibold">Get updates on WhatsApp</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-ink/40 hover:text-ink">
              <X size={14} />
            </button>
          </div>

          {state?.verifiedPhone ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-teal-deep">
              <Check size={14} /> {formatPhone(state.verifiedPhone)} is verified.
            </p>
          ) : (
            <>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  setSaved(false)
                }}
                placeholder="077 123 4567"
                className="mt-3 w-full rounded-xl border border-ink/15 bg-parchment px-3 py-2 text-sm focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20"
              />
              <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink/70">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                <span>I agree Wishdrop may message me on WhatsApp at this number about my requests and orders.</span>
              </label>
              {error && <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
              {!saved ? (
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-teal-deep py-2 text-sm font-semibold text-parchment disabled:opacity-50"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />} Save my number
                </button>
              ) : (
                <>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-teal-deep">
                    <Check size={13} /> Saved. Verify it so we can message you there.
                  </p>
                  <button
                    type="button"
                    onClick={verifyOnWhatsApp}
                    disabled={busy}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <FaWhatsapp size={15} />} Verify on WhatsApp
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
