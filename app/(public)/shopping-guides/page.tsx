import Link from 'next/link'
import { ArrowRight, BookOpen, Link2, Ruler, Wallet } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/shopping-guides',
  title: 'Shopping Guides | WishDrop',
  description: 'Practical, step-by-step guides for buying confidently from Indian and international stores through WishDrop.',
})

const guides = [
  {
    icon: Link2,
    title: 'How to submit a product link',
    text: "Copy the product page URL from any store, paste it into New Request, and add size, colour, or quantity details so we quote it correctly the first time.",
  },
  {
    icon: Ruler,
    title: 'Reading size charts across brands',
    text: 'Sizing varies a lot between Indian and Western brands. Check the seller\u2019s own size chart on the product page before ordering — we quality-check against what was ordered, not what "should" fit.',
  },
  {
    icon: Wallet,
    title: 'Understanding your quote',
    text: 'Every quote breaks down product price, service fee, freight, and estimated customs charges separately. See our Shipping Pricing and Taxation pages for exactly how each line is calculated.',
  },
  {
    icon: BookOpen,
    title: 'Requesting something we don\u2019t sell yet',
    text: 'If a store isn\u2019t in our affiliated catalogue, submit it as a custom request — we\u2019ll review availability and get back to you with a manual quote.',
  },
]

const marketplaces = [
  { name: 'eBay', slug: 'ebay', blurb: 'Auctions and fixed-price listings, largely used-and-new electronics, collectibles, and parts.' },
  { name: 'Mercari', slug: 'mercari', blurb: 'A peer-to-peer marketplace popular for fashion, collectibles, and hobby items.' },
]

export default function ShoppingGuidesPage() {
  return (
    <main>
      <section className="mx-auto max-w-5xl px-6 pb-14 pt-20 text-center lg:px-10 lg:pt-28">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          Shopping guides
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Shop like you've done this before
        </h1>
        <p className="mx-auto mt-5 max-w-xl font-body text-base leading-relaxed text-ink/65">
          A few practical tips to help your first — or fiftieth — WishDrop request go smoothly.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 lg:px-10">
        <div className="grid gap-5 sm:grid-cols-2">
          {guides.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4 rounded-2xl border border-ink/10 bg-card p-6">
              <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
                <Icon size={20} />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
                <p className="mt-1.5 font-body text-sm leading-relaxed text-ink/60">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 lg:px-10">
        <h2 className="font-display text-2xl font-semibold text-ink">Store-specific guides</h2>
        <p className="mt-2 font-body text-sm text-ink/55">
          Notes on shopping from specific marketplaces we regularly source from.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {marketplaces.map((m) => (
            <Link
              key={m.slug}
              href={`/shopping/marketplaces/${m.slug}`}
              className="group flex items-center justify-between rounded-2xl border border-ink/10 bg-card p-5 transition-colors hover:border-teal/40"
            >
              <div>
                <h3 className="font-display text-base font-semibold text-ink group-hover:text-teal-deep">
                  Buying from {m.name}
                </h3>
                <p className="mt-1 font-body text-xs text-ink/55">{m.blurb}</p>
              </div>
              <ArrowRight size={16} className="flex-none text-ink/30 transition-colors group-hover:text-teal-deep" />
            </Link>
          ))}
        </div>
        <p className="mt-4 font-body text-xs text-ink/45">
          Looking for another store? Browse every affiliated store at{' '}
          <Link href="/stores" className="text-teal-deep underline underline-offset-2">/stores</Link>, or
          paste a link from any store via <Link href="/account/" className="text-teal-deep underline underline-offset-2">New Request</Link>.
        </p>
      </section>
    </main>
  )
}
