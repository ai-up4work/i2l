import Link from 'next/link'
import { ArrowRight, PackageCheck, ShieldCheck, Truck, Clock } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/shipping',
  title: 'Shipping & Delivery | Wishdrop',
  description:
    'How Wishdrop ships your order from an affiliated store to your door in Sri Lanka — consolidation, customs, and delivery, explained.',
})

const stages = [
  {
    icon: PackageCheck,
    title: 'Received & quality checked',
    text: 'Your item arrives at a Wishdrop facility, where we confirm it matches your order before it moves any further.',
  },
  {
    icon: Truck,
    title: 'Consolidated & shipped',
    text: 'Items are packed for international transit and handed to our shipping partner, with tracking updated on your account.',
  },
  {
    icon: ShieldCheck,
    title: 'Customs clearance',
    text: 'We handle the customs declaration and clearance process in Sri Lanka — you don\u2019t need to file anything yourself.',
  },
  {
    icon: Clock,
    title: 'Delivered to your door',
    text: 'Once cleared, your order is handed to last-mile delivery and brought to the address on your account.',
  },
]

const faqs = [
  {
    q: 'Do I need my own overseas address?',
    a: "No. Unlike a package-forwarding service, Wishdrop buys the item for you directly, so there's no warehouse address to manage, forward, or declare yourself.",
  },
  {
    q: 'How long does delivery take?',
    a: 'Timelines vary by seller dispatch time, product weight, and customs processing, and are shown as an estimate on your quote and order page. We\u2019ll flag it if something is running longer than expected.',
  },
  {
    q: 'Can I track my order?',
    a: 'Yes — every order moves through the same stages (Ordered \u2192 Quality check \u2192 Shipped \u2192 Delivered), visible under My Orders and Track Order.',
  },
  {
    q: 'What if my item is lost or damaged?',
    a: 'See our Shipping Protection Plan for optional coverage, and our Refund Policy for what happens by default.',
  },
]

export default function ShippingPage() {
  return (
    <main>
      <section className="mx-auto max-w-5xl px-6 pb-14 pt-20 text-center lg:px-10 lg:pt-28">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          Shipping & delivery
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          From the seller's shelf to your door
        </h1>
        <p className="mx-auto mt-5 max-w-xl font-body text-base leading-relaxed text-ink/65">
          Wishdrop handles the entire cross-border journey — you don't need to arrange a warehouse
          address, forward a parcel, or file customs paperwork yourself.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 lg:px-10">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stages.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="relative rounded-2xl border border-ink/10 bg-card p-6">
              <span className="font-mono text-xs font-semibold text-gold-deep">
                0{i + 1}
              </span>
              <div className="mt-3 flex h-11 w-11 items-center justify-center rounded-xl bg-teal/10 text-teal-deep">
                <Icon size={20} />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 font-body text-sm leading-relaxed text-ink/60">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16 lg:px-10">
        <div className="rounded-3xl border border-ink/10 bg-card p-8 sm:p-10">
          <h2 className="font-display text-2xl font-semibold text-ink">
            What your delivery cost includes
          </h2>
          <p className="mt-3 font-body text-sm leading-relaxed text-ink/65">
            The total shown on your quote bundles the product price, Wishdrop's service fee,
            freight, and applicable customs duties and taxes — see{' '}
            <Link href="/shipping/pricing" className="text-teal-deep underline underline-offset-2">
              how pricing is calculated
            </Link>{' '}
            and <Link href="/taxation" className="text-teal-deep underline underline-offset-2">
              how customs charges work
            </Link>{' '}
            for the full breakdown. There's nothing further to pay on delivery unless your order
            changes after purchase.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-16 lg:px-10">
        <h2 className="font-display text-2xl font-semibold text-ink">Common questions</h2>
        <div className="mt-6 flex flex-col divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-card">
          {faqs.map(({ q, a }) => (
            <details key={q} className="group p-5 open:bg-parchment/50">
              <summary className="cursor-pointer list-none font-body text-sm font-semibold text-ink">
                {q}
              </summary>
              <p className="mt-2 font-body text-sm leading-relaxed text-ink/60">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24 lg:px-10">
        <div className="rounded-3xl bg-indigo px-8 py-12 text-center sm:px-14">
          <h2 className="font-display text-2xl font-semibold text-parchment sm:text-3xl">
            Have something already picked out?
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
