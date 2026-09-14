import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

export interface LegalSection {
  id: string
  heading: string
  body: ReactNode
}

export interface LegalPageLayoutProps {
  eyebrow: string
  title: string
  intro: string
  lastUpdated: string
  sections: LegalSection[]
  /** Optional short note rendered in a callout box above the sections (e.g. "read alongside Terms of Use"). */
  note?: ReactNode
}

/**
 * Shared shell for every legal / policy page (Privacy, Terms, Refund Policy,
 * Taxation, Shipping Protection, Shopping Protection). Renders a table of
 * contents that anchor-links into each section so long policies stay
 * scannable instead of becoming a wall of text.
 */
export default function LegalPageLayout({
  eyebrow,
  title,
  intro,
  lastUpdated,
  sections,
  note,
}: LegalPageLayoutProps) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 lg:px-10 lg:py-24">
      <Link
        href="/"
        className="inline-flex items-center gap-2 font-body text-sm font-medium text-ink/50 transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} />
        Back to WishDrop
      </Link>

      <div className="mt-8 max-w-2xl">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          {eyebrow}
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 font-body text-base leading-relaxed text-ink/65">{intro}</p>
        <p className="mt-3 font-body text-xs text-ink/40">Last updated: {lastUpdated}</p>
      </div>

      {note && (
        <div className="mt-8 rounded-2xl border border-gold/30 bg-gold/10 px-5 py-4 font-body text-sm leading-relaxed text-ink/75">
          {note}
        </div>
      )}

      <div className="mt-12 grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-14">
        {/* Table of contents */}
        <nav className="hidden lg:block">
          <div className="sticky top-28">
            <p className="font-body text-xs font-semibold uppercase tracking-widest text-ink/35">
              On this page
            </p>
            <ol className="mt-4 flex flex-col gap-2.5 border-l border-ink/10 pl-4">
              {sections.map((section, i) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="font-body text-sm text-ink/55 transition-colors hover:text-teal-deep"
                  >
                    {i + 1}. {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        {/* Mobile TOC */}
        <details className="rounded-2xl border border-ink/10 bg-card p-4 lg:hidden">
          <summary className="cursor-pointer font-body text-sm font-semibold text-ink">
            Jump to a section
          </summary>
          <ol className="mt-3 flex flex-col gap-2 border-t border-ink/10 pt-3">
            {sections.map((section, i) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="font-body text-sm text-teal-deep">
                  {i + 1}. {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </details>

        {/* Sections */}
        <div className="flex flex-col gap-12">
          {sections.map((section, i) => (
            <section key={section.id} id={section.id} className="scroll-mt-28">
              <h2 className="font-display text-2xl font-semibold text-ink">
                <span className="mr-2 text-gold-deep">{i + 1}.</span>
                {section.heading}
              </h2>
              <div className="mt-3 flex flex-col gap-3 font-body text-[15px] leading-relaxed text-ink/70 [&_a]:text-teal-deep [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink [&_strong]:font-semibold">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="mt-16 rounded-2xl border border-ink/10 bg-indigo px-6 py-8 text-center sm:px-10">
        <p className="font-display text-xl font-semibold text-parchment">
          Questions about this policy?
        </p>
        <p className="mt-2 font-body text-sm text-parchment/70">
          Our support team can walk you through anything here in plain language.
        </p>
        <Link
          href="/contact"
          className="mt-5 inline-flex items-center justify-center rounded-full bg-gold px-6 py-2.5 font-body text-sm font-semibold text-ink transition-colors hover:bg-gold-deep hover:text-parchment"
        >
          Contact support
        </Link>
      </div>
    </main>
  )
}
