// app/(public)/shop-from-india/[slug]/page.tsx — /shop-from-india/<store>
//
// "How to buy from <store> in Sri Lanka" guide. Content: content/store-guides.ts.
// The worked price example is computed live from the pricing engine, so it
// always matches checkout. Structured data: Article + FAQPage + Breadcrumbs.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, Link2, PackageCheck, ShieldCheck, Truck, Wallet } from 'lucide-react'
import { ButtonLink, Callout, Card, CtaEnvelope, FAQ, PageHero, Section, Steps } from '@/components/public/PageKit'
import JsonLd, { articleSchema, breadcrumbSchema, faqSchema } from '@/components/seo/JsonLd'
import { SHARED_GUIDE_FAQS, STORE_GUIDES, getStoreGuide } from '@/content/store-guides'
import { ensurePricingSettings } from '@/lib/pricing-settings-server'
import { getDualDeliveryPricing } from '@/lib/pricing'
import { isEconomyLocked } from '@/lib/feature-flags'
import { pageMetadata } from '@/lib/seo'

// Prices on this page follow the live pricing engine.
export const revalidate = 3600

export function generateStaticParams() {
  return STORE_GUIDES.map((g) => ({ slug: g.slug }))
}
export const dynamicParams = false

const EXAMPLE = { price: 2500, currency: 'INR', weightKg: 0.5 }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getStoreGuide((await params).slug)
  if (!guide) return {}
  return pageMetadata({
    title: `How to Buy from ${guide.name} in Sri Lanka (Delivered, Priced in LKR)`,
    description: `${guide.name} doesn’t deliver to Sri Lanka — Wishdrop buys it for you in India, quality-checks it and delivers to your door. Prices in rupees, nothing more to pay on arrival.`,
    path: `/shop-from-india/${guide.slug}`,
    type: 'article',
  })
}

