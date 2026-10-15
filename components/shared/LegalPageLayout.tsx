import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Callout, Container, CtaEnvelope, PageHero } from '@/components/public/PageKit'

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
 * Taxation, Shipping Protection, Shopping Protection, Payment methods, Data
 * deletion). Same header and closing banner as the other public pages
 * (components/public/PageKit.tsx); the policy itself sits in one card with a
 * sticky "On this page" list so long policies stay easy to scan.
 */
export default function LegalPageLayout({ eyebrow, title, intro, lastUpdated, sections, note }: LegalPageLayoutProps) {
  return (
    <main>
      <PageHero eyebrow={eyebrow} title={title} intro={intro} meta={`Last updated ${lastUpdated}`} />

      <Container className="pb-16">
        {note && (
          <div className="mb-8">
            <Callout tone="gold" icon={Info}>
              {note}
            </Callout>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
          {/* Table of contents */}
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-28 rounded-3xl bg-card p-5 ring-1 ring-ink/[0.08]">
              <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/40">On this page</p>
              <ol className="mt-3 flex flex-col gap-1">
                {sections.map((section, i) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="flex gap-2 rounded-lg px-2 py-1.5 font-body text-sm text-ink/60 transition-colors hover:bg-parchment hover:text-teal-deep"
                    >
                      <span className="w-5 flex-none font-semibold text-gold-deep">{i + 1}</span>
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <div className="min-w-0">
            {/* Mobile TOC */}
            <details className="mb-5 rounded-2xl bg-card p-4 ring-1 ring-ink/[0.08] lg:hidden">
              <summary className="cursor-pointer font-body text-sm font-semibold text-indigo">Jump to a section</summary>
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
            <div className="divide-y divide-ink/[0.08] rounded-3xl bg-card px-6 ring-1 ring-ink/[0.08] sm:px-10">
              {sections.map((section, i) => (
                <section key={section.id} id={section.id} className="scroll-mt-28 py-8 sm:py-10">
                  <h2 className="flex items-baseline gap-3 font-display text-2xl font-semibold text-indigo">
                    <span className="grid h-8 w-8 flex-none translate-y-0.5 place-items-center rounded-full bg-indigo font-body text-xs font-bold text-gold">
                      {i + 1}
                    </span>
                    {section.heading}
                  </h2>
                  <div className="mt-4 flex flex-col gap-3 font-body text-[15px] leading-relaxed text-ink/70 sm:pl-11 [&_a]:text-teal-deep [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-ink">
                    {section.body}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </Container>

      <CtaEnvelope
        eyebrow="Still have questions?"
        title="We'll explain it"
        accent="in plain language."
        text="Message our support team on WhatsApp — for anything about a specific order, include your order number."
        primary={{ href: '/contact', label: 'Contact support' }}
      />
    </main>
  )
}
