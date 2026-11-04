// app/(public)/shipping/pricing/page.tsx
//
// How a shopper's total is put together — in general terms on purpose.
//
// This page used to publish the Pricing engine's internal rates (freight
// and customs clearance per kg, postal per kg, the customs-cascade freight
// rate) and link to a duty/tax breakdown. That exposed how Wishdrop's price
// is built and committed us to line items we don't itemise on quotes. Now it
// explains what the price depends on (store price, weight, delivery speed)
// and shows only the two flat lines every breakdown already shows: the
// service charge and the delivery fee.
import { Package, Scale } from 'lucide-react'
import { Card, CtaEnvelope, IconCard, PageHero, Section } from '@/components/public/PageKit'
import { isEconomyLocked } from '@/lib/feature-flags'
import { ensurePricingSettings } from '@/lib/pricing-settings-server'
import PriceEstimator from '@/components/shared/PriceEstimator'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/shipping/pricing',
  title: 'Shipping Pricing | Wishdrop',
  description: 'What goes into your Wishdrop total: the item with international shipping and handling, a flat service charge, and doorstep delivery.',
})

export default async function ShippingPricingPage() {
  // The two flat amounts come from the saved pricing settings
  // (Admin → Pricing engine), so they always match real quotes.
  const pricingSettings = await ensurePricingSettings()
  const { storefront: sf } = pricingSettings
  const economyLocked = isEconomyLocked(pricingSettings)
  const lkr = (n: number) => `LKR ${n.toLocaleString('en-LK')}`
  const expressRows = [
    { label: 'Price', value: 'The item, with international shipping and handling' },
    { label: 'Service charge', value: `Flat ${lkr(sf.extraMarginLKR)} per item` },
    { label: 'Delivery', value: `Flat ${lkr(sf.deliveryFeeLKR)} per item, to your door` },
  ]
  const economyRows = [
    { label: 'Price', value: 'The item, with international shipping and handling' },
    { label: 'Service charge', value: `Flat ${lkr(sf.extraMarginLKR)} per item` },
    { label: 'Delivery', value: `Flat ${lkr(sf.economyDeliveryFeeLKR)} per item, to your door` },
  ]

  const RateCard = ({
    name,
    tag,
    tagClass,
    text,
    rows,
  }: {
    name: string
    tag: string
    tagClass: string
    text: string
    rows: { label: string; value: string }[]
  }) => (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold text-indigo">{name}</h2>
        <span className={`rounded-full px-3 py-1 font-body text-xs font-semibold ${tagClass}`}>{tag}</span>
      </div>
      <p className="mt-1.5 font-body text-sm text-ink/55">{text}</p>
      <dl className="mt-5 divide-y divide-dashed divide-ink/10 rounded-2xl bg-parchment/60 px-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="font-body text-sm text-ink/55">{row.label}</dt>
            <dd className="text-right font-body text-sm font-semibold text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )

  return (
    <main>
      <PageHero
        eyebrow="Shipping & pricing"
        title="How your total"
        accent="is put together."
        intro="One price in rupees, shown before you pay: the item with international shipping and handling, a flat service charge, and delivery to your door. Nothing more to pay when it arrives."
        meta="Your live quote always shows the exact total for the item you choose."
      />

      <Section
        id="estimate"
        eyebrow="Try it"
        title="Estimate a price"
        intro="Know the price in rupees? Type it in with roughly how heavy it is, and see about what it costs delivered to you."
      >
        <div className="rounded-[28px] bg-card p-4 ring-1 ring-ink/[0.08] sm:p-6">
          <PriceEstimator />
        </div>
      </Section>

      <Section>
        <div className="grid gap-5 lg:grid-cols-2">
          <RateCard name="Express" tag="Faster" tagClass="bg-teal/10 text-teal-deep" text="Usually about 12–15 days." rows={expressRows} />
          <RateCard
            name="Economy"
            tag={economyLocked ? 'Coming soon' : 'Lower cost'}
            tagClass="bg-gold/15 text-gold-deep"
            text="Usually about 3–4 weeks, for a lower price."
            rows={economyRows}
          />
        </div>
      </Section>

      <Section>
        <div className="grid gap-5 lg:grid-cols-2">
          <IconCard
            icon={Scale}
            title="Weight matters"
            text="Heavier and bulkier items cost more to bring over, so two things at the same shop price can have different totals. If the store doesn’t list a weight, you can pick the kind of item; our team checks the weight and confirms your final price before you pay."
          />
          <IconCard
            icon={Package}
            title="One price, all in"
            text="The total covers buying the item, quality-checking it, shipping it to Sri Lanka and delivering it to you. You don’t pay anything extra at your door, and we confirm the final price with you before asking for payment."
            tone="gold"
          />
        </div>
      </Section>

      <CtaEnvelope
        title="See the exact price"
        accent="in seconds."
        text="Paste a product link and we’ll show the full delivered price in rupees — no account needed to check."
        primary={{ href: '/', label: 'Get a quote' }}
      />
    </main>
  )
}
