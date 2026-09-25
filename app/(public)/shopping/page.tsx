import Link from 'next/link'
import { ArrowRight, Link2, Search, ShoppingBag, Sparkles } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/shopping',
  title: 'How Shopping Works | WishDrop',
  description:
    'Two ways to shop with WishDrop: browse affiliated stores directly, or send us a link to almost anything and let us buy it for you.',
})

const paths = [
  {
    icon: ShoppingBag,
    title: 'Browse affiliated stores',
    text: 'Shop directly from our catalogue of affiliated Indian sellers — prices, quotes, and checkout all happen in one place, no separate request needed.',
    cta: 'Browse stores',
    href: '/stores',
  },
  {
    icon: Link2,
    title: 'Send us a link',
    text: "Found something on a store we're not affiliated with? Paste the product link, tell us the size or variant you want, and we'll quote it for you.",
    cta: 'Start a request',
    href: '/account',
  },
]

const steps = [
  { title: 'Tell us what you want', text: 'Pick a product from an affiliated store, or paste a link and add any details (size, colour, quantity).' },
  { title: 'Review your quote', text: 'See the product price, our service fee, freight, and estimated customs charges before you pay anything.' },
  { title: 'We buy it', text: 'Once you accept and pay, WishDrop purchases the item directly from the seller.' },
  { title: 'Track it home', text: 'Follow your order through quality check, shipping, and delivery from your account.' },
]

export default function ShoppingPage() {
  return (
    <main>
      <section className="mx-auto max-w-5xl px-6 pb-14 pt-20 text-center lg:px-10 lg:pt-28">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          How shopping works
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Two ways to shop, one guided journey
        </h1>
        <p className="mx-auto mt-5 max-w-xl font-body text-base leading-relaxed text-ink/65">
          Whatever you want to buy, WishDrop becomes your purchasing agent — sourcing it, paying
          for it, checking it, and delivering it, so you don't have to.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16 lg:px-10">
        <div className="grid gap-6 sm:grid-cols-2">
          {paths.map(({ icon: Icon, title, text, cta, href }) => (
            <div key={title} className="flex flex-col rounded-3xl border border-ink/10 bg-card p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
                <Icon size={22} />
              </div>
              <h2 className="mt-4 font-display text-xl font-semibold text-ink">{title}</h2>
              <p className="mt-2 flex-1 font-body text-sm leading-relaxed text-ink/60">{text}</p>
              <Link
                href={href}
                className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-body text-sm font-semibold text-parchment transition-colors hover:bg-teal-deep"
              >
                {cta}
                <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 lg:px-10">
        <h2 className="font-display text-2xl font-semibold text-ink">From request to order</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ title, text }, i) => (
            <div key={title} className="rounded-2xl border border-ink/10 bg-card p-5">
              <span className="font-mono text-xs font-semibold text-gold-deep">0{i + 1}</span>
              <h3 className="mt-2 font-display text-base font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 font-body text-xs leading-relaxed text-ink/55">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16 lg:px-10">
        <div className="flex flex-col gap-4 rounded-3xl border border-ink/10 bg-card p-7 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-teal/10 text-teal-deep">
            <Search size={22} />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Not sure where to start?</h2>
            <p className="mt-1 font-body text-sm text-ink/60">
              Check our{' '}
              <Link href="/shopping-guides" className="text-teal-deep underline underline-offset-2">
                shopping guides
              </Link>{' '}
              for step-by-step help with popular stores, or see what's on our{' '}
              <Link href="/deals" className="text-teal-deep underline underline-offset-2">
                current deals
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24 lg:px-10">
        <div className="rounded-3xl bg-indigo px-8 py-12 text-center sm:px-14">
          <Sparkles className="mx-auto text-gold" size={26} />
          <h2 className="mt-3 font-display text-2xl font-semibold text-parchment sm:text-3xl">
            What can we get for you?
          </h2>
          <Link
            href="/account"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 font-body text-sm font-semibold text-ink transition-colors hover:bg-gold-deep hover:text-parchment"
          >
            Start a request
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </main>
  )
}
