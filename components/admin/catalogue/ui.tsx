// components/admin/catalogue/ui.tsx
//
// One small kit for the Social Stores pages (list, store page, product
// page) so they share a layout and vocabulary. It follows the recipe the
// Sellers page already set — icon header with a stat strip, pill tabs
// with counts, pill search, rounded-full buttons, bordered card rows and
// one empty/loading shell — so moving between Sellers and Social Stores
// feels like one admin, not two.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { imageThumb } from '@/lib/media'

// ---- Tokens --------------------------------------------------------------

export const card = 'rounded-2xl border border-ink/10 bg-card'

export const input =
  'w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-teal/60 focus:ring-2 focus:ring-teal/10'

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-parchment'

export const btnPrimary = `inline-flex flex-none items-center justify-center gap-1.5 rounded-full bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`

export const btnSecondary = `inline-flex flex-none items-center justify-center gap-1.5 rounded-full border border-ink/15 bg-card px-4 py-2.5 text-sm font-semibold text-ink/75 transition-colors hover:border-ink/35 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`

export const btnSmall = `inline-flex flex-none items-center justify-center gap-1.5 rounded-full border border-ink/15 bg-card px-3 py-1.5 text-xs font-semibold text-ink/70 transition-colors hover:border-ink/35 hover:text-ink disabled:opacity-50 ${focusRing}`

export const btnLink = 'text-xs font-semibold text-teal-deep underline-offset-2 hover:underline'

// ---- Page chrome ---------------------------------------------------------

export function PageShell({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className={`mx-auto px-6 pb-20 pt-8 lg:px-10 ${narrow ? 'max-w-3xl' : 'max-w-[1560px]'}`}>{children}</div>
    </div>
  )
}

export function BackLink({ href, label = 'Social Stores', onClick }: { href?: string; label?: string; onClick?: () => void }) {
  const className = 'inline-flex items-center gap-1.5 text-xs font-semibold text-ink/50 transition-colors hover:text-ink'
  const content = (
    <>
      <ArrowLeft size={14} /> {label}
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    )
  }
  return (
    <Link href={href ?? '/admin/catalogues'} className={className}>
      {content}
    </Link>
  )
}

/** Title row: a leading visual (icon tile or store logo), title + meta,
 *  and actions / stats on the right. */
export function PageHeader({
  leading,
  title,
  meta,
  badges,
  actions,
}: {
  leading: ReactNode
  title: ReactNode
  meta?: ReactNode
  badges?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {leading}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-display text-3xl font-semibold leading-tight">{title}</h1>
            {badges}
          </div>
          {meta && <div className="mt-1 max-w-2xl text-sm leading-relaxed text-ink/60">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function IconTile({ children }: { children: ReactNode }) {
  return <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">{children}</div>
}

export function StoreAvatar({ name, logoUrl, size = 48 }: { name: string; logoUrl?: string | null; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="grid flex-none place-items-center overflow-hidden rounded-full border border-ink/10 bg-parchment font-display text-base font-semibold text-teal-deep"
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageThumb(logoUrl, size * 2)} alt="" className="h-full w-full object-cover" />
      ) : (
        (name.trim().charAt(0) || '?').toUpperCase()
      )}
    </span>
  )
}

/** The stat strip used on the Sellers page header. */
export function StatStrip({ stats }: { stats: { label: string; value: ReactNode; tone?: 'gold' }[] }) {
  return (
    <dl className="flex divide-x divide-ink/10 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
      {stats.map((s) => (
        <div key={s.label} className="px-5 py-3">
          <dt className="whitespace-nowrap text-xs font-medium text-ink/45">{s.label}</dt>
          <dd className={`mt-0.5 font-display text-xl ${s.tone === 'gold' ? 'text-gold-deep' : 'text-ink'}`}>{s.value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---- Status ----------------------------------------------------------------

const PILL_TONE = {
  live: 'bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25',
  hidden: 'bg-ink/[0.05] text-ink/55 ring-1 ring-inset ring-ink/10',
  draft: 'bg-gold/15 text-ink/70 ring-1 ring-inset ring-gold/30',
  info: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200',
} as const

const DOT_TONE = { live: 'bg-teal-deep', hidden: 'bg-ink/30', draft: 'bg-gold-deep', info: 'bg-indigo-500' } as const

export type PillTone = keyof typeof PILL_TONE

export function StatusPill({ tone, children, title }: { tone: PillTone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${PILL_TONE[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_TONE[tone]}`} />
      {children}
    </span>
  )
}

/** Admin-only: which country the store buys from. Never shown to shoppers. */
export function OriginTag({ origin }: { origin: 'IN' | 'LK' }) {
  if (origin !== 'LK') return null
  return (
    <span
      title="Local shop in Sri Lanka — staff only, shoppers never see this"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-teal-deep/25 bg-teal/10 px-2 py-0.5 text-[11px] font-semibold text-teal-deep"
    >
      <span aria-hidden>🇱🇰</span> Local
    </span>
  )
}

// ---- Sections, tabs, states ---------------------------------------------------

export function Section({
  id,
  title,
  description,
  action,
  children,
  className = '',
}: {
  id?: string
  title: string
  description?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`scroll-mt-6 p-6 ${card} ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink/55">{description}</p>}
        </div>
        {action}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  )
}

export function FieldLabel({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink/55">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/45">{hint}</span>}
    </label>
  )
}

export function PillTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { key: K; label: string; count?: number }[]
  value: K
  onChange: (key: K) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
      {tabs.map((t) => {
        const on = value === t.key
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
              on ? 'bg-teal-deep text-parchment' : 'text-ink/55 hover:text-ink/80'
            }`}
          >
            {t.label}
            {t.count != null && <span className={on ? 'text-parchment/70' : 'text-ink/35'}>{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-72">
      <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink/35" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-ink/35 focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
      />
    </div>
  )
}

export function StateShell({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      {icon ?? <Loader2 size={22} className="animate-spin text-ink/25" />}
      <div>
        <p className="text-sm font-semibold text-ink/70">{title}</p>
        {body && <p className="mx-auto mt-1 max-w-sm text-xs text-ink/50">{body}</p>}
      </div>
      {action}
    </div>
  )
}

export function Notice({ tone = 'gold', children }: { tone?: 'gold' | 'teal' | 'red'; children: ReactNode }) {
  const toneClass =
    tone === 'teal'
      ? 'border-teal/30 bg-teal/[0.06] text-teal-deep'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-gold/40 bg-gold/10 text-ink'
  return <div className={`rounded-xl border px-4 py-3 text-sm ${toneClass}`}>{children}</div>
}

export function FullPageLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-parchment">
      <StateShell title={label} />
    </div>
  )
}
