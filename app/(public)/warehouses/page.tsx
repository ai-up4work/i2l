import Link from 'next/link'
import { MapPin, PackageSearch, ScanEye, Truck } from 'lucide-react'
import { Callout, CtaEnvelope, PageHero, Section, Steps } from '@/components/public/PageKit'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/warehouses',
  title: 'Our Facilities | Wishdrop',
  description: 'Where Wishdrop receives, quality-checks, and consolidates your orders before they ship to Sri Lanka.',
})

const facilities = [
  { region: 'India — National hub', role: 'Primary receiving & quality-check facility for affiliated Indian sellers.' },
  { region: 'India — Regional partner sites', role: 'Additional receiving points used to reduce seller-side domestic shipping time.' },
  { region: 'Sri Lanka — Clearance & last-mile', role: 'Where consolidated shipments clear customs before handoff to local delivery.' },
]

const steps = [
  { icon: PackageSearch, title: 'Received', text: 'Sellers ship your purchased item to a Wishdrop facility, not to you directly.' },
  { icon: ScanEye, title: 'Quality checked', text: 'Our team confirms the item matches your order before it moves further.' },
  { icon: Truck, title: 'Consolidated & shipped', text: 'Your item is packed for international transit toward Sri Lanka.' },
]

export default function WarehousesPage() {
  return (
    <main>
      <PageHero
        eyebrow="Behind the scenes"
        title="Our"
        accent="facilities."
        intro="You never need a warehouse account, an overseas address or to declare a parcel yourself. Wishdrop buys the item and routes it through our own network — here’s how."
      />

      <Section eyebrow="Inside the facility" title="What happens to your item">
        <Steps columns={3} steps={steps} />
      </Section>

      <Section eyebrow="Where" title="Where our facilities are">
        <div className="grid gap-4 md:grid-cols-3">
          {facilities.map((f, i) => (
            <div key={f.region} className={`rounded-3xl p-6 ${i === facilities.length - 1 ? 'bg-indigo text-parchment' : 'bg-card ring-1 ring-ink/[0.08]'}`}>
              <MapPin size={20} className={i === facilities.length - 1 ? 'text-gold' : 'text-teal-deep'} />
              <h3 className={`mt-4 font-display text-lg font-semibold ${i === facilities.length - 1 ? '' : 'text-indigo'}`}>{f.region}</h3>
              <p className={`mt-1.5 font-body text-sm leading-relaxed ${i === facilities.length - 1 ? 'text-parchment/70' : 'text-ink/60'}`}>{f.role}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Callout tone="gold">
            These facilities are run by Wishdrop and our logistics partners for order processing only. They aren&apos;t
            drop-off points, and we can&apos;t accept walk-in parcels or visitors.
          </Callout>
        </div>
      </Section>

      <Section width="narrow">
        <Callout>
          <span className="font-semibold text-ink">Why this matters to you: </span>
          because Wishdrop buys on your behalf, you never give a seller an address yourself. You shop or send a link, and
          everything after purchase runs through this network automatically. More on our{' '}
          <Link href="/shipping" className="font-semibold text-teal-deep underline underline-offset-2">
            Shipping &amp; Delivery
          </Link>{' '}
          page.
        </Callout>
      </Section>

      <CtaEnvelope title="Let our team" accent="do the legwork." primary={{ href: '/account', label: 'Start a request' }} />
    </main>
  )
}
