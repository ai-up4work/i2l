'use client'

// components/admin/chat/WhatsAppHandoffDialog.tsx
//
// Review-and-open dialog for sending staff messages (or a reminder) to a
// customer's verified WhatsApp via a wa.me link. The text is pre-written
// and editable; the link target (order page / My Messages / …) can be
// changed. "Open WhatsApp" is a real link (never popup-blocked) and logs
// the hand-off as it opens.
//
// Backed by /api/admin/chat/threads/[threadId]/whatsapp.

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, RotateCcw, X } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { formatPhone } from '@/lib/whatsapp/verification'
import {
  composeMessagesText,
  composeReminderText,
  linkUrl,
  MAX_WHATSAPP_CHARS,
  waMeUrl,
  type Context,
  type HandoffMessage,
  type LinkTarget,
} from '@/lib/chat/whatsapp-handoff'

export interface HandoffSent {
  at: string
  by: string | null
  messageIds: string[]
  kind: 'messages' | 'reminder'
}

type Props = {
  threadId: string
  customer: { name: string; firstName: string | null; verifiedPhone: string }
  /** Order display ids tagged anywhere in the loaded conversation — offered as link targets. */
  orderOptions: string[]
  defaultContext: Context
  defaultLink: LinkTarget
  lastReminder: { at: string; by: string | null } | null
  onClose: () => void
  onSent: (sent: HandoffSent) => void
} & (
  | { kind: 'messages'; messages: (HandoffMessage & { id: string })[] }
  | { kind: 'reminder'; waitingCount: number }
)

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function targetKey(t: LinkTarget) {
  return t.kind === 'order' ? `order:${t.displayId}` : t.kind
}

