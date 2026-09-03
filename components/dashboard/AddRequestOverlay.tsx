'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

type AddRequestOverlayProps = {
  open: boolean
  onClose: () => void
  link: string
  setLink: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
}

// Bottom-sheet on mobile, centered modal on desktop. This replaces routing
// to a dedicated "addRequest" view — the center + button in MobileBottomNav
// now opens this overlay in place instead of navigating away from whatever
// page the user is currently on.
export default function AddRequestOverlay({ open, onClose, link, setLink, onSubmit }: AddRequestOverlayProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  function handleSubmit(event: React.FormEvent) {
    onSubmit(event)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm motion-safe:[animation:fadeIn_0.2s_ease-out_both]"
      />

      {/* Sheet / modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-request-overlay-title"
        className="relative w-full max-w-lg rounded-t-3xl bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl motion-safe:[animation:slideUp_0.3s_ease-out_both] lg:rounded-3xl lg:pb-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="add-request-overlay-title" className="font-display text-xl font-extrabold text-ink">
            Add a new item request
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-ink/50 transition-colors duration-200 hover:bg-ink/5 hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="font-semibold text-ink">You find it, we buy it for you!</p>
          <textarea
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="Paste full product link here to get started (e.g. https://example.com/item)"
            autoFocus
            className="min-h-[90px] resize-y rounded-xl border border-ink/15 bg-parchment p-4 text-sm outline-none transition-all duration-200 placeholder:text-ink/35 focus:border-gold/60 focus:bg-card focus:ring-2 focus:ring-gold/50"
          />
          <button
            type="submit"
            disabled={!link.trim()}
            className="group flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-ink py-3.5 text-sm font-semibold text-parchment transition-all duration-200 hover:bg-indigo-deep hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/25 disabled:active:scale-100"
          >
            Submit request
          </button>
        </form>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideUp {
          from {
            transform: translateY(24px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}