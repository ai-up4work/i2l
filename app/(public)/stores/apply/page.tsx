// app/(public)/stores/apply/page.tsx
//
// "Sell on Wishdrop" — written for small sellers who run their shop on
// Instagram, Facebook or WhatsApp. Leads with what changes for them
// (overseas orders without the DMs, payment chasing and shipping), shows
// how it works as the real sequence it is, answers the questions they'd
// ask, then the application form.

import Link from 'next/link'
import SellerApplyForm from '@/components/shared/SellerApplyForm'
import PostToListing from '@/components/seller/PostToListing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/stores/apply',
  title: 'Sell on Wishdrop',
  description:
    'Sell your Instagram and Facebook products to shoppers in Sri Lanka. Wishdrop handles payment, shipping, customs and delivery. You set your price.',
})

const steps = [
  {
    title: 'Apply',
    text: 'Tell us about your shop and send your Instagram or Facebook page. We look at every application ourselves.',
  },
  {
    title: 'We set up your store',
    text: 'Your own page on Wishdrop, with your logo, cover photo and links. Add products from your phone, photos and reels included, or send them to us and we add them.',
  },
  {
    title: 'Shoppers in Sri Lanka order',
    text: 'They pay in rupees on Wishdrop, with shipping included in the price they see. No DMs, no bank transfers to chase.',
  },
  {
    title: 'We buy from you and deliver',
    text: 'We buy each item at the price you set, check it, ship it and deliver it to the shopper’s door. Customs and customer questions are ours.',
  },
]

const before = [
  'Overseas buyers can’t pay you easily',
  'Every order is a long DM thread',
  'Shipping abroad and customs are on you',
  'A lost parcel is your problem',
]
const after = [
  'Shoppers pay Wishdrop in rupees',
  'Orders arrive ready to fulfil',
  'We ship, clear customs and deliver',
  'We handle questions, returns and tracking',
]

const faqs = [
  {
    q: 'Does it cost anything to join?',
    a: 'No. You set your price and that’s what we pay you for each item. Wishdrop adds its own margin and shipping on top of your price for shoppers.',
  },
  {
    q: 'I only sell on Instagram. Can I still apply?',
    a: 'Yes, that’s who this is for. You don’t need a website. Your Instagram or Facebook page is enough for us to see what you sell.',
  },
  {
    q: 'How do I add my products?',
    a: 'From your phone, in your seller account: photos, reels, price, sizes and colours, and how many you have. Or send them to us on WhatsApp and we add them for you.',
  },
  {
    q: 'How does the item get to the shopper?',
    a: 'You hand the item over in India and we take it from there: checking, international shipping, customs and delivery in Sri Lanka. We agree the hand-over details with you when your store is set up.',
  },
  {
    q: 'When do I get paid?',
    a: 'We pay you for each item when we buy it from you, on the payment terms agreed when your store is set up.',
  },
]

export default function StoresApplyPage() {
  return (
    <main className="bg-parchment">
      {/* ── Hero ── */}
      <section className="overflow-hidden bg-indigo text-parchment">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-14 sm:px-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:py-24">
          <div>
            <h1 className="max-w-[15ch] font-display text-[2.4rem] font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Sell to Sri Lanka from your Instagram.
            </h1>
            <p className="mt-5 max-w-lg font-body text-base leading-relaxed text-parchment/75 sm:text-lg">
              Your products, your photos, your price. Shoppers in Sri Lanka buy from your own store on Wishdrop, and we
              take care of payment, shipping, customs and delivery.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#apply" className="flex h-12 items-center justify-center rounded-xl bg-gold px-7 font-body text-[15px] font-semibold text-indigo transition-colors hover:bg-parchment">
                Apply to sell
              </a>
              <Link href="/seller/login" className="flex h-12 items-center justify-center rounded-xl border border-parchment/30 px-7 font-body text-[15px] font-semibold text-parchment transition-colors hover:border-parchment">
                I already sell with Wishdrop
              </Link>
            </div>
          </div>
          <div className="pb-4 lg:pb-0">
            <PostToListing />
          </div>
        </div>
      </section>

      {/* ── Before / after ── */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:px-10 lg:py-24">
        <h2 className="max-w-2xl font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Overseas orders, without the hard parts.
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-ink/10 p-6 sm:p-8">
            <p className="font-body text-sm font-semibold text-ink/50">Selling abroad over DMs</p>
            <ul className="mt-4 flex flex-col gap-3">
              {before.map((t) => (
                <li key={t} className="flex gap-3 font-body text-[15px] text-ink/60">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-ink/25" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-[0_24px_60px_-36px_rgba(8,39,79,.45)] ring-1 ring-teal/20 sm:p-8">
            <p className="font-body text-sm font-semibold text-teal-deep">Selling with Wishdrop</p>
            <ul className="mt-4 flex flex-col gap-3">
              {after.map((t) => (
                <li key={t} className="flex gap-3 font-body text-[15px] font-medium text-ink">
                  <svg className="mt-1 flex-none text-teal" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── How it works (a real sequence, so it's numbered) ── */}
      <section className="border-y border-ink/10 bg-white/60">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10 lg:py-24">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">How it works</h2>
          <ol className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {steps.map((s, i) => (
              <li key={s.title} className="relative">
                <span className="font-display text-5xl font-semibold text-gold">{i + 1}</span>
                <h3 className="mt-3 font-display text-xl font-semibold text-ink">{s.title}</h3>
                <p className="mt-2 font-body text-[15px] leading-relaxed text-ink/60">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Questions + form ── */}
      <section className="mx-auto grid max-w-6xl gap-14 px-6 py-16 sm:px-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-24">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Questions sellers ask</h2>
          <div className="mt-8 divide-y divide-ink/10 border-y border-ink/10">
            {faqs.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-body text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full border border-ink/20 text-ink/60 transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-3 font-body text-[15px] leading-relaxed text-ink/60">{f.a}</p>
              </details>
            ))}
          </div>
        </div>

        <div id="apply" className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-[0_24px_60px_-36px_rgba(8,39,79,.45)] ring-1 ring-ink/10 sm:p-10">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">Apply to sell</h2>
          <p className="mt-2 mb-8 font-body text-[15px] text-ink/60">Takes about two minutes. We reply on WhatsApp.</p>
          <SellerApplyForm />
        </div>
      </section>
    </main>
  )
}
