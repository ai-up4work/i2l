import Link from 'next/link'
import { Tag } from 'lucide-react'
import { Callout, CtaEnvelope, PageHero, Section } from '@/components/public/PageKit'
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
    <main>
      <PageHero
        eyebrow="Deals & promos"
        title="Save more with"
        accent="top deals."
        intro={
          <>
            Deals apply automatically at checkout — no code needed. Personal coupons are in{' '}
            <Link href="/account/coupons" className="font-semibold text-teal-deep underline underline-offset-2">
              My coupons
            </Link>
            .
          </>
        }
      />

      <Section>
        {liveDeals.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-ink/15 bg-card px-8 py-14 text-center">
            <Tag className="text-teal-deep/40" size={32} />
            <p className="font-display text-xl font-semibold text-indigo">No live deals right now</p>
            <p className="max-w-sm font-body text-sm text-ink/55">
              Check{' '}
              <Link href="/account/coupons" className="font-semibold text-teal-deep underline underline-offset-2">
                My coupons
              </Link>{' '}
              for offers on your account, or check back soon.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {liveDeals.map((discount) => (
              <div key={discount.id} className="flex flex-col gap-2">
                <DealCoupon coupon={discountToCoupon(discount)} />
                <p className="font-body text-xs text-ink/45">{formatDiscountScope(discount)}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {upcomingDeals.length > 0 && (
        <Section eyebrow="Coming soon" title="Starting shortly">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {upcomingDeals.map((discount) => (
              <div key={discount.id} className="opacity-60">
                <DealCoupon coupon={discountToCoupon(discount)} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section width="narrow">
        <Callout>
          Deals apply automatically to qualifying orders and usually can&apos;t be combined with a coupon on the same items,
          unless stated. Wishdrop may change or end a promotion at any time without affecting orders already placed. See
          our{' '}
          <Link href="/terms" className="font-semibold text-teal-deep underline underline-offset-2">
            Terms of Use
          </Link>
          .
        </Callout>
      </Section>

      <CtaEnvelope title="Spotted something" accent="you love?" primary={{ href: '/account', label: 'Start a request' }} secondary={{ href: '/stores', label: 'Browse stores' }} />
    </main>
  )
}
