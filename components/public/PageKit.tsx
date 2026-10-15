// components/public/PageKit.tsx
//
// Building blocks for the public content pages (About, Shipping, Contact,
// Guides, Deals, Blog, legal pages…), so they share one look with the
// landing page: the airmail-stripe label and indigo + teal Fraunces
// headline from the hero, the postal dot grid and postmark, cream cards,
// and the airmail-envelope call to action from the bottom of the home page.
//
// Server components only (no hooks), so pages stay static.

import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

export const AIRMAIL =
  'repeating-linear-gradient(45deg,#C1272D 0 10px,#FBF6EC 10px 20px,#1E3A5F 20px 30px,#FBF6EC 30px 40px)'

const widths = { narrow: 'max-w-4xl', default: 'max-w-6xl', wide: 'max-w-7xl' } as const
type Width = keyof typeof widths

/** Standard page container. */
export function Container({ children, width = 'default', className = '' }: { children: ReactNode; width?: Width; className?: string }) {
  return <div className={`mx-auto w-full ${widths[width]} px-6 lg:px-10 ${className}`}>{children}</div>
}

/** The small pill label above a page title (airmail stripe + text). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2.5 rounded-full border border-indigo/10 bg-card/70 py-1 pl-1 pr-3.5 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo/75 backdrop-blur-sm">
      <span aria-hidden className="h-5 w-7 flex-none rounded-full" style={{ background: AIRMAIL }} />
      {children}
    </p>
  )
}

/** Teal word with the gold hand-drawn underline (same as the hero). */
export function Accent({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap text-teal">
      {children}
      <svg aria-hidden viewBox="0 0 200 14" preserveAspectRatio="none" className="absolute -bottom-1 left-0 h-[0.2em] w-full text-gold">
        <path d="M3 9.5C42 3.5 98 2 197 7" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function Postmark({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 260 130" fill="none" className={`pointer-events-none text-indigo/[0.1] ${className}`}>
      <defs>
        <path id="pk-pm" d="M190,62 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
      </defs>
      <circle cx="190" cy="62" r="48" stroke="currentColor" strokeWidth="2" />
      <circle cx="190" cy="62" r="28" stroke="currentColor" strokeWidth="1.5" />
      <text fill="currentColor" fontSize="9" fontWeight="700" letterSpacing="2.2">
        <textPath href="#pk-pm">WISHDROP · COLOMBO · AIR MAIL ·</textPath>
      </text>
      {[30, 46, 62, 78, 94].map((y) => (
        <path key={y} d={`M0 ${y} q 15 -8 30 0 t 30 0 t 30 0 t 30 0`} stroke="currentColor" strokeWidth="2" />
      ))}
    </svg>
  )
}

/** Page header. `accent` is appended to the title in teal with the gold underline. */
export function PageHero({
  eyebrow,
  title,
  accent,
  intro,
  meta,
  actions,
  center = false,
  width = 'default',
}: {
  eyebrow: string
  title: ReactNode
  accent?: ReactNode
  intro?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  center?: boolean
  width?: Width
}) {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(8,39,79,0.09) 1px, transparent 1.2px)',
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(ellipse 70% 90% at 70% 30%, #000 20%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 90% at 70% 30%, #000 20%, transparent 70%)',
          }}
        />
        <div className="absolute -right-32 -top-24 h-96 w-96 rounded-full bg-teal/10 blur-3xl" />
      </div>
      <Postmark className="absolute -right-4 top-6 hidden w-[300px] lg:block" />

      <Container width={width} className={`pb-12 pt-10 sm:pt-14 lg:pb-16 ${center ? 'text-center' : ''}`}>
        <div className={`max-w-3xl motion-safe:animate-[fadeUp_600ms_cubic-bezier(0.22,1,0.36,1)_both] ${center ? 'mx-auto' : ''}`}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1
            className="mt-5 font-display font-semibold leading-[1.05] tracking-[-0.02em] text-indigo"
            style={{ fontSize: 'clamp(2.25rem, 2.6vw + 1.3rem, 3.6rem)' }}
          >
            {title}
            {accent && (
              <>
                {' '}
                <Accent>{accent}</Accent>
              </>
            )}
          </h1>
          {intro && (
            <p className={`mt-5 max-w-2xl font-body text-base leading-relaxed text-ink/65 sm:text-lg ${center ? 'mx-auto' : ''}`}>{intro}</p>
          )}
          {meta && <div className="mt-3 font-body text-xs text-ink/45">{meta}</div>}
          {actions && <div className={`mt-7 flex flex-wrap gap-3 ${center ? 'justify-center' : ''}`}>{actions}</div>}
        </div>
      </Container>
    </section>
  )
}

