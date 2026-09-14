import Link from 'next/link'
import {
  FREIGHT_RATE_PER_KG_LKR,
  SIMPLE_PROFIT_PERCENT,
  SIMPLE_FREIGHT_RATE_PER_KG,
  SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_KG,
  SIMPLE_WEIGHT_BLOCK_KG,
  SIMPLE_DELIVERY_FLAT_LKR,
  SIMPLE_EXTRA_MARGIN_FLAT_LKR,
  SIMPLE_ECONOMY_POSTAL_RATE_PER_KG_LKR,
} from '@/lib/quote'

export const metadata = {
  title: 'Shipping Pricing | WishDrop',
  description: 'How WishDrop calculates freight, service fees, and delivery pricing by weight and delivery speed.',
}

const expressRows = [
  { label: 'Product cost', value: 'Seller\u2019s price, converted to LKR' },
  { label: 'Freight charge', value: `~LKR ${SIMPLE_FREIGHT_RATE_PER_KG.toLocaleString()} per kg, billed in ${SIMPLE_WEIGHT_BLOCK_KG}kg blocks` },
  { label: 'Customs clearance', value: `~LKR ${SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_KG.toLocaleString()} per kg, billed in ${SIMPLE_WEIGHT_BLOCK_KG}kg blocks` },
  { label: 'Delivery fee', value: `Flat LKR ${SIMPLE_DELIVERY_FLAT_LKR}` },
  { label: 'Service margin', value: `Flat LKR ${SIMPLE_EXTRA_MARGIN_FLAT_LKR}` },
]

const economyRows = [
  { label: 'Product cost', value: 'Seller\u2019s price, converted to LKR' },
  { label: 'Postal charges', value: `~LKR ${SIMPLE_ECONOMY_POSTAL_RATE_PER_KG_LKR.toLocaleString()} per kg (single line, no separate freight/customs split)` },
  { label: 'Service margin', value: `Flat LKR ${SIMPLE_EXTRA_MARGIN_FLAT_LKR}` },
]

export default function ShippingPricingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 lg:px-10 lg:py-24">
      <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
        Shipping & pricing
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        How your total is calculated
      </h1>
      <p className="mt-4 max-w-2xl font-body text-base leading-relaxed text-ink/65">
        Every quote is built from a few clear ingredients: the product's price, its weight, your
        chosen delivery speed, and applicable customs charges. Here's exactly what goes into it.
      </p>
      <p className="mt-2 font-body text-xs text-ink/40">
        Rates shown are current published rates and are illustrative — always confirm the exact
        total on your live quote, as rates can change and some products use full customs-cascade
        pricing instead (see <Link href="/taxation" className="text-teal-deep underline underline-offset-2">Taxation</Link>).
      </p>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink/10 bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ink">Express</h2>
            <span className="rounded-full bg-teal/10 px-3 py-1 font-body text-xs font-semibold text-teal-deep">
              Faster
            </span>
          </div>
          <p className="mt-1.5 font-body text-sm text-ink/55">
            Separate freight and customs-clearance lines, plus a flat delivery fee.
          </p>
          <table className="mt-5 w-full border-collapse text-left">
            <tbody>
              {expressRows.map((row) => (
                <tr key={row.label} className="border-t border-ink/10 first:border-t-0">
                  <td className="py-2.5 pr-3 font-body text-sm text-ink/55">{row.label}</td>
                  <td className="py-2.5 text-right font-body text-sm font-semibold text-ink">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ink">Economy</h2>
            <span className="rounded-full bg-gold/15 px-3 py-1 font-body text-xs font-semibold text-gold-deep">
              Lower cost
            </span>
          </div>
          <p className="mt-1.5 font-body text-sm text-ink/55">
            A single postal-charges line by weight, and no separate flat delivery fee. Typically
            slower than Express.
          </p>
          <table className="mt-5 w-full border-collapse text-left">
            <tbody>
              {economyRows.map((row) => (
                <tr key={row.label} className="border-t border-ink/10 first:border-t-0">
                  <td className="py-2.5 pr-3 font-body text-sm text-ink/55">{row.label}</td>
                  <td className="py-2.5 text-right font-body text-sm font-semibold text-ink">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-ink/10 bg-parchment/60 p-6">
        <h3 className="font-display text-lg font-semibold text-ink">A note on weight</h3>
        <p className="mt-2 font-body text-sm leading-relaxed text-ink/65">
          Freight, customs-clearance, and postal charges all scale with your item's weight — a 1kg
          item pays roughly double the {SIMPLE_WEIGHT_BLOCK_KG}kg block rate, and a{' '}
          {SIMPLE_WEIGHT_BLOCK_KG / 2}kg item pays roughly half. If a seller doesn't list a weight,
          we apply a reasonable default and adjust once the item is measured at quality check —
          base freight for items priced outside the flat models above is calculated at roughly
          LKR {FREIGHT_RATE_PER_KG_LKR.toLocaleString()} per kg.
        </p>
      </div>

      <div className="mt-10 rounded-2xl border border-ink/10 bg-card p-6">
        <h3 className="font-display text-lg font-semibold text-ink">
          Products with full customs pricing
        </h3>
        <p className="mt-2 font-body text-sm leading-relaxed text-ink/65">
          Some products are quoted using the full customs cascade instead of the flat model above —
          Duty, PAL, SSCL, Cess, Surcharge, and VAT, applied in sequence to the product's value and
          category. See <Link href="/taxation" className="text-teal-deep underline underline-offset-2">Taxation</Link> for how each of those works.
        </p>
      </div>
    </main>
  )
}
