// app/admin/(protected)/(common)/whatsapp-verifications/page.tsx
//
// Staff review of customer WhatsApp numbers (no Meta API). Customers send
// a pre-written WhatsApp message containing a reference; staff find it in
// the WhatsApp app, confirm it came FROM the number shown, and verify —
// or attach the real sender number, or reject with a reason.
//
// Manager, Sales and Super Admin (enforced again by the API).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy, Loader2, X } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { useCurrentStaff } from '@/hooks/useCurrentStaff'
import { formatPhone, REJECT_REASONS } from '@/lib/whatsapp/verification'

interface Req {
  id: string
  reference: string
  phone: string
  status: 'pending' | 'verified' | 'rejected'
  verifiedPhone: string | null
  rejectReason: string | null
  decidedBy: string | null
  createdAt: string
  decidedAt: string | null
  customer: { id: string; name: string; email: string; handle: string | null; currentVerifiedPhone: string | null }
  conflict: { name: string; email: string } | null
}

const df = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short' })

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** Lets the sidebar badge refresh right away after a decision. */
function announceChange() {
  window.dispatchEvent(new Event('wd:wa-verifications-changed'))
}

export default function WhatsAppVerificationsPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()
  const allowed = staff && ['manager', 'sales', 'super_admin'].includes(staff.role)

  const [view, setView] = useState<'pending' | 'history'>('pending')
  const [rows, setRows] = useState<Req[] | null>(null)
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [listRes, countRes] = await Promise.all([
        fetch(`/api/admin/whatsapp-verifications?view=${view}`, { cache: 'no-store' }),
        fetch('/api/admin/whatsapp-verifications?countOnly=1', { cache: 'no-store' }),
      ])
      const list = await listRes.json()
      if (!listRes.ok) throw new Error(list.error || 'Could not load requests.')
      setRows(list.requests)
      if (countRes.ok) setPendingCount((await countRes.json()).pending)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load requests.')
    }
  }, [view])

  useEffect(() => {
    if (!allowed) return
    setRows(null)
    load()
  }, [allowed, load])

  // New requests arrive while the page is open.
  useEffect(() => {
    if (!allowed || view !== 'pending') return
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [allowed, view, load])

  const onDecided = (id: string, message: string) => {
    setRows((r) => r?.filter((x) => x.id !== id) ?? null)
    setPendingCount((c) => (c ? c - 1 : c))
    setNotice(message)
    announceChange()
  }

  if (staffLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-parchment">
        <Loader2 className="animate-spin text-ink/30" />
      </div>
    )
  }
  if (!allowed) {
    return (
      <div className="h-full overflow-y-auto bg-parchment px-6 pt-16 font-body text-ink lg:px-10">
        <h1 className="font-display text-3xl">WhatsApp verification</h1>
        <p className="mt-2 text-sm text-ink/60">Only managers and sales staff can verify customer numbers.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-4xl px-6 pb-24 pt-10 lg:px-10">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-teal-deep text-parchment">
            <FaWhatsapp size={20} />
          </span>
          <div>
            <h1 className="font-display text-3xl leading-tight">WhatsApp verification</h1>
            <p className="text-sm text-ink/60">Customers verify their number by sending us a WhatsApp message.</p>
          </div>
        </div>

        <ol className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
          {[
            ['Find the message', 'In the Wishdrop WhatsApp, search for the reference (e.g. WD-7K3D9Q).'],
            ['Check the sender', 'The number WhatsApp shows it came FROM must match the number here.'],
            ['Decide', 'Verify. If they sent it from another number, attach that one instead. Otherwise reject.'],
          ].map(([title, text], i) => (
            <li key={title} className="flex gap-3 rounded-xl border border-ink/10 bg-card p-4">
              <span className="flex size-6 flex-none items-center justify-center rounded-full bg-teal text-xs font-bold text-white">
                {i + 1}
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="text-ink/60">{text}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex items-center gap-1 border-b border-ink/10" role="tablist">
          {(['pending', 'history'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => {
                setNotice(null)
                setView(v)
              }}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                view === v ? 'border-teal-deep text-ink' : 'border-transparent text-ink/50 hover:text-ink'
              }`}
            >
              {v === 'pending' ? `Waiting${pendingCount ? ` (${pendingCount})` : ''}` : 'History'}
            </button>
          ))}
        </div>

        {notice && (
          <p role="status" className="mt-5 rounded-xl bg-teal/10 px-4 py-3 text-sm font-semibold text-teal-deep">
            {notice}
          </p>
        )}
        {loadError && <p className="mt-5 text-sm font-semibold text-red-600">{loadError}</p>}

        {rows === null && !loadError ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-ink/30" />
          </div>
        ) : rows && rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink/50">
            {view === 'pending' ? 'No numbers waiting. New requests appear here automatically.' : 'Nothing decided yet.'}
          </p>
        ) : view === 'pending' ? (
          <div className="mt-6 space-y-4">
            {rows?.map((r) => <PendingCard key={r.id} req={r} onDecided={onDecided} />)}
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="whitespace-nowrap border-b border-ink/10 text-xs text-ink/50">
                <tr>
                  <th className="px-5 py-3 font-semibold">Decided</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Number</th>
                  <th className="px-5 py-3 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {rows?.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-5 py-4 text-ink/60">
                      {r.decidedAt ? df.format(new Date(r.decidedAt)) : '—'}
                      {r.decidedBy && <div className="text-xs text-ink/45">{r.decidedBy}</div>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold">{r.customer.name || r.customer.email}</div>
                      <div className="text-xs text-ink/55">{r.customer.email}</div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums">
                      {formatPhone(r.verifiedPhone || r.phone)}
                      {r.verifiedPhone && r.verifiedPhone !== r.phone && (
                        <div className="text-xs text-ink/45">entered {formatPhone(r.phone)}</div>
                      )}
                      <div className="font-mono text-xs text-ink/40">{r.reference}</div>
                    </td>
                    <td className="px-5 py-4">
                      {r.status === 'verified' ? (
                        <span className="rounded-full bg-teal/12 px-2.5 py-1 text-xs font-semibold text-teal-deep">Verified</span>
                      ) : (
                        <>
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Rejected</span>
                          {r.rejectReason && <div className="mt-1.5 max-w-xs text-xs text-ink/55">{r.rejectReason}</div>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="rounded-md p-1 text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink"
    >
      {copied ? <Check size={14} className="text-teal-deep" /> : <Copy size={14} />}
    </button>
  )
}

function PendingCard({ req, onDecided }: { req: Req; onDecided: (id: string, message: string) => void }) {
  const [mode, setMode] = useState<'idle' | 'other-number' | 'reject'>('idle')
  const [otherNumber, setOtherNumber] = useState('')
  // Pre-pick the reason that fits: a number owned by another account is
  // almost always rejected for exactly that.
  const [reason, setReason] = useState<string>(req.conflict ? REJECT_REASONS[2] : REJECT_REASONS[0])
  const [customReason, setCustomReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/whatsapp-verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: req.id, ...payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong.')
      const who = req.customer.name || req.customer.email
      onDecided(
        req.id,
        data.status === 'verified'
          ? `Verified ${formatPhone(data.phone)} for ${who}. They’ve been notified.`
          : `Rejected ${who}’s request. They’ve been told why.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  const waChat = `https://wa.me/${req.phone.replace(/\D/g, '')}`
  const finalReason = reason === 'other' ? customReason.trim() : reason

  return (
    <article className="rounded-2xl border border-ink/10 bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-semibold tracking-wide">{req.reference}</span>
            <CopyButton value={req.reference} label="reference" />
            <span className="text-xs text-ink/45">· {timeAgo(req.createdAt)}</span>
          </div>
          <p className="mt-2 font-semibold">{req.customer.name || '(no name)'}</p>
          <p className="text-sm text-ink/60">
            {req.customer.email}
            {req.customer.handle ? ` · ${req.customer.handle}` : ''}
          </p>
          {req.customer.currentVerifiedPhone && (
            <p className="mt-1 text-xs text-ink/50">
              Changing from verified number {formatPhone(req.customer.currentVerifiedPhone)}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-ink/50">Message must come from</p>
          <div className="mt-0.5 flex items-center justify-end gap-1">
            <span className="text-lg font-semibold tabular-nums">{formatPhone(req.phone)}</span>
            <CopyButton value={req.phone} label="number" />
          </div>
          <a
            href={waChat}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-teal-deep hover:underline"
          >
            <FaWhatsapp size={12} /> Open this chat in WhatsApp
          </a>
        </div>
      </div>

      {req.conflict && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-gold/10 px-3 py-2.5 text-sm text-ink">
          <AlertTriangle size={16} className="mt-0.5 flex-none text-gold-deep" />
          This number is already verified on another account ({req.conflict.name || req.conflict.email}). It can’t be
          attached to two accounts — reject this request, or check with the customer.
        </p>
      )}

      {mode === 'other-number' && (
        <div className="mt-4 rounded-xl border border-ink/10 p-4">
          <label className="block text-sm font-semibold" htmlFor={`other-${req.id}`}>
            Number the message was actually sent from
          </label>
          <p className="text-xs text-ink/55">Copy it from the WhatsApp chat. This is the number that gets verified.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id={`other-${req.id}`}
              value={otherNumber}
              onChange={(e) => setOtherNumber(e.target.value)}
              placeholder="+94 7X XXX XXXX"
              className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-teal/60 focus:ring-2 focus:ring-teal/10"
            />
            <button
              type="button"
              disabled={busy || !otherNumber.trim()}
              onClick={() => act({ action: 'verify', phone: otherNumber })}
              className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-deep disabled:opacity-50"
            >
              Verify this number
            </button>
          </div>
        </div>
      )}

      {mode === 'reject' && (
        <fieldset className="mt-4 rounded-xl border border-ink/10 p-4">
          <legend className="px-1 text-sm font-semibold">Reason (the customer sees this)</legend>
          <div className="space-y-1.5">
            {[...REJECT_REASONS, 'other'].map((r) => (
              <label key={r} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name={`reason-${req.id}`}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="mt-1 accent-teal-deep"
                />
                {r === 'other' ? 'Other…' : r}
              </label>
            ))}
          </div>
          {reason === 'other' && (
            <input
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value.slice(0, 200))}
              placeholder="Explain briefly"
              className="mt-2 w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-teal/60"
            />
          )}
          <button
            type="button"
            disabled={busy || !finalReason}
            onClick={() => act({ action: 'reject', reason: finalReason })}
            className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Reject request
          </button>
        </fieldset>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink/5 pt-4">
        <button
          type="button"
          disabled={busy || Boolean(req.conflict)}
          onClick={() => act({ action: 'verify' })}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Verify {formatPhone(req.phone)}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'other-number' ? 'idle' : 'other-number')}
          className="rounded-xl border border-ink/15 px-3.5 py-2 text-sm font-semibold transition-colors hover:border-teal/40 hover:bg-teal/5"
        >
          Sent from a different number
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'reject' ? 'idle' : 'reject')}
          className="inline-flex items-center gap-1 rounded-xl px-3.5 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
        >
          <X size={15} /> Reject
        </button>
      </div>
    </article>
  )
}
