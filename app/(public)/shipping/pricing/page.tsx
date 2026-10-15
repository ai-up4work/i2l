import Link from 'next/link'
import { Landmark, Scale } from 'lucide-react'
import { Card, CtaEnvelope, IconCard, PageHero, Section } from '@/components/public/PageKit'
import { ECONOMY_LOCKED } from '@/lib/feature-flags'
import { ensurePricingSettings } from '@/lib/pricing-settings-server'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/shipping/pricing',
  title: 'Shipping Pricing | Wishdrop',
  description: 'How Wishdrop calculates freight, service fees, and delivery pricing by weight and delivery speed.',
})

export default async function ShippingPricingPage() {
  // Published rates come straight from the saved pricing settings
  // (Admin → Pricing engine), so this page can't drift from real prices.
  const { storefront: sf, customs } = await ensurePricingSettings()
  const expressRows = [
    { label: 'Product cost', value: 'Seller\u2019s price, converted to LKR' },
    { label: 'Freight charge', value: `~LKR ${sf.freightRatePerKgLKR.toLocaleString()} per kg, billed in ${sf.weightBlockKg}kg blocks` },
    { label: 'Customs clearance', value: `~LKR ${sf.customsClearanceRatePerKgLKR.toLocaleString()} per kg, billed in ${sf.weightBlockKg}kg blocks` },
    { label: 'Delivery fee', value: `Flat LKR ${sf.deliveryFeeLKR}` },
    { label: 'Service margin', value: `Flat LKR ${sf.extraMarginLKR}` },
  ]
  const economyRows = [
    { label: 'Product cost', value: 'Seller\u2019s price, converted to LKR' },
    { label: 'Postal charges', value: `~LKR ${sf.economyPostalRatePerKgLKR.toLocaleString()} per kg (single line, no separate freight/customs split)` },
    { label: 'Service margin', value: `Flat LKR ${sf.extraMarginLKR}` },
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
        accent="is calculated."
        intro="Every quote is built from a few clear ingredients: the product’s price, its weight, your delivery speed, and customs charges. Here’s exactly what goes into it."
        meta={
          <>
            Current published rates, for illustration — your live quote always shows the exact total. Some products use
            full customs pricing instead (see{' '}
            <Link href="/taxation" className="text-teal-deep underline underline-offset-2">
              Taxation
            </Link>
            ).
          </>
        }
      />

      <Section>
        <div className="grid gap-5 lg:grid-cols-2">
          <RateCard
            name="Express"
            tag="Faster"
            tagClass="bg-teal/10 text-teal-deep"
            text="Separate freight and customs-clearance lines, plus a flat delivery fee."
            rows={expressRows}
          />
          <RateCard
            name="Economy"
            tag={ECONOMY_LOCKED ? 'Coming soon' : 'Lower cost'}
            tagClass="bg-gold/15 text-gold-deep"
            text="One postal-charges line by weight and no separate delivery fee. Usually slower than Express."
            rows={economyRows}
          />
        </div>
      </Section>

      <Section>
        <div className="grid gap-5 lg:grid-cols-2">
          <IconCard
            icon={Scale}
            title="A note on weight"
            text={`Freight, customs-clearance and postal charges all scale with weight — a 1kg item pays roughly double the ${sf.weightBlockKg}kg block rate. If a seller doesn’t list a weight, we use a sensible default and adjust once the item is weighed at quality check. Items priced outside the flat models above use roughly LKR ${customs.freightRatePerKgLKR.toLocaleString()} per kg for freight.`}
          />
          <IconCard icon={Landmark} title="Products with full customs pricing" tone="gold">
            <p className="mt-1.5 font-body text-sm leading-relaxed text-ink/60">
              Some products are quoted with the full customs cascade instead — Duty, PAL, SSCL, Cess, Surcharge and VAT,
              applied in order to the product&apos;s value and category. See{' '}
              <Link href="/taxation" className="font-semibold text-teal-deep underline underline-offset-2">
                Taxation
              </Link>{' '}
              for how each works.
            </p>
          </IconCard>
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
