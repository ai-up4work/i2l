// components/admin/wishdrop-mall/shared.tsx
'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

export const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment outline-none transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-parchment'

export const SECONDARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-ink/15 bg-card px-4 py-2.5 text-sm font-semibold text-ink/75 outline-none transition-colors hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-teal/40'

export const ICON_BUTTON =
  'grid h-8 w-8 place-items-center rounded-full text-ink/45 outline-none transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-teal/40'

export const LINK_BUTTON =
  'text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal'

export const INPUT =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-teal/60 focus:ring-2 focus:ring-teal/10'

export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  const n = amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return `${currency || ''} ${n}`.trim()
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** fetch() wrapper that throws the API's own { error } message. */
export async function mallApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error ?? `Request failed (${res.status})`) as Error & { body?: unknown; status?: number }
    err.body = body
    err.status = res.status
    throw err
  }
  return body as T
}

export function Thumb({ src, alt, size = 44 }: { src?: string | null; alt: string; size?: number }) {
  return (
    <div
      className="flex-none overflow-hidden rounded-lg border border-ink/10 bg-parchment"
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- sourced images come from arbitrary hosts
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : null}
    </div>
  )
}

export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink/55">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className={ICON_BUTTON} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-ink/10 bg-parchment/60 px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}
