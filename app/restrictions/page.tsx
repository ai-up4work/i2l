import Link from 'next/link'
import Header from '@/components/landing/Header'
import Footer from '@/components/landing/Footer'

const categories = [
  { title: 'Dangerous goods', items: ['Flammable liquids and gases', 'Fireworks and explosives', 'Compressed gas cylinders', 'Batteries shipped separately'] },
  { title: 'Weapons and illegal goods', items: ['Firearms, ammunition and replicas', 'Knives and offensive weapons', 'Illegal drugs and controlled substances', 'Counterfeit products'] },
  { title: 'Living things', items: ['Animals and insects', 'Plants, seeds and soil', 'Human remains and biological samples', 'Perishable food'] },
  { title: 'Restricted electronics', items: ['Loose lithium batteries', 'Radioactive equipment', 'Signal jammers', 'Unlicensed transmitters'] },
  { title: 'Documents and valuables', items: ['Cash and negotiable instruments', 'Passports and identity documents', 'Precious stones and bullion', 'Lottery tickets'] },
  { title: 'Other restricted items', items: ['Alcohol and tobacco', 'Aerosols and perfumes', 'Medical products', 'Items prohibited by customs'] },
]

export default function RestrictionsPage() {
  return <main className="bg-paper text-ink"><Header /><section className="mx-auto max-w-6xl px-6 pb-20 pt-16 lg:px-10"><p className="font-label text-xs uppercase tracking-[0.22em] text-rust">Shipping guide</p><h1 className="mt-4 max-w-3xl font-display text-5xl font-semibold leading-tight text-blue-deep">Prohibited items catalog.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-ink/65">Please check this list before shopping. Customs rules vary by destination, and parcels containing prohibited items may be delayed, returned, or destroyed.</p><div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{categories.map((category) => <article key={category.title} className="rounded-2xl border border-ink/10 bg-card p-6 transition hover:-translate-y-1 hover:shadow-lg hover:shadow-ink/5"><div className="flex items-start justify-between gap-4"><h2 className="font-display text-xl font-semibold text-blue-deep">{category.title}</h2><span className="font-label text-xs text-rust">ALL</span></div><ul className="mt-5 flex flex-col gap-3 text-sm leading-6 text-ink/65">{category.items.map((item) => <li key={item} className="flex gap-2"><span className="text-rust">×</span>{item}</li>)}</ul></article>)}</div><div className="mt-8 rounded-2xl border border-rust/20 bg-rust/5 p-6"><h2 className="font-display text-2xl font-semibold text-blue-deep">Not sure about an item?</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">Send us the product link before purchasing. Our team can help confirm whether it is suitable for forwarding.</p><Link href="/account/requests/new" className="mt-5 inline-flex rounded-md bg-rust px-5 py-3 text-sm font-semibold text-paper">Ask about an item</Link></div></section><Footer /></main>
}
