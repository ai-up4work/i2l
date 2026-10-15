import { Heart, PackageCheck, ShieldCheck, Truck } from 'lucide-react'
import { ButtonLink, Card, CtaEnvelope, IconCard, PageHero, Section, Steps } from '@/components/public/PageKit'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/about',
  title: 'About Wishdrop',
  description:
    'Wishdrop is a concierge shopping and cross-border delivery platform helping Sri Lankan customers buy from Indian and international stores, worry-free.',
})

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
  { step: '03', title: 'We buy it for you', text: 'Wishdrop purchases the item directly from the seller on your behalf.' },
  { step: '04', title: 'Quality check', text: 'Your item is received and inspected at a Wishdrop facility before it travels onward.' },
  { step: '05', title: 'Ship & deliver', text: 'We consolidate and ship to Sri Lanka, and hand it to you at your door.' },
]

export default function AboutPage() {
  return (
    <main>
      <PageHero
        eyebrow="About Wishdrop"
        title="Wish it. We’ll"
        accent="drop it."
        intro="Wishdrop is a concierge shopping and delivery service for Sri Lanka. You pick something from an Indian store — we buy it, check it, ship it and hand it to you, without you dealing with international payments, warehouses, customs or couriers."
        actions={
          <>
            <ButtonLink href="/stores">Browse stores</ButtonLink>
            <ButtonLink href="/account" variant="secondary">
              Start a request
            </ButtonLink>
          </>
        }
      />

      <Section>
        <Card className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12 lg:p-10">
          <div>
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-deep">Our story</p>
            <h2 className="mt-2 font-display text-3xl font-semibold leading-tight text-indigo">Why Wishdrop exists</h2>
          </div>
          <p className="font-body text-[15px] leading-relaxed text-ink/65">
            Many of the products people want simply aren&apos;t sold locally. Buying from another country directly is full
            of friction: stores that won&apos;t ship to Sri Lanka, confusing currency conversion, no clear idea of the final
            cost, and no easy way to track a parcel once it&apos;s in someone else&apos;s hands. Wishdrop turns that into one
            guided journey — choose what you want, see the full cost up front, pay in rupees, and receive it at your door.
          </p>
        </Card>
      </Section>

      <Section eyebrow="What we stand for" title="Four promises we keep">
        <div className="grid gap-4 sm:grid-cols-2">
          {values.map(({ icon, title, text }) => (
            <IconCard key={title} icon={icon} title={title} text={text} layout="row" />
          ))}
        </div>
      </Section>

      <Section eyebrow="How it works" title="How a Wishdrop order moves">
        <Steps columns={5} steps={journey.map(({ title, text }) => ({ title, text }))} />
      </Section>

      <CtaEnvelope
        title="Ready to try it?"
        text="Browse our stores, or paste a link to something you’ve already found — we’ll take it from there."
        primary={{ href: '/stores', label: 'Browse stores' }}
        secondary={{ href: '/account', label: 'Start a request' }}
      />
    </main>
  )
}
