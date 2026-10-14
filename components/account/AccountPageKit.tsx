// components/account/AccountPageKit.tsx
//
// One look for the account pages (Profile, Address book, Referrals,
// Recently viewed, Stores I follow): the same width and padding, an
// eyebrow + display-font title, rounded white cards with a hairline ring,
// and pill buttons. Matches the account home's indigo "Buy for me" card
// and the store pages.

import type { ReactNode } from 'react'

type IconType = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

export function AccountPage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-6xl' : 'max-w-5xl'} px-4 pb-20 pt-4 sm:px-6 lg:px-10 lg:pt-8`}>
      {children}
    </div>
  )
}

export function AccountPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-teal-deep">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-sm text-ink/55">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function AccountCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  className = '',
  padded = true,
}: {
  title?: ReactNode
  description?: ReactNode
  icon?: IconType
  action?: ReactNode
  children?: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section className={`rounded-3xl bg-card ring-1 ring-ink/10 ${padded ? 'p-5 sm:p-6' : ''} ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep">
                <Icon size={17} strokeWidth={1.9} />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="font-display text-lg leading-tight text-ink">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-ink/55">{description}</p>}
            </div>
          </div>
          {action && <div className="flex-none">{action}</div>}
        </div>
      )}
      {children && <div className={title || action ? 'mt-5' : ''}>{children}</div>}
    </section>
  )
}

export function AccountEmpty({ icon: Icon, title, body, action }: { icon: IconType; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-ink/15 bg-card px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-teal/10">
        <Icon size={24} strokeWidth={1.8} className="text-teal-deep" />
      </span>
      <p className="mt-4 font-display text-xl text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink/55">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-indigo px-5 py-2.5 text-sm font-semibold text-parchment transition-colors hover:bg-indigo-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
export const btnTeal =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-teal px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
export const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-ink/15 bg-card px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-teal/40 hover:text-teal-deep disabled:cursor-not-allowed disabled:opacity-50'
export const fieldClass =
  'w-full rounded-xl border border-ink/12 bg-parchment/60 px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-teal focus:bg-card focus:ring-2 focus:ring-teal/15'
export const labelClass = 'mb-1 block text-xs font-semibold text-ink/55'
