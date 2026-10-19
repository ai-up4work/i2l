// app/(public)/estimate/page.tsx
//
// Price estimator: the shopper knows roughly what something costs in
// rupees and how heavy it is, and wants a rough final price in LKR before
// pasting a link. Same formula as checkout (lib/price-estimate.ts). A
// quick look only — nothing is ordered from here.

import Link from 'next/link'
import { ButtonLink, PageHero, Section } from '@/components/public/PageKit'
import PriceEstimator from '@/components/shared/PriceEstimator'
import { ensurePricingSettings } from '@/lib/pricing-settings-server'
import { pageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata({
  path: '/estimate',
  title: 'Price Estimator | Wishdrop',
  description:
    'Know the price in rupees? See roughly what it costs delivered to you in Sri Lanka, before you paste a link.',
})

export default async function EstimatePage() {
  // Live rates, so the estimate matches checkout.
  await ensurePricingSettings()

  return (
    <main>
      <PageHero
        eyebrow="Price estimator"
        title="Know the rupee price?"
        accent="See it in LKR."
        intro={
          <>
            Type the price from any Indian store and roughly how heavy it is. You&rsquo;ll see about what it costs
            delivered to you in Sri Lanka. Nothing is ordered — when you&rsquo;re ready, paste the product link for the
            exact price.
          </>
        }
      />

      <Section>
        <div className="rounded-[28px] bg-card p-4 ring-1 ring-ink/[0.08] sm:p-6">
          <PriceEstimator />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ButtonLink href="/">Paste a product link</ButtonLink>
          <p className="font-body text-sm text-ink/55">
            Want to know how it&rsquo;s worked out?{' '}
            <Link href="/shipping/pricing" className="font-semibold text-teal-deep underline underline-offset-2">
              See our pricing
            </Link>
          </p>
        </div>
      </Section>
    </main>
  )
}