export default function WhatsAppHandoffDialog(props: Props) {
  const { threadId, customer, orderOptions, defaultContext, defaultLink, lastReminder, onClose, onSent } = props
  const [link, setLink] = useState<LinkTarget>(defaultLink)
  const [edited, setEdited] = useState(false)
  const [sentHere, setSentHere] = useState(false)

  const composed = useMemo(() => {
    // Greeting context follows the link when an order page is chosen.
    const context: Context = link.kind === 'order' ? { kind: 'order', displayId: link.displayId } : defaultContext
    return props.kind === 'messages'
      ? composeMessagesText({ firstName: customer.firstName, messages: props.messages, context, link })
      : composeReminderText({ firstName: customer.firstName, waitingCount: props.waitingCount, context, link })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link, customer.firstName, defaultContext, props.kind])

  const [text, setText] = useState(composed)
  // Until staff edit the text themselves, changing the link rewrites it.
  useEffect(() => {
    if (!edited) setText(composed)
  }, [composed, edited])

  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const href = waMeUrl(customer.verifiedPhone, text)
  const tooLong = text.length > MAX_WHATSAPP_CHARS
  const recentReminder = lastReminder && Date.now() - new Date(lastReminder.at).getTime() < 24 * 60 * 60 * 1000

  const linkOptions: { key: string; label: string; target: LinkTarget }[] = [
    ...orderOptions.map((d) => ({ key: `order:${d}`, label: `Order ${d} tracking page`, target: { kind: 'order', displayId: d } as LinkTarget })),
    { key: 'messages', label: 'My Messages', target: { kind: 'messages' } },
    { key: 'orders', label: 'My Orders list', target: { kind: 'orders' } },
    { key: 'none', label: 'No link', target: { kind: 'none' } },
  ]

  // Fire-and-forget log as the WhatsApp link opens. keepalive lets it
  // finish even if this tab loses focus to WhatsApp Desktop.
  const logHandoff = () => {
    setSentHere(true)
    const messageIds = props.kind === 'messages' ? props.messages.map((m) => m.id) : []
    fetch(`/api/admin/chat/threads/${threadId}/whatsapp`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: props.kind, messageIds, text, link: linkUrl(link) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && onSent({ at: d.at, by: d.by, messageIds: d.messageIds, kind: props.kind }))
      .catch(() => {})
  }

  const title =
    props.kind === 'reminder'
      ? 'Remind on WhatsApp'
      : props.messages.length === 1
        ? 'Send message to WhatsApp'
        : `Send ${props.messages.length} messages to WhatsApp`

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-indigo-deep/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-handoff-title"
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-3xl bg-parchment font-body text-ink shadow-[0_24px_60px_-20px_rgba(8,18,40,0.5)] sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-[#25D366] text-white">
              <FaWhatsapp size={18} />
            </span>
            <div>
              <h2 id="wa-handoff-title" className="font-display text-xl leading-tight">
                {title}
              </h2>
              <p className="text-sm text-ink/55">
                To {customer.name || 'customer'} · {formatPhone(customer.verifiedPhone)}{' '}
                <span className="font-semibold text-teal-deep">verified</span>
              </p>
            </div>
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-2 pt-4">
          {recentReminder && (
            <p className="flex items-start gap-2 rounded-xl bg-gold/10 px-3 py-2 text-xs text-ink/75">
              <AlertTriangle size={14} className="mt-0.5 flex-none text-gold-deep" />
              {lastReminder!.by ?? 'Someone'} already reached out on WhatsApp {timeAgo(lastReminder!.at)}.
            </p>
          )}

          <label className="block">
            <span className="text-sm font-semibold">Link in the message</span>
            <select
              value={targetKey(link)}
              onChange={(e) => setLink(linkOptions.find((o) => o.key === e.target.value)!.target)}
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-card px-3 py-2 text-sm outline-none focus:border-teal/60"
            >
              {linkOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-ink/50">
              If they’re signed out, the link asks them to sign in, then opens this page.
            </span>
          </label>

          <label className="block">
            <span className="flex items-baseline justify-between text-sm font-semibold">
              Message
              <span className="flex items-center gap-3 text-xs font-medium">
                {edited && (
                  <button
                    type="button"
                    onClick={() => {
                      setEdited(false)
                      setText(composed)
                    }}
                    className="inline-flex items-center gap-1 text-teal-deep hover:underline"
                  >
                    <RotateCcw size={11} /> Reset
                  </button>
                )}
                <span className={`tabular-nums ${tooLong ? 'text-red-600' : 'text-ink/40'}`}>
                  {text.length}/{MAX_WHATSAPP_CHARS}
                </span>
              </span>
            </span>
            <textarea
              value={text}
              onChange={(e) => {
                setEdited(true)
                setText(e.target.value)
              }}
              rows={9}
              className="mt-1.5 w-full resize-y rounded-xl border border-ink/15 bg-card px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-teal/60 focus:ring-2 focus:ring-teal/10"
            />
            <span className="mt-1 block text-xs text-ink/50">
              *Text between asterisks* shows in bold on WhatsApp. You can edit anything before sending.
            </span>
          </label>

          <p className="rounded-xl border border-ink/10 bg-card px-3 py-2.5 text-xs leading-relaxed text-ink/60">
            This opens WhatsApp on this device with the message ready — press <strong>Send</strong> there. Make sure the
            WhatsApp open on this device is the <strong>Wishdrop business number</strong>, not a personal one.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink/10 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {sentHere && <span className="mr-auto text-xs font-semibold text-teal-deep">Opened in WhatsApp ✓</span>}
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink/60 hover:text-ink">
            {sentHere ? 'Done' : 'Cancel'}
          </button>
          {tooLong || !text.trim() ? (
            // A real disabled button (not a link without an href) so screen
            // readers still announce it — and why it's unavailable.
            <button
              type="button"
              disabled
              title={tooLong ? 'Shorten the message first' : 'Write a message first'}
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-[#0F7A3D] px-5 py-2 text-sm font-semibold text-white opacity-50"
            >
              <FaWhatsapp size={16} />
              Open WhatsApp
            </button>
          ) : (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={logHandoff}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0F7A3D] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0B5E2F]"
            >
              <FaWhatsapp size={16} />
              {sentHere ? 'Open again' : 'Open WhatsApp'}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
