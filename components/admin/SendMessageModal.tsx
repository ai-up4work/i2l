// components/admin/SendMessageModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, X } from 'lucide-react'

// Shown any time an admin action HAS a natural customer-facing message
// attached to it (a quote was set, payment was confirmed, a purchase
// failed, a QC issue was flagged, etc.) — instead of silently auto-
// sending, this puts the draft in front of a human first: they can send
// it as-is, edit the wording, or skip sending entirely. The underlying
// action (setQuote, confirmPayment, flagUnavailable, ...) has already
// happened by the time this shows — this only ever controls whether/what
// gets said in chat about it, never gates the action itself.
//
// Deliberately a single shared component used from every trigger point
// (request detail, purchases detail, QC detail, ...) rather than a
// bespoke inline modal per page — one place to get the UX right (edit,
// send, skip, loading/error state) instead of four slightly different
// copies drifting apart over time.

export type SendMessageModalProps = {
  open: boolean
  /** Short label for what this message is about, shown in the header — e.g. "Send quote to customer?" */
  title: string
  /** The pre-filled, editable draft. Re-seeds the textarea whenever this prop changes while open (a fresh trigger with a new default). */
  defaultMessage: string
  /** Called with the (possibly edited) text when the admin clicks Send. Return { ok: false, error } (or reject) if the real send failed — the modal stays open and shows the error instead of closing, so a failure is never silently indistinguishable from success. */
  onSend: (text: string) => Promise<{ ok: boolean; error?: string }> | void | Promise<void>
  /** Called when the admin dismisses without sending — closes the modal, does nothing else. */
  onSkip: () => void
}

export function SendMessageModal({ open, title, defaultMessage, onSend, onSkip }: SendMessageModalProps) {
  const [text, setText] = useState(defaultMessage)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Re-seed the draft whenever a new message comes in while the modal is
  // open (or reopens) — without this, editing one message and later
  // triggering a different one would show stale leftover text.
  useEffect(() => {
    if (open) {
      setText(defaultMessage)
      setSendError(null)
    }
  }, [open, defaultMessage])

  if (!open) return null

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setSending(true)
    setSendError(null)
    try {
      const result = await onSend(trimmed)
      // A caller that doesn't return a result (void) is treated as
      // success, for callers that haven't been updated to report
      // ok/error — but every current caller (request/purchases/qc
      // pages) does return one, since silently assuming success is
      // exactly the bug this modal exists to prevent.
      if (result && result.ok === false) {
        setSendError(result.error ?? "Failed to send message. Please try again.")
        return
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send message. Please try again.")
      return
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-ink/10 bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-teal-deep" />
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onSkip}
            aria-label="Close without sending"
            className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <label className="text-xs font-semibold text-ink/50">Message to customer</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            disabled={sending}
            className="mt-1.5 w-full resize-none rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50 disabled:opacity-60"
          />
          <p className="mt-1.5 text-[11px] text-ink/35">Edit as needed before sending — this goes straight into their chat thread.</p>
          {sendError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
              {sendError}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink/10 px-5 py-3.5">
          <button
            type="button"
            onClick={onSkip}
            disabled={sending}
            className="rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-sm font-semibold text-ink/70 hover:bg-parchment/60 disabled:opacity-60"
          >
            Don't send
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="rounded-lg bg-teal-deep px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
          >
            {sending ? 'Sending…' : 'Send message'}
          </button>
        </div>
      </div>
    </div>
  )
}