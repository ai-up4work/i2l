'use client'

// components/account/WhatsAppVerification.tsx
//
// The "WhatsApp Number" row on My Profile. Staff-reviewed verification
// (no Meta API): the customer enters their number, sends a pre-written
// message to our WhatsApp, and staff confirm it on
// /admin/whatsapp-verifications. See
// data/Wishdrop-whatsapp-manual-verification.sql for the full flow.
//
// States: loading → (verified | pending | rejected | none), plus an
// "editing" mode for entering or changing the number.

import { useCallback, useEffect, useState } from 'react'
import { Clock, MessageCircle } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { useAuth } from '@/contexts/AuthContext'
import { formatPhone } from '@/lib/whatsapp/verification'

interface RequestInfo {
  id: string
  phone: string
  reference: string
  status: 'pending' | 'verified' | 'rejected' | 'cancelled'
  rejectReason: string | null
  createdAt: string
}

interface State {
  verifiedPhone: string | null
  request: RequestInfo | null
  link?: string
  suggestedPhone: string | null
}

const btnOutline =
  'rounded-xl border border-teal/30 bg-teal/[0.04] px-4 py-2 text-sm font-semibold text-teal-deep transition-colors hover:border-teal/50 hover:bg-teal/10 disabled:cursor-not-allowed disabled:opacity-50'
const btnSolid =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-50'
const btnQuiet = 'text-sm font-semibold text-ink/50 transition-colors hover:text-ink disabled:opacity-50'

export default function WhatsAppVerification() {
  const { refreshUser } = useAuth()
  const [state, setState] = useState<State | null>(null)
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/whatsapp/verification-request', { cache: 'no-store' })
      if (!res.ok) return
      const data: State = await res.json()
      setState((prev) => {
        // Staff just verified it → refresh the session so the rest of the
        // app (banners, chat) sees the verified number too.
        if (prev?.request?.status === 'pending' && data.request?.status === 'verified') {
          refreshUser().catch(() => {})
        }
        return data
      })
    } catch {
      /* keep last known state */
    }
  }, [refreshUser])

  useEffect(() => {
    load()
  }, [load])

  const pending = state?.request?.status === 'pending' ? state.request : null

  // While waiting on staff, check back periodically and when the tab
  // regains focus (e.g. returning from WhatsApp).
  useEffect(() => {
    if (!pending) return
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    const t = setInterval(load, 20_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(t)
    }
  }, [pending, load])

  const startEditing = () => {
    setError(null)
    setInput(pending?.phone ? formatPhone(pending.phone) : state?.suggestedPhone ? formatPhone(state.suggestedPhone) : '')
    setEditing(true)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/account/whatsapp/verification-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: input }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.')
      setState((s) => ({ ...(s as State), request: data.request, link: data.link }))
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    setBusy(true)
    await fetch('/api/account/whatsapp/verification-request', { method: 'DELETE' }).catch(() => {})
    await load()
    setBusy(false)
  }

  // ── Layout: same row style as the other Account security rows ──
  let body: React.ReactNode
  let action: React.ReactNode = null

  if (!state) {
    body = 'Checking…'
  } else if (editing) {
    body = (
      <div>
        <p>
          Enter the number you use on WhatsApp. Next, we&rsquo;ll open WhatsApp with a short message for you to send us
          — our team checks it and verifies your number, usually within a few hours.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="077 123 4567"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && input.trim() && !busy && submit()}
            className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/60 focus:ring-2 focus:ring-teal/10"
            aria-label="WhatsApp number"
          />
          <div className="flex items-center gap-3">
            <button type="button" onClick={submit} disabled={busy || !input.trim()} className={btnSolid}>
              {busy ? 'One moment…' : 'Next'}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={busy} className={btnQuiet}>
              Cancel
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink/45">Numbers outside Sri Lanka: include the country code, e.g. +91…</p>
      </div>
    )
  } else if (pending) {
    body = (
      <div>
        <p className="flex items-center gap-1.5 font-semibold text-ink/75">
          <Clock size={14} aria-hidden="true" /> Waiting for our team to confirm {formatPhone(pending.phone)}
        </p>
        <p className="mt-1">
          If you haven&rsquo;t yet, send us the WhatsApp message <strong>from {formatPhone(pending.phone)}</strong>. It
          includes your reference{' '}
          <span className="whitespace-nowrap font-mono font-semibold text-ink/75">{pending.reference}</span>.
          We&rsquo;ll let you know here once it&rsquo;s verified.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {state.link && (
            <a href={state.link} target="_blank" rel="noopener noreferrer" className={btnSolid}>
              <FaWhatsapp size={16} aria-hidden="true" />
              Send on WhatsApp
            </a>
          )}
          <button type="button" onClick={startEditing} disabled={busy} className={btnQuiet}>
            Change number
          </button>
          <button type="button" onClick={cancel} disabled={busy} className={btnQuiet}>
            Cancel request
          </button>
        </div>
      </div>
    )
  } else if (state.verifiedPhone) {
    body = `We’ll use ${formatPhone(state.verifiedPhone)} to reach you about your orders on WhatsApp.`
    action = (
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-teal/12 px-2.5 py-1 text-[11px] font-semibold text-teal-deep">Verified</span>
        <button type="button" onClick={startEditing} className={btnQuiet}>
          Change
        </button>
      </div>
    )
  } else if (state.request?.status === 'rejected') {
    body = (
      <div>
        <p className="font-semibold text-red-700">We couldn&rsquo;t verify {formatPhone(state.request.phone)}.</p>
        {state.request.rejectReason && <p className="mt-1">{state.request.rejectReason}</p>}
      </div>
    )
    action = (
      <button type="button" onClick={startEditing} className={btnOutline}>
        Try again
      </button>
    )
  } else {
    body =
      'Add your WhatsApp number so we can reach you about your orders — even when you’re not on the site.'
    action = (
      <button type="button" onClick={startEditing} className={btnOutline}>
        Add
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4 border-b border-ink/10 py-6 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 font-semibold text-ink">
          <MessageCircle size={17} strokeWidth={1.75} className="text-ink/40" aria-hidden="true" />
          WhatsApp Number
        </div>
        <div className="mt-1.5 text-sm leading-relaxed text-ink/60">
          {body}
          {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
        </div>
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  )
}
