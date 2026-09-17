import Link from 'next/link'
import { ArrowRight, Heart, PackageCheck, ShieldCheck, Truck } from 'lucide-react'

export const metadata = {
  title: 'About WishDrop',
  description:
    'WishDrop is a concierge shopping and cross-border delivery platform helping Sri Lankan customers buy from Indian and international stores, worry-free.',
}

const values = [
  {
    icon: Heart,
    title: 'Customer-first, always',
    text: 'We measure success by whether you can find a product and understand your total cost without confusion or hidden steps.',
  },
  {
    icon: ShieldCheck,
    title: 'Honest about the journey',
    text: "We'd rather tell you about a delay early than make a promise we can't keep.",
  },
  {
    icon: PackageCheck,
    title: 'Quality checked, every time',
    text: 'Every order is inspected at our facility before it travels to you, so what you ordered is what arrives.',
  },
  {
    icon: Truck,
    title: 'One relationship, not five',
    text: 'One support team, one tracking view, one place to ask — instead of juggling multiple sellers and carriers.',
  },
]

const journey = [
  { step: '01', title: 'Discover', text: 'Browse affiliated stores and products, or submit a link to something you found elsewhere.' },
  { step: '02', title: 'Quote', text: 'See the product price, service fee, freight, duties, and estimated total, clearly, before you commit.' },
  { step: '03', title: 'We buy it for you', text: 'WishDrop purchases the item directly from the seller on your behalf.' },
  { step: '04', title: 'Quality check', text: 'Your item is received and inspected at a WishDrop facility before it travels onward.' },
  { step: '05', title: 'Ship & deliver', text: 'We consolidate and ship to Sri Lanka, and hand it to you at your door.' },
]

export default function AboutPage() {
  return (
    <main>
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-20 text-center lg:px-10 lg:pt-28">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          About WishDrop
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
          Wish it. We'll drop it.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl font-body text-base leading-relaxed text-ink/65 sm:text-lg">
          WishDrop is a concierge shopping and cross-border delivery platform that helps customers
          in Sri Lanka buy products from affiliated Indian stores, or request products from almost
          any online store, without handling international purchasing, warehousing, customs, or
          shipping themselves.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16 lg:px-10">
        <div className="rounded-3xl border border-ink/10 bg-card p-8 sm:p-12">
          <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            Why WishDrop exists
          </h2>
          <p className="mt-4 font-body text-base leading-relaxed text-ink/65">
            Many of the products people want simply aren't sold locally. But buying from another
            country directly is full of friction: stores that won't ship to Sri Lanka, confusing
            currency conversion, no clear sense of the full landed cost, and no easy way to track a
            parcel once it's in someone else's hands. WishDrop turns that into one guided journey —
            choose what you want, understand the cost, pay through the platform, and receive the
            item at your door.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 lg:px-10">
        <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">What we stand for</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {values.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4 rounded-2xl border border-ink/10 bg-card p-6">
              <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-teal/10 text-teal-deep">
                <Icon size={20} />
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
                <p className="mt-1.5 font-body text-sm leading-relaxed text-ink/60">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 lg:px-10">
        <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
          How a WishDrop order moves
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {journey.map(({ step, title, text }) => (
            <div key={step} className="rounded-2xl border border-ink/10 bg-card p-5">
              <p className="font-mono text-xs font-semibold text-gold-deep">{step}</p>
              <h3 className="mt-2 font-display text-base font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 font-body text-xs leading-relaxed text-ink/55">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24 lg:px-10">
        <div className="rounded-3xl bg-indigo px-8 py-12 text-center sm:px-14">
          <h2 className="font-display text-2xl font-semibold text-parchment sm:text-3xl">
            Ready to try it?
          </h2>
          <p className="mx-auto mt-3 max-w-xl font-body text-sm text-parchment/70">
            Browse our affiliated stores, or paste a link to something you've already found — we'll
            take it from there.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/stores"
              className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 font-body text-sm font-semibold text-ink transition-colors hover:bg-gold-deep hover:text-parchment"
            >
              Browse stores
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/account/"
              className="inline-flex items-center gap-2 rounded-full border border-parchment/25 px-6 py-3 font-body text-sm font-semibold text-parchment transition-colors hover:bg-parchment/10"
            >
              Start a request
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
