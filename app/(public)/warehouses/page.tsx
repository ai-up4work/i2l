import Link from 'next/link'
import { ArrowRight, MapPin, PackageSearch, ScanEye, Truck } from 'lucide-react'

export const metadata = {
  title: 'Our Facilities | WishDrop',
  description: 'Where WishDrop receives, quality-checks, and consolidates your orders before they ship to Sri Lanka.',
}

const facilities = [
  { region: 'India — National hub', role: 'Primary receiving & quality-check facility for affiliated Indian sellers.' },
  { region: 'India — Regional partner sites', role: 'Additional receiving points used to reduce seller-side domestic shipping time.' },
  { region: 'Sri Lanka — Clearance & last-mile', role: 'Where consolidated shipments clear customs before handoff to local delivery.' },
]

const steps = [
  { icon: PackageSearch, title: 'Received', text: 'Sellers ship your purchased item to a WishDrop facility, not to you directly.' },
  { icon: ScanEye, title: 'Quality checked', text: 'Our team confirms the item matches your order before it moves further.' },
  { icon: Truck, title: 'Consolidated & shipped', text: 'Your item is packed for international transit toward Sri Lanka.' },
]

export default function WarehousesPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 lg:px-10 lg:py-24">
      <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
        Behind the scenes
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        Our facilities
      </h1>
      <p className="mt-4 max-w-2xl font-body text-base leading-relaxed text-ink/65">
        Unlike a package-forwarding service, you never need to open a warehouse account, get an
        overseas address, or declare an inbound parcel yourself. WishDrop purchases the item and
        routes it through our own network of facilities on your behalf — here's how that works.
      </p>

      <div className="mt-12 grid gap-5 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-ink/10 bg-card p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal/10 text-teal-deep">
              <Icon size={20} />
            </div>
            <h2 className="mt-4 font-display text-lg font-semibold text-ink">{title}</h2>
            <p className="mt-1.5 font-body text-sm leading-relaxed text-ink/60">{text}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-3xl border border-ink/10 bg-card p-6 sm:p-9">
        <h2 className="font-display text-xl font-semibold text-ink">Where our facilities are</h2>
        <div className="mt-5 flex flex-col divide-y divide-ink/10">
          {facilities.map((f) => (
            <div key={f.region} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
              <MapPin size={18} className="mt-0.5 flex-none text-gold-deep" />
              <div>
                <p className="font-body text-sm font-semibold text-ink">{f.region}</p>
                <p className="mt-0.5 font-body text-xs text-ink/55">{f.role}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 font-body text-xs text-ink/45">
          These facilities are operated by WishDrop and our logistics partners for order
          processing only — they are not customer drop-off points, and we're unable to accept
          walk-in parcels or visitors.
        </p>
      </div>

      <div className="mt-10 rounded-2xl border border-ink/10 bg-parchment/60 p-6">
        <h2 className="font-display text-base font-semibold text-ink">Why this matters to you</h2>
        <p className="mt-2 font-body text-sm leading-relaxed text-ink/65">
          Because WishDrop purchases on your behalf, you never have to give a seller a facility
          address yourself — you just submit a request or shop our catalogue, and everything after
          purchase happens through this network automatically. Learn more on our{' '}
          <Link href="/shipping" className="text-teal-deep underline underline-offset-2">Shipping &amp; Delivery</Link> page.
        </p>
      </div>

      <div className="mt-10 flex justify-center">
        <Link
          href="/account/requests/new"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-body text-sm font-semibold text-parchment transition-colors hover:bg-teal-deep"
        >
          Start a request
          <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  )
}
