import Link from 'next/link'
import Header from '@/components/landing/Header'
import Footer from '@/components/landing/Footer'

const rates = [
  ['Sri Lanka', 'US$12.00', 'US$5.50'],
  ['India', 'US$10.00', 'US$4.50'],
  ['United Kingdom', 'US$16.00', 'US$7.00'],
  ['United States', 'US$18.00', 'US$8.00'],
]
const benefits = ['Free shipping protection', 'Free consolidation of parcels', '30 days free storage', 'Doorstep delivery available']

export default function PricingPage() {
  return <main className="bg-paper text-ink"><Header /><section className="mx-auto max-w-6xl px-6 pb-16 pt-16 lg:px-10"><p className="font-label text-xs uppercase tracking-[0.22em] text-rust">Shipping rates</p><h1 className="mt-4 max-w-2xl font-display text-5xl font-semibold leading-tight text-blue-deep">Weight-based shipping that makes your money go further.</h1><p className="mt-5 max-w-xl text-base leading-7 text-ink/65">Send everything you love from India to Sri Lanka with simple rates based on the total parcel weight, not the size of the box.</p><div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]"><div className="overflow-hidden rounded-2xl border border-ink/10 bg-card"><div className="border-b border-ink/10 px-6 py-5"><h2 className="font-display text-2xl font-semibold">Overseas warehouse rates</h2><p className="mt-1 text-sm text-ink/55">Delivered to our Sri Lankan sorting centre.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead className="bg-blue/5 text-xs uppercase tracking-wider text-ink/55"><tr><th className="px-6 py-4">Warehouse</th><th className="px-6 py-4">First pound</th><th className="px-6 py-4">Each extra pound</th></tr></thead><tbody>{rates.map(([country, first, extra]) => <tr key={country} className="border-t border-ink/10"><td className="px-6 py-5 font-semibold">{country}</td><td className="px-6 py-5 text-rust">{first}</td><td className="px-6 py-5">{extra}</td></tr>)}</tbody></table></div></div><aside className="rounded-2xl bg-blue-deep p-7 text-paper"><p className="font-label text-xs uppercase tracking-[0.18em] text-gold">Included with every shipment</p><h2 className="mt-4 font-display text-3xl font-semibold">More value, fewer surprises.</h2><ul className="mt-7 flex flex-col gap-4">{benefits.map((benefit) => <li key={benefit} className="flex gap-3 text-sm text-paper/80"><span className="text-gold">✓</span>{benefit}</li>)}</ul><Link href="/account/shipments/new" className="mt-8 inline-flex rounded-md bg-gold px-5 py-3 text-sm font-semibold text-blue-deep">Ship with us</Link></aside></div></section><Footer /></main>
}
