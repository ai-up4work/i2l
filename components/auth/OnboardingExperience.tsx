'use client'

import { useState } from 'react'
import { Check, ChevronDown, Compass, Link2, Package, Ticket, Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'

const goals = ['Land the limited drop', "Get something I can't buy here", 'Skip the overseas checkout', "Know it's authentic", 'See all costs up front', 'Restock my regulars', 'Just exploring']
const countries = ['Japan', 'United States', 'Korea', 'China', 'United Kingdom', 'Thailand', 'Taiwan', 'Australia', 'Italy', 'Canada', 'Other / not sure']
const coupons = ['$3 off upon $45', '$15 off upon $198', '$100 off upon $1200', 'JP New Chiba Warehouse | $8 off upon $90', 'THANK YOU | $24 off instantly', 'eBay | $5 Instant Shipping Discount']

export default function OnboardingExperience() {
  const router = useRouter()
  const [goal, setGoal] = useState(goals[0])
  const [country, setCountry] = useState('Thailand')
  const [method, setMethod] = useState<'buy' | 'forward'>('forward')
  const [revealed, setRevealed] = useState<number | null>(null)

  return (
    <main className="min-h-screen bg-card text-ink">
      <div className="h-12 bg-ink" />
      <div className="mx-auto max-w-5xl px-5 pb-16 pt-8 sm:px-8 lg:px-0">
        <div className="font-display text-2xl font-bold tracking-tight text-rust">BUY&amp;SHIP</div>
        <div className="mt-6 flex gap-2" aria-label="Onboarding progress"><span className="h-1 flex-1 rounded-full bg-rust" /><span className="h-1 flex-1 rounded-full bg-rust" /><span className="h-1 flex-1 rounded-full bg-rust" /></div>
        <p className="mt-8 flex items-center gap-2 text-sm font-bold text-rust"><span className="size-2 rounded-sm bg-rust" /> Get started</p>
        <h1 className="mt-5 max-w-3xl text-balance font-display text-4xl font-bold leading-tight sm:text-5xl">What are you shopping for this time?</h1>
        <p className="mt-3 max-w-2xl text-lg leading-7 text-ink/70">Tell us your goal this time and we&apos;ll show you the fastest, safest way to get it.</p>

        <section className="mt-10" aria-labelledby="goal-title"><h2 id="goal-title" className="flex items-center gap-3 text-xl font-bold"><span className="grid size-8 place-items-center rounded-lg bg-rust/10 text-sm text-rust">1</span> Your goal this time</h2><div className="mt-4 flex flex-wrap gap-2.5">{goals.map((item) => <button key={item} onClick={() => setGoal(item)} className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${goal === item ? 'border-rust bg-rust/5 text-rust' : 'border-ink/15 hover:border-rust/50'}`}>{item}</button>)}</div></section>
        <section className="mt-9" aria-labelledby="country-title"><h2 id="country-title" className="flex items-center gap-3 text-xl font-bold"><span className="grid size-8 place-items-center rounded-lg bg-rust/10 text-sm text-rust">2</span> Where are you shopping from</h2><div className="mt-4 flex flex-wrap gap-2.5">{countries.map((item) => <button key={item} onClick={() => setCountry(item)} className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${country === item ? 'border-rust bg-rust/5 text-rust' : 'border-ink/15 hover:border-rust/50'}`}>{item}{item === 'Other / not sure' && <span className="ml-2 text-xs font-normal text-ink/50">type it</span>}</button>)}</div></section>

        <aside className="mt-9 rounded-2xl border border-rust/20 bg-paper p-6"><h2 className="flex items-center gap-2 font-bold text-rust"><Compass size={18} /> Your tips</h2><ul className="mt-4 grid gap-3 border-l-2 border-rust/15 pl-5 text-sm leading-6 text-ink/80"><li>Use a concierge with a long track record.</li><li>Designer labels, celebrity merchandise and viral products are best ordered through trusted partners.</li><li>Some local stores require a local mobile number and payment method.</li><li>Pre-order culture means zero buyer protection once you transfer funds.</li></ul><div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-rust/15 pt-4 text-sm font-semibold text-rust"><span><Check size={15} className="mr-1 inline" /> Order confirmed instantly</span><span><Check size={15} className="mr-1 inline" /> Notified at every step</span><span><Check size={15} className="mr-1 inline" /> Full refund if unavailable</span></div></aside>

        <section className="mt-10" aria-labelledby="method-title"><h2 id="method-title" className="flex items-center gap-3 text-xl font-bold"><span className="grid size-8 place-items-center rounded-lg bg-rust/10 text-sm text-rust">3</span> Pick a way to start — and unlock your new-user coupon:</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">{[{id: 'buy' as const, title: 'We buy it for you', tag: 'Proxy buy', icon: Link2, body: 'Paste the product link — we buy and pay for you. Works with almost any overseas store.'}, {id: 'forward' as const, title: 'You buy it yourself', tag: 'Forwarding', icon: Package, body: 'You buy from the overseas store, using our warehouse address. Consolidate parcels and send them home together.'}].map(({ id, title, tag, icon: Icon, body }) => <button key={id} onClick={() => setMethod(id)} className={`rounded-2xl border p-6 text-left transition ${method === id ? 'border-2 border-rust bg-paper' : 'border-ink/15 hover:border-rust/50'}`}><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-rust/10 text-rust"><Icon size={19} /></span><span className="font-display text-xl font-bold">{title}</span><span className="rounded-md bg-rust/10 px-2 py-1 text-xs font-bold text-rust">{tag}</span></div><p className="mt-5 text-sm leading-6 text-ink/70">{body}</p><div className="mt-5 flex items-center gap-2 text-sm font-bold text-rust"><Ticket size={16} /> Unlock your coupon <ChevronDown size={15} className="rotate-[-90deg]" /></div></button>)}</div></section>

        <div className="mt-12 text-center"><p className="font-display text-3xl font-bold text-rust">New User Exclusive</p><div className="mt-5 rounded-2xl bg-blue p-6 text-left text-paper shadow-lift"><div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-paper/80"><Wallet size={18} /> Shipping credit</div><p className="mt-2 font-display text-5xl font-bold">Rs 1,200</p><p className="mt-3 text-sm text-paper/75">Complete phone verification to claim. Use the credit to offset your first shipping fee.</p><button onClick={() => router.push('/account/settings')} className="mt-6 w-full rounded-xl bg-card px-5 py-3.5 font-bold text-blue">Verify phone to claim</button></div></div>

        <section className="mt-10"><h2 className="flex items-center gap-2 text-xl font-bold">Coupons you can use <span className="text-rust">• 8</span></h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{coupons.map((coupon, index) => <div key={coupon} className="flex items-center justify-between gap-4 rounded-xl border border-ink/15 p-4"><div><span className="rounded-md bg-rust/10 px-2 py-1 text-xs font-bold text-rust">Shipping</span><p className="mt-2 text-sm font-bold">Limited Shipping Offer | {coupon}</p><p className="mt-1 text-xs text-ink/55">Valid until 2026-08-31</p></div><button onClick={() => setRevealed(index)} className="shrink-0 rounded-lg bg-rust px-3 py-2 text-xs font-bold text-paper">{revealed === index ? 'I2L-' + (index + 1) + '20' : 'Reveal code'}</button></div>)}</div><button onClick={() => router.push('/account/warehouses')} className="mt-8 w-full text-center text-sm text-ink/65 underline underline-offset-4">Verify later — first, set up your warehouse address →</button></section>
      </div>
    </main>
  )
}
