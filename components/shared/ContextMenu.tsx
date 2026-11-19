'use client'

// components/shared/ContextMenu.tsx
//
// A small WhatsApp-style action menu (not the browser's own right-click box),
// and a confirm dialog for destructive actions. Used by the admin inbox and the customer chat for the
// message actions and for deleting a whole conversation.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type MenuItem = {
  key: string
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  /** Shown but greyed out (with the reason as a tooltip). */
  disabledReason?: string
  /** Draw a thin line above this item. */
  separatorAbove?: boolean
}

export function ContextMenu({
  x,
  y,
  title,
  items,
  onClose,
}: {
  x: number
  y: number
  /** A quiet line at the top, e.g. who sent the message and when. */
  title?: string
  items: MenuItem[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [active, setActive] = useState(0)

  // Keep the menu fully on screen.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const pad = 8
    setPos({
      left: Math.max(pad, Math.min(x, window.innerWidth - width - pad)),
      top: Math.max(pad, y + height + pad > window.innerHeight ? y - height : y),
    })
  }, [x, y, items.length])

  useEffect(() => {
    ref.current?.focus()
    const close = () => onClose()
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [onClose])

  const enabled = items.map((it, i) => (it.disabledReason ? -1 : i)).filter((i) => i >= 0)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const at = enabled.indexOf(active)
      const next = e.key === 'ArrowDown' ? (at + 1) % enabled.length : (at - 1 + enabled.length) % enabled.length
      setActive(enabled[next])
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(enabled[0])
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(enabled[enabled.length - 1])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const it = items[active]
      if (it && !it.disabledReason) {
        onClose()
        it.onSelect()
      }
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-label="Message actions"
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[90] min-w-[216px] max-w-[280px] rounded-xl border border-ink/10 bg-card py-1.5 shadow-[0_18px_40px_-12px_rgba(8,39,79,0.35)] outline-none motion-safe:animate-[menuIn_120ms_ease-out_both]"
    >
      <style>{`@keyframes menuIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}`}</style>
      {title && <p className="truncate px-3.5 pb-1.5 pt-1 text-[11px] font-medium text-ink/45">{title}</p>}
      {items.map((it, i) => (
        <div key={it.key}>
          {it.separatorAbove && <div className="my-1 border-t border-ink/10" />}
          <button
            type="button"
            role="menuitem"
            disabled={Boolean(it.disabledReason)}
            title={it.disabledReason}
            onMouseEnter={() => !it.disabledReason && setActive(i)}
            onClick={() => {
              if (it.disabledReason) return
              onClose()
              it.onSelect()
            }}
            className={`flex w-full items-center gap-3 px-3.5 py-2 text-left text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              it.danger ? 'text-red-600' : 'text-ink'
            } ${active === i ? (it.danger ? 'bg-red-50' : 'bg-ink/[0.05]') : ''}`}
          >
            <span className={`flex w-[18px] flex-none justify-center ${it.danger ? 'text-red-600' : 'text-ink/55'}`}>{it.icon}</span>
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
          </button>
        </div>
      ))}
    </div>
  )
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger = true,
  busy = false,
  error,
  requireText,
  onConfirm,
  onCancel,
}: {
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  error?: string | null
  /** For the heaviest actions: the person must type this word to enable the button. */
  requireText?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])
  const ok = !requireText || typed.trim().toLowerCase() === requireText.toLowerCase()

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-ink/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
        <h2 className="font-display text-xl font-semibold text-indigo">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-ink/70">{body}</div>
        {requireText && (
          <label className="mt-4 block text-xs font-medium text-ink/60">
            Type <span className="font-semibold text-ink">{requireText}</span> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1.5 w-full rounded-lg border border-ink/15 bg-parchment px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/15"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:border-ink/30 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !ok}
            onClick={onConfirm}
            className={`rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-deep hover:bg-teal'}`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
