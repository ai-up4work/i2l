import Link from 'next/link'
import { ArrowRight, CheckCircle2, Info } from 'lucide-react'

export interface MarketplaceGuideProps {
  name: string
  tagline: string
  description: string
  bestFor: string[]
  tips: string[]
  storeHref?: string
}

export default function MarketplaceGuide({
  name,
  tagline,
  description,
  bestFor,
  tips,
  storeHref,
}: MarketplaceGuideProps) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 lg:px-10 lg:py-24">
      <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
        Shopping guide
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        Buying from {name}
      </h1>
      <p className="mt-3 font-body text-base font-medium text-ink/60">{tagline}</p>
      <p className="mt-5 max-w-2xl font-body text-base leading-relaxed text-ink/65">{description}</p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-ink/10 bg-card p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Good for</h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {bestFor.map((item) => (
              <li key={item} className="flex items-start gap-2 font-body text-sm text-ink/65">
                <CheckCircle2 size={16} className="mt-0.5 flex-none text-teal-deep" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-card p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Tips before you request</h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {tips.map((item) => (
              <li key={item} className="flex items-start gap-2 font-body text-sm text-ink/65">
                <Info size={16} className="mt-0.5 flex-none text-gold-deep" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-10 rounded-2xl border border-ink/10 bg-parchment/60 p-6">
        <h2 className="font-display text-lg font-semibold text-ink">How to order from {name}</h2>
        <ol className="mt-3 flex flex-col gap-2 font-body text-sm text-ink/65">
          <li>1. Find the item on {name} and copy its product page link.</li>
          <li>
            2. Paste it into{' '}
            <Link href="/account/requests/new" className="text-teal-deep underline underline-offset-2">
              New Request
            </Link>
            , adding any size, colour, or quantity details.
          </li>
          <li>3. Review the quote — product price, service fee, freight, and estimated customs — and accept it.</li>
          <li>4. Wishdrop buys it, quality-checks it, and ships it to you.</li>
        </ol>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/account/requests/new"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-body text-sm font-semibold text-parchment transition-colors hover:bg-teal-deep"
        >
          Start a request
          <ArrowRight size={15} />
        </Link>
        {storeHref && (
          <Link
            href={storeHref}
            className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-6 py-3 font-body text-sm font-semibold text-ink transition-colors hover:border-teal/40 hover:text-teal-deep"
          >
            Browse in catalogue
          </Link>
        )}
      </div>
    </main>
  )
}
