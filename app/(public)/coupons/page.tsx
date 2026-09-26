import { TicketPercent } from 'lucide-react'
import DealCoupon, { discountToCoupon } from '@/components/shared/DealCoupon'
import CopyCouponCode from '@/components/shared/CopyCouponCode'
import { ADMIN_DISCOUNTS, getDiscountStatus } from '@/data/discounts/data'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/coupons',
  title: 'Coupons | Wishdrop',
  description: 'Active coupon codes to save on shipping and shopping fees at Wishdrop.',
})

export default function CouponsPage() {
  // Only show customer-facing, code-based promotions that are currently live.
  const liveCoupons = ADMIN_DISCOUNTS.filter(
    (d) => d.method === 'code' && getDiscountStatus(d) === 'active',
  )

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 lg:px-10 lg:py-24">
      <div className="max-w-2xl">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          Coupons
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Active coupon codes
        </h1>
        <p className="mt-4 font-body text-base leading-relaxed text-ink/65">
          Apply a code at checkout to save on eligible orders. Codes are limited-time, may have a
          minimum order value, and can be restricted to specific sellers, collections, or products
          — details are shown on each card.
        </p>
      </div>

      {liveCoupons.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-ink/15 bg-card px-8 py-16 text-center">
          <TicketPercent className="text-ink/25" size={32} />
          <p className="font-display text-lg font-semibold text-ink">No active codes right now</p>
          <p className="max-w-sm font-body text-sm text-ink/55">
            Check back soon, or watch your inbox and WhatsApp for the next promotion.
          </p>
        </div>
      ) : (
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {liveCoupons.map((discount) => (
            <div key={discount.id} className="flex flex-col gap-3">
              <DealCoupon coupon={discountToCoupon(discount)} />
              {discount.code && <CopyCouponCode code={discount.code} />}
              {discount.minPurchaseAmount ? (
                <p className="font-body text-xs text-ink/45">
                  Minimum order Rs. {discount.minPurchaseAmount.toLocaleString('en-LK')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <p className="mt-12 font-body text-xs text-ink/40">
        One coupon code per order unless stated otherwise. Wishdrop may withdraw or amend a
        promotion at any time; already-placed orders are not affected. Full terms in our{' '}
        <a href="/terms" className="text-teal-deep underline underline-offset-2">Terms of Use</a>.
      </p>
    </main>
  )
}
