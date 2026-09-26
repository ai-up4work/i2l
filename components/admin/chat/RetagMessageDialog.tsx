'use client'

// components/admin/chat/RetagMessageDialog.tsx
//
// "Tag this message" dialog for the admin inbox (/admin/chat). Staff pick
// which of the customer's orders or requests a message is about — or
// clear the tag. Numbers mentioned in the message text (WD-…, REQ-…) that
// belong to this customer are suggested first.
//
// Backed by /api/admin/chat/messages/[messageId]/tag.

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Search, Sparkles, X } from 'lucide-react'
import type { ChatMessageRow } from '@/lib/supabase/chat'

interface Option {
  id: string
  displayId: string
  stage?: string
  status?: string
  createdAt: string
  summary: string | null
  mentioned: boolean
}

interface Options {
  current: { orderId: string | null; requestId: string | null }
  orders: Option[]
  requests: Option[]
  foreignMentions: string[]
}

export interface RetagResult {
  message: ChatMessageRow
  thread: { id: string; last_order_id: string | null; last_request_id: string | null }
  displayId: string | null
}

type Choice = { type: 'order' | 'request'; id: string } | { type: 'none' }

const df = new Intl.DateTimeFormat('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })

function humanize(s?: string) {
  if (!s) return ''
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function sameChoice(a: Choice, b: Choice) {
  if (a.type === 'none' || b.type === 'none') return a.type === b.type
  return a.type === b.type && a.id === b.id
}

export default function RetagMessageDialog({
  message,
  senderLabel,
  onClose,
  onSaved,
}: {
  message: ChatMessageRow
  senderLabel: string
  onClose: () => void
  onSaved: (result: RetagResult) => void
}) {
  const [options, setOptions] = useState<Options | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [choice, setChoice] = useState<Choice>(
    message.order_id
      ? { type: 'order', id: message.order_id }
      : message.request_id
        ? { type: 'request', id: message.request_id }
        : { type: 'none' },
  )
  const initial = useRef(choice)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/chat/messages/${message.id}/tag`, { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Could not load this customer’s orders.')
        if (!cancelled) setOptions(data)
      })
      .catch((err) => !cancelled && setLoadError(err.message))
    return () => {
      cancelled = true
    }
  }, [message.id])

  const q = query.trim().toLowerCase()
  const match = (o: Option) =>
    !q || o.displayId.toLowerCase().includes(q) || (o.summary ?? '').toLowerCase().includes(q)

  const suggested = useMemo(
    () => [
      ...(options?.orders.filter((o) => o.mentioned).map((o) => ({ type: 'order' as const, o })) ?? []),
      ...(options?.requests.filter((r) => r.mentioned).map((r) => ({ type: 'request' as const, o: r })) ?? []),
    ],
    [options],
  )

  const unchanged = sameChoice(choice, initial.current)

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/admin/chat/messages/${message.id}/tag`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(choice),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save the tag.')
      if (!data.unchanged) onSaved(data as RetagResult)
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the tag.')
      setSaving(false)
    }
  }

  const preview = (message.text ?? '').replace(/^\u21aa\ufe0f replying to: [^\n]*\n/, '').trim()

  // A render function, not a component: defining a component inside
  // render would remount every row on each click (losing keyboard focus).
  const renderRow = (type: 'order' | 'request', o: Option, keyPrefix = '') => {
    const selected = choice.type === type && choice.id === o.id
    return (
      <label
        key={`${keyPrefix}${type}-${o.id}`}
        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
          selected ? 'border-teal bg-teal/[0.06]' : 'border-transparent hover:bg-ink/[0.03]'
        }`}
      >
        <input
          type="radio"
          name="retag-choice"
          checked={selected}
          onChange={() => setChoice({ type, id: o.id })}
          className="mt-1 accent-teal-deep"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                type === 'order' ? 'bg-teal/12 text-teal-deep' : 'bg-gold/15 text-gold-deep'
              }`}
            >
              {o.displayId}
            </span>
            <span className="text-xs text-ink/50">{humanize(o.stage ?? o.status)}</span>
            <span className="text-xs text-ink/35">{df.format(new Date(o.createdAt))}</span>
          </span>
          {o.summary && <span className="mt-0.5 block truncate text-[13px] text-ink/65">{o.summary}</span>}
        </span>
      </label>
    )
  }

  // A suggested item is listed ONCE — under "Mentioned in this message"
  // — not again below. Two radios for the same option in one group can't
  // both be checked, so the duplicate made the clicked one look unselected.
  const showingSuggested = suggested.length > 0 && !q
  const orders = options?.orders.filter((o) => match(o) && !(showingSuggested && o.mentioned)) ?? []
  const requests = options?.requests.filter((r) => match(r) && !(showingSuggested && r.mentioned)) ?? []

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-indigo-deep/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="retag-title"
        className="relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-parchment font-body text-ink shadow-[0_24px_60px_-20px_rgba(8,18,40,0.5)] sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 id="retag-title" className="font-display text-xl">
              Tag this message
            </h2>
            <p className="text-sm text-ink/55">Which order or request is it about?</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 rounded-lg p-2 text-ink/45 hover:text-ink focus-visible:outline-2 focus-visible:outline-teal"
          >
            <X size={18} />
          </button>
        </div>

        <blockquote className="mx-6 mt-4 rounded-xl border-l-[3px] border-teal-deep bg-card px-3 py-2 text-[13px] text-ink/70">
          <span className="block text-[11px] font-semibold text-ink/45">{senderLabel}</span>
          <span className="line-clamp-3 whitespace-pre-wrap">{preview || (message.attachment_url ? 'Photo or video' : '—')}</span>
        </blockquote>

        {message.tag_edited && message.tag_edited_by_name && message.tag_edited_at && (
          <p className="mx-6 mt-2 text-xs text-ink/45">
            Last re-tagged by {message.tag_edited_by_name}, {df.format(new Date(message.tag_edited_at))}
          </p>
        )}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-6 pb-2">
          {loadError ? (
            <p className="py-6 text-sm font-semibold text-red-600">{loadError}</p>
          ) : !options ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-ink/30" />
            </div>
          ) : (
            <>
              {options.foreignMentions.length > 0 && (
                <p className="mb-3 flex items-start gap-2 rounded-xl bg-gold/10 px-3 py-2 text-xs text-ink/75">
                  <AlertTriangle size={14} className="mt-0.5 flex-none text-gold-deep" />
                  Mentions {options.foreignMentions.join(', ')}, which isn’t one of this customer’s.
                </p>
              )}

              {showingSuggested && (
                <section className="mb-4">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-teal-deep">
                    <Sparkles size={13} /> Mentioned in this message
                  </h3>
                  {suggested.map(({ type, o }) => renderRow(type, o, 's-'))}
                </section>
              )}

              {options.orders.length + options.requests.length > 6 && (
                <div className="relative mb-3">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find by number or item"
                    className="w-full rounded-xl border border-ink/15 bg-card py-2 pl-8 pr-3 text-sm outline-none focus:border-teal/60"
                  />
                </div>
              )}

              <label
                className={`mb-3 flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                  choice.type === 'none' ? 'border-teal bg-teal/[0.06]' : 'border-transparent hover:bg-ink/[0.03]'
                }`}
              >
                <input
                  type="radio"
                  name="retag-choice"
                  checked={choice.type === 'none'}
                  onChange={() => setChoice({ type: 'none' })}
                  className="accent-teal-deep"
                />
                <span className="text-sm font-semibold text-ink/70">No tag — general message</span>
              </label>

              {orders.length > 0 && (
                <section className="mb-4">
                  <h3 className="mb-1.5 text-xs font-semibold text-ink/50">Orders</h3>
                  {orders.map((o) => renderRow('order', o))}
                </section>
              )}
              {requests.length > 0 && (
                <section className="mb-2">
                  <h3 className="mb-1.5 text-xs font-semibold text-ink/50">Requests</h3>
                  {requests.map((r) => renderRow('request', r))}
                </section>
              )}
              {options.orders.length === 0 && options.requests.length === 0 && (
                <p className="py-4 text-sm text-ink/55">This customer has no orders or requests yet.</p>
              )}
              {q && orders.length === 0 && requests.length === 0 && (
                <p className="py-4 text-sm text-ink/55">Nothing matches “{query}”.</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink/10 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {saveError && <p className="mr-auto text-xs font-semibold text-red-600">{saveError}</p>}
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink/60 hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || unchanged || !options}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-deep px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save tag
          </button>
        </div>
      </div>
    </div>
  )
}
