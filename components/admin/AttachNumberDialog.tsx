'use client'

// components/admin/AttachNumberDialog.tsx
//
// Staff attach a WhatsApp number to an existing customer account. Paste a
// number — or a whole WhatsApp message / contact card / wa.me link — and the
// number is read out of it. If someone already has that number, they're
// shown so staff can pick them in one tap; otherwise search for the account.
// "Mark as verified" is on by default (staff saw the number on WhatsApp).

import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import CustomerPicker, { adminInputClass, type PickedCustomer } from '@/components/admin/CustomerPicker'
import { extractPhoneNumbers } from '@/lib/whatsapp/extract-phone'
import { formatPhone } from '@/lib/whatsapp/verification'

type Found = { id: string; name: string; email: string; handle: string | null; phone: string | null; verified: boolean }

export default function AttachNumberDialog({
  customer,
  initialText,
  onClose,
  onDone,
}: {
  customer?: PickedCustomer | null
  initialText?: string
  onClose: () => void
  onDone?: (phone: string) => void
}) {
  const [text, setText] = useState(initialText ?? '')
  const [picked, setPicked] = useState<PickedCustomer[]>(customer ? [customer] : [])
  const [verified, setVerified] = useState(true)
  const [replace, setReplace] = useState(false)
  const [accounts, setAccounts] = useState<Found[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsReplace, setNeedsReplace] = useState(false)

  const numbers = extractPhoneNumbers(text)
  const [chosen, setChosen] = useState<string | null>(null)
  const phone = chosen && numbers.includes(chosen) ? chosen : (numbers[0] ?? null)
  const target = picked[0] ?? null

  // Accounts that already hold this number.
  useEffect(() => {
    if (!phone) {
      setAccounts([])
      return
    }
    let live = true
    fetch(`/api/admin/customers/phone?q=${encodeURIComponent(phone)}`)
      .then((r) => r.json())
      .then((d) => live && setAccounts(d.accounts ?? []))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [phone])

  // The customer's WhatsApp message includes their email (the chat's WhatsApp
  // button writes it). If one is pasted, look the account up and pick it.
  useEffect(() => {
    if (picked.length) return
    const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0]
    if (!email) return
    let live = true
    fetch(`/api/admin/push/customers?q=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => {
        const hit = (d.customers ?? []).find((c: PickedCustomer) => c.email.toLowerCase() === email.toLowerCase())
        if (live && hit) setPicked([hit])
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [text, picked.length])

  async function save() {
    if (!phone || !target) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/customers/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: target.id, phone, verified, replace }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNeedsReplace(!!d.needsReplace)
        setError(d.error ?? 'Could not save the number.')
        return
      }
      onDone?.(d.phone ?? phone)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">Attach a WhatsApp number</h2>
            <p className="mt-1 text-xs text-ink/55">Paste the number, or the whole WhatsApp message. We&rsquo;ll find the number in it, and the account if the message has their email.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5">
            <X size={16} />
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="e.g. 077 123 4567, or paste: “Hi, this is Maya, my number is +94 77 123 4567”"
          className={`${adminInputClass} mt-4`}
        />
        {numbers.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-ink/50">Found:</span>
            {numbers.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setChosen(n)}
                className={`rounded-full border px-2.5 py-1 font-semibold ${n === phone ? 'border-teal bg-teal/10 text-teal-deep' : 'border-ink/15 text-ink/60'}`}
              >
                {formatPhone(n)}
              </button>
            ))}
          </div>
        ) : (
          text.trim() && <p className="mt-2 text-xs text-red-700">No valid number found yet.</p>
        )}

        {accounts.length > 0 && (
          <div className="mt-3 rounded-xl border border-gold/40 bg-gold/10 p-3 text-xs">
            <p className="font-semibold text-ink">Already on an account:</p>
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setPicked([{ id: a.id, name: a.name, email: a.email, phone: a.phone, handle: a.handle }])}
                className="mt-1.5 block w-full rounded-lg bg-card px-3 py-2 text-left hover:bg-parchment"
              >
                <span className="font-semibold">{a.name || a.email}</span> · {a.email} {a.verified ? '· verified' : '· not verified'}
              </button>
            ))}
          </div>
        )}

        <p className="mb-1.5 mt-4 text-xs font-semibold text-ink/60">Customer account</p>
        <CustomerPicker picked={picked} onChange={(c) => setPicked(c.slice(-1))} />

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-1" />
          <span>
            Mark as verified
            <span className="block text-xs text-ink/50">Tick when you saw this number message us on WhatsApp. Untick to just save it.</span>
          </span>
        </label>
        {needsReplace && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Replace their current verified number
          </label>
        )}

        {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !phone || !target}
            className="inline-flex items-center gap-2 rounded-full bg-teal px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Attach number
          </button>
        </div>
      </div>
    </div>
  )
}
