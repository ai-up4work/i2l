import { TicketPercent } from 'lucide-react'
import { Callout, CtaEnvelope, PageHero, Section } from '@/components/public/PageKit'
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
    <main>
      <PageHero
        eyebrow="Coupons"
        title="Save on your"
        accent="next order."
        intro="Your personal coupons — welcome gifts, referral rewards and offers — live in My coupons, and the best one for your bag is shown at checkout."
      />

      <Section>
        {liveCoupons.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-ink/15 bg-card px-8 py-14 text-center">
            <TicketPercent className="text-teal-deep/40" size={34} />
            <p className="font-display text-xl font-semibold text-indigo">No public codes right now</p>
            <p className="max-w-sm font-body text-sm text-ink/55">
              Sign in to see the coupons on your account, or watch WhatsApp for our next offer.
            </p>
            <a
              href="/account/coupons"
              className="mt-2 inline-flex items-center rounded-full bg-teal px-5 py-2.5 font-body text-sm font-semibold text-white hover:bg-teal-deep"
            >
              Open My coupons
            </a>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {liveCoupons.map((discount) => (
              <div key={discount.id} className="flex flex-col gap-3">
                <DealCoupon coupon={discountToCoupon(discount)} />
                {discount.code && <CopyCouponCode code={discount.code} />}
                {discount.minPurchaseAmount ? (
                  <p className="font-body text-xs text-ink/45">Minimum order Rs. {discount.minPurchaseAmount.toLocaleString('en-LK')}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <div className="mt-8">
          <Callout>
            One coupon per order unless stated otherwise. Wishdrop may withdraw or change a promotion at any time;
            orders already placed aren&apos;t affected. Full terms in our <a href="/terms" className="font-semibold text-teal-deep underline underline-offset-2">Terms of Use</a>.
          </Callout>
        </div>
      </Section>

      <CtaEnvelope
        title="Invite a friend,"
        accent="you both save."
        text="Share your link — they get a welcome coupon, and you get a reward when they place their first order."
        primary={{ href: '/account/referrals', label: 'Get my link' }}
        secondary={{ href: '/account/coupons', label: 'My coupons' }}
      />
    </main>
  )
}
