import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import DealCoupon, { discountToCoupon } from '@/components/shared/DealCoupon'
import { ADMIN_DISCOUNTS, getDiscountStatus, formatDiscountScope } from '@/data/discounts/data'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/deals',
  title: 'Deals & Promos | Wishdrop',
  description: 'Current storewide, seller, and collection promotions on Wishdrop.',
})

export default function DealsPage() {
  const liveDeals = ADMIN_DISCOUNTS.filter((d) => getDiscountStatus(d) === 'active')
  const upcomingDeals = ADMIN_DISCOUNTS.filter((d) => getDiscountStatus(d) === 'scheduled')

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 lg:px-10 lg:py-24">
      <div className="max-w-2xl">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          Deals &amp; promos
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Save more with top deals
        </h1>
        <p className="mt-4 font-body text-base leading-relaxed text-ink/65">
          Automatic discounts apply at checkout with no code needed. Code-based promotions are
          collected on our <Link href="/coupons" className="text-teal-deep underline underline-offset-2">Coupons</Link> page.
        </p>
      </div>

      {liveDeals.length === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-ink/15 bg-card px-8 py-16 text-center">
          <p className="font-display text-lg font-semibold text-ink">No live deals right now</p>
          <p className="mt-2 font-body text-sm text-ink/55">
            Check our <Link href="/coupons" className="text-teal-deep underline underline-offset-2">coupon codes</Link> instead, or check back soon.
          </p>
        </div>
      ) : (
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {liveDeals.map((discount) => (
            <div key={discount.id} className="flex flex-col gap-2">
              <DealCoupon coupon={discountToCoupon(discount)} />
              <p className="font-body text-xs text-ink/45">{formatDiscountScope(discount)}</p>
            </div>
          ))}
        </div>
      )}

      {upcomingDeals.length > 0 && (
        <div className="mt-16">
          <h2 className="font-display text-xl font-semibold text-ink">Coming soon</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {upcomingDeals.map((discount) => (
              <div key={discount.id} className="opacity-60">
                <DealCoupon coupon={discountToCoupon(discount)} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-16 rounded-2xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-base font-semibold text-ink">Terms</h2>
        <p className="mt-2 font-body text-sm leading-relaxed text-ink/60">
          Deals apply automatically to qualifying orders at checkout and cannot usually be
          combined with a coupon code covering the same items, unless stated. Wishdrop may modify
          or end a promotion at any time without affecting orders already placed. See our{' '}
          <Link href="/terms" className="text-teal-deep underline underline-offset-2">Terms of Use</Link> for full details.
        </p>
      </div>

      <div className="mt-10 flex justify-center">
        <Link
          href="/account/"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-body text-sm font-semibold text-parchment transition-colors hover:bg-teal-deep"
        >
          Start a request
          <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  )
}