/** A titled block of page content. */
export function Section({
  eyebrow,
  title,
  intro,
  children,
  width = 'default',
  className = '',
  id,
}: {
  eyebrow?: string
  title?: ReactNode
  intro?: ReactNode
  children: ReactNode
  width?: Width
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={`scroll-mt-28 pb-14 lg:pb-20 ${className}`}>
      <Container width={width}>
        {(eyebrow || title || intro) && (
          <div className="mb-7 max-w-2xl">
            {eyebrow && <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-deep">{eyebrow}</p>}
            {title && <h2 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-[-0.01em] text-indigo sm:text-[2.1rem]">{title}</h2>}
            {intro && <p className="mt-3 font-body text-[15px] leading-relaxed text-ink/60">{intro}</p>}
          </div>
        )}
        {children}
      </Container>
    </section>
  )
}

/** Plain cream card. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-card p-6 ring-1 ring-ink/[0.08] sm:p-7 ${className}`}>{children}</div>
}

export function IconTile({ icon: I, tone = 'teal' }: { icon: Icon; tone?: 'teal' | 'gold' | 'indigo' }) {
  const tones = {
    teal: 'bg-teal/10 text-teal-deep',
    gold: 'bg-gold/15 text-gold-deep',
    indigo: 'bg-indigo text-parchment',
  }
  return (
    <span className={`grid h-11 w-11 flex-none place-items-center rounded-2xl ${tones[tone]}`}>
      <I size={20} strokeWidth={1.9} />
    </span>
  )
}

/** Icon + title + text. Pass `href` to make the whole card a link. */
export function IconCard({
  icon,
  title,
  text,
  href,
  tone = 'teal',
  layout = 'stack',
  children,
}: {
  icon: Icon
  title: ReactNode
  text?: ReactNode
  href?: string
  tone?: 'teal' | 'gold' | 'indigo'
  layout?: 'stack' | 'row'
  children?: ReactNode
}) {
  const body = (
    <>
      <IconTile icon={icon} tone={tone} />
      <div className={layout === 'stack' ? 'mt-4' : 'min-w-0'}>
        <h3 className="font-display text-lg font-semibold leading-snug text-indigo">{title}</h3>
        {text && <p className="mt-1.5 font-body text-sm leading-relaxed text-ink/60">{text}</p>}
        {children}
      </div>
    </>
  )
  const cls = `group relative h-full rounded-3xl bg-card p-6 ring-1 ring-ink/[0.08] ${layout === 'row' ? 'flex items-start gap-4' : 'flex flex-col'} ${
    href ? 'transition-all duration-200 hover:-translate-y-0.5 hover:ring-teal/30 hover:shadow-[0_18px_40px_-24px_rgba(8,39,79,0.35)]' : ''
  }`
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
        <ArrowRight size={16} className="absolute right-5 top-6 text-ink/25 transition-all group-hover:translate-x-0.5 group-hover:text-teal-deep" />
      </Link>
    )
  }
  return <div className={cls}>{body}</div>
}

