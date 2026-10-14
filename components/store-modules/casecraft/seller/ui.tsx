// components/store-modules/casecraft/seller/ui.tsx
// Small shared pieces for Case Craft's seller pages.
'use client'

import type { ReactNode } from 'react'

export function SellerPageTitle({ title, body, actions }: { title: string; body?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        {body && <p className="mt-1 max-w-2xl font-body text-sm text-ink/60">{body}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ title, body, children, tone }: { title?: string; body?: ReactNode; children: ReactNode; tone?: 'staff' }) {
  return (
    <section className={`rounded-2xl bg-card p-4 ring-1 sm:p-5 ${tone === 'staff' ? 'ring-indigo/30' : 'ring-ink/10'}`}>
      {title && <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>}
      {body && <p className="mt-0.5 font-body text-xs text-ink/55">{body}</p>}
      <div className={title || body ? 'mt-4' : ''}>{children}</div>
    </section>
  )
}

export function Notice({ tone = 'gold', children }: { tone?: 'gold' | 'red' | 'teal'; children: ReactNode }) {
  const cls = tone === 'red' ? 'bg-red-50 text-red-700 ring-red-200' : tone === 'teal' ? 'bg-teal/8 text-teal-deep ring-teal/25' : 'bg-gold/15 text-ink ring-gold/40'
  return <p className={`rounded-xl px-4 py-2.5 font-body text-sm ring-1 ${cls}`}>{children}</p>
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors ${checked ? 'bg-teal' : 'bg-ink/20'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

export const field =
  'w-full rounded-xl border border-ink/12 bg-card px-3 py-2 font-body text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-teal'
export const label = 'mb-1 block font-body text-xs font-semibold text-ink/60'