export default async function StoreGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getStoreGuide((await params).slug)
  if (!guide) notFound()

  const settings = await ensurePricingSettings()
  const example = getDualDeliveryPricing(EXAMPLE, settings)
  const economyOn = !isEconomyLocked(settings)
  const path = `/shop-from-india/${guide.slug}`
  const faqs = [...guide.faqs, ...SHARED_GUIDE_FAQS(guide.name)]
  const reviewed = new Date(guide.reviewed).toLocaleDateString('en-LK', { day: 'numeric', month: 'long', year: 'numeric' })
  const others = STORE_GUIDES.filter((g) => g.slug !== guide.slug)

  const steps = [
    { icon: Link2, title: `Find it on ${guide.name}`, text: `Pick the product, size and colour on ${guide.domain} and copy the link.` },
    { icon: Wallet, title: 'Get your price in LKR', text: 'Paste the link and see one delivered total in rupees — the item with shipping and handling, service and delivery.' },
    { icon: ShieldCheck, title: 'Pay, we buy it', text: 'Pay by card or mobile wallet. We buy the item in India on your behalf.' },
    { icon: PackageCheck, title: 'Quality check', text: 'It arrives at our facility, where we check it matches your order before it ships.' },
    { icon: Truck, title: 'Delivered to your door', text: 'We handle the import and deliver to your address. Track every step in your account.' },
  ]

  const rows = [
    { label: 'Item, shipping & handling', value: example.express.formattedPrice },
    { label: 'Service charge', value: example.express.formattedServiceCharge },
    { label: 'Delivery to your door', value: example.express.formattedDeliveryFee },
  ]

  return (
    <main>
      <JsonLd
        data={[
          articleSchema({
            title: `How to buy from ${guide.name} in Sri Lanka`,
            description: guide.intro,
            path,
            datePublished: '2026-10-26',
            dateModified: guide.reviewed,
          }),
          faqSchema(faqs),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Shop from India', path: '/shop-from-india' },
            { name: guide.name, path },
          ]),
        ]}
      />

      <PageHero
        eyebrow={`${guide.name} · Sri Lanka`}
        title={`How to buy from ${guide.name}`}
        accent="in Sri Lanka."
        intro={guide.intro}
        meta={<>Last reviewed {reviewed} by the Wishdrop team</>}
        actions={
          <>
            <ButtonLink href="/estimate">Price an item</ButtonLink>
            <ButtonLink href="/stores" variant="secondary">Browse our stores</ButtonLink>
          </>
        }
      />

      <Section eyebrow="Short answer" title={`Does ${guide.name} deliver to Sri Lanka?`}>
        <Callout icon={CheckCircle2}>
          <strong>{guide.name}</strong> ({guide.domain}) is {guide.knownFor.charAt(0).toLowerCase() + guide.knownFor.slice(1)} It delivers to
          Indian addresses only, so Sri Lankan shoppers can’t order directly. With Wishdrop you send the link, we buy it in India, check it, and
          deliver it to your door in Sri Lanka — one price in LKR, nothing more to pay when it arrives.
        </Callout>
      </Section>

      <Section eyebrow="Step by step" title={`Buying from ${guide.name} with Wishdrop`}>
        <Steps steps={steps} columns={5} />
      </Section>

      <Section
        eyebrow="What it costs"
        title="A worked example, at today’s rates"
        intro={`A ₹${EXAMPLE.price.toLocaleString('en-IN')} item weighing ${EXAMPLE.weightKg} kg, delivered by Express. Rates come from our live pricing, so this matches what you’d pay at checkout today.`}
      >
        <Card className="max-w-xl p-6">
          <dl className="divide-y divide-ink/[0.08] font-body text-sm">
            {rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-4 py-2.5">
                <dt className="text-ink/60">{r.label}</dt>
                <dd className="tabular-nums text-ink">{r.value}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 pt-3 text-base font-semibold">
              <dt className="text-indigo">Total, delivered (Express)</dt>
              <dd className="tabular-nums text-indigo">{example.express.formattedActualTotal}</dd>
            </div>
          </dl>
          <p className="mt-4 font-body text-xs leading-relaxed text-ink/50">
            Express usually arrives in about 12–15 days.
            {economyOn && <> Economy costs {example.economy.formattedActualTotal} and usually takes about 3–4 weeks.</>} Heavier items cost more —
            see <Link href="/shipping/pricing" className="text-teal-deep underline">how pricing works</Link> or use the{' '}
            <Link href="/estimate" className="text-teal-deep underline">price estimator</Link>.
          </p>
        </Card>
      </Section>

      <Section eyebrow="Popular picks" title={`What Sri Lankans buy from ${guide.name}`}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {guide.popular.map((item) => (
            <li key={item} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 font-body text-sm text-ink/75 ring-1 ring-ink/[0.08]">
              <CheckCircle2 size={16} className="flex-none text-teal-deep" />
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Before you order" title={`Tips for buying from ${guide.name}`}>
        <ul className="max-w-3xl space-y-3 font-body text-[15px] leading-relaxed text-ink/70">
          {guide.tips.map((tip) => (
            <li key={tip} className="flex gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-gold" />
              {tip}
            </li>
          ))}
        </ul>
        <p className="mt-5 font-body text-sm text-ink/55">
          Some items can’t be flown — see our <Link href="/prohibited-items" className="text-teal-deep underline">prohibited items</Link> list.
        </p>
      </Section>

      <Section eyebrow="Questions" title={`${guide.name} to Sri Lanka: FAQs`}>
        <FAQ items={faqs} />
      </Section>

      <Section eyebrow="More stores" title="Other Indian stores you can shop from Sri Lanka">
        <div className="flex flex-wrap gap-2">
          {others.map((g) => (
            <Link
              key={g.slug}
              href={`/shop-from-india/${g.slug}`}
              className="rounded-full bg-card px-4 py-2 font-body text-sm font-semibold text-indigo ring-1 ring-ink/10 hover:ring-teal/40"
            >
              {g.name}
            </Link>
          ))}
        </div>
      </Section>

      <CtaEnvelope
        title="Found something on"
        accent={`${guide.name}?`}
        text="See the delivered price in rupees in seconds — no account needed for an estimate."
        primary={{ href: '/estimate', label: 'Price an item' }}
        secondary={{ href: '/shipping', label: 'How delivery works' }}
      />
    </main>
  )
}
