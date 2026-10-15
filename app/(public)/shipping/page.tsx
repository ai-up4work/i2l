import Link from 'next/link'
import { PackageCheck, ShieldCheck, Truck, Clock } from 'lucide-react'
import { Card, CtaEnvelope, FAQ, PageHero, Section, Steps } from '@/components/public/PageKit'
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
      <PageHero
        eyebrow="Shipping & delivery"
        title="From the seller’s shelf"
        accent="to your door."
        intro="Wishdrop handles the whole journey from India to Sri Lanka — you don’t need an overseas address, a forwarding service, or any customs paperwork."
      />

      <Section eyebrow="The journey" title="What happens after you order">
        <Steps steps={stages.map(({ icon, title, text }) => ({ icon, title, text }))} />
      </Section>

      <Section>
        <Card className="lg:p-10">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12">
            <h2 className="font-display text-3xl font-semibold leading-tight text-indigo">What your delivery cost includes</h2>
            <p className="font-body text-[15px] leading-relaxed text-ink/65">
              The total on your quote already covers the product price, Wishdrop&apos;s service fee, freight, and customs
              duties and taxes — see{' '}
              <Link href="/shipping/pricing" className="font-semibold text-teal-deep underline underline-offset-2">
                how pricing is calculated
              </Link>{' '}
              and{' '}
              <Link href="/taxation" className="font-semibold text-teal-deep underline underline-offset-2">
                how customs charges work
              </Link>
              . There&apos;s nothing more to pay on delivery unless your order changes after purchase.
            </p>
          </div>
        </Card>
      </Section>

      <Section eyebrow="Good to know" title="Common questions" width="narrow">
        <FAQ items={faqs} />
      </Section>

      <CtaEnvelope
        title="Have something"
        accent="already picked out?"
        text="Paste the link and we’ll price it in rupees, delivered to your door."
        primary={{ href: '/account', label: 'Start a request' }}
        secondary={{ href: '/stores', label: 'Browse stores' }}
      />
    </main>
  )
}