/** Numbered journey with a dashed route between steps (desktop). */
export function Steps({ steps, columns = 4 }: { steps: { title: ReactNode; text: ReactNode; icon?: Icon }[]; columns?: 3 | 4 | 5 }) {
  const cols = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }[columns]
  return (
    <ol className={`relative grid gap-4 sm:grid-cols-2 ${cols}`}>
      <span aria-hidden className="absolute left-8 right-8 top-[2.15rem] hidden border-t-2 border-dashed border-indigo/15 lg:block" />
      {steps.map(({ title, text, icon: I }, i) => (
        <li key={i} className="relative rounded-3xl bg-card p-5 ring-1 ring-ink/[0.08]">
          <div className="flex items-center gap-3">
            <span className="relative z-10 grid h-9 w-9 flex-none place-items-center rounded-full bg-indigo font-body text-xs font-bold text-gold ring-4 ring-parchment">
              {String(i + 1).padStart(2, '0')}
            </span>
            {I && <I size={18} strokeWidth={1.9} className="text-teal-deep" />}
          </div>
          <h3 className="mt-4 font-display text-base font-semibold text-indigo">{title}</h3>
          <p className="mt-1.5 font-body text-[13px] leading-relaxed text-ink/60">{text}</p>
        </li>
      ))}
    </ol>
  )
}

export function FAQ({ items }: { items: { q: ReactNode; a: ReactNode }[] }) {
  return (
    <div className="divide-y divide-ink/[0.08] overflow-hidden rounded-3xl bg-card ring-1 ring-ink/[0.08]">
      {items.map(({ q, a }, i) => (
        <details key={i} className="group px-6 py-5 open:bg-parchment/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-body text-[15px] font-semibold text-indigo [&::-webkit-details-marker]:hidden">
            {q}
            <ChevronDown size={17} className="flex-none text-ink/35 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2.5 font-body text-sm leading-relaxed text-ink/65">{a}</div>
        </details>
      ))}
    </div>
  )
}

/** Highlighted note. */
export function Callout({ children, tone = 'teal', icon: I }: { children: ReactNode; tone?: 'teal' | 'gold'; icon?: Icon }) {
  const t = tone === 'gold' ? 'border-gold/40 bg-gold/10 text-ink/80' : 'border-teal/20 bg-teal/[0.06] text-ink/75'
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-5 py-4 font-body text-sm leading-relaxed ${t}`}>
      {I && <I size={18} className={`mt-0.5 flex-none ${tone === 'gold' ? 'text-gold-deep' : 'text-teal-deep'}`} />}
      <div>{children}</div>
    </div>
  )
}

export function ButtonLink({
  href,
  children,
  variant = 'primary',
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'secondary'
}) {
  const cls =
    variant === 'primary'
      ? 'bg-teal text-white hover:bg-teal-deep'
      : 'border border-indigo/15 bg-card text-indigo hover:border-indigo/30'
  return (
    <Link href={href} className={`inline-flex items-center gap-2 rounded-full px-5 py-3 font-body text-sm font-semibold transition-colors ${cls}`}>
      {children}
      {variant === 'primary' && <ArrowRight size={15} />}
    </Link>
  )
}

/** The airmail-envelope call to action from the bottom of the home page. */
export function CtaEnvelope({
  eyebrow = 'Ready when you are',
  title,
  accent,
  text,
  primary,
  secondary,
}: {
  eyebrow?: string
  title: ReactNode
  accent?: ReactNode
  text?: ReactNode
  primary: { href: string; label: string }
  secondary?: { href: string; label: string }
}) {
  return (
    <section className="pb-20 lg:pb-24">
      <Container>
        <div className="rounded-[30px] p-[9px] shadow-[0_40px_80px_-40px_rgba(8,39,79,0.45)]" style={{ background: AIRMAIL }}>
          <div className="relative overflow-hidden rounded-[22px] bg-card px-6 py-10 sm:px-12 lg:px-16 lg:py-12">
            <Postmark className="absolute -right-6 -top-4 hidden w-[280px] sm:block" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-deep">{eyebrow}</p>
                <h2 className="mt-2 font-display text-3xl font-semibold leading-[1.1] text-indigo sm:text-4xl">
                  {title}
                  {accent && <span className="text-teal"> {accent}</span>}
                </h2>
                {text && <p className="mt-3 font-body text-[15px] leading-relaxed text-ink/60">{text}</p>}
              </div>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href={primary.href}>{primary.label}</ButtonLink>
                {secondary && (
                  <ButtonLink href={secondary.href} variant="secondary">
                    {secondary.label}
                  </ButtonLink>
                )}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
