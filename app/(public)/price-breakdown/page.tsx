// app/(public)/price-breakdown/page.tsx
//
// A store product's price breakdown for SHOPPERS — opened from
// ?price-breakdown on a product page (lib/quote-links.ts customerQuoteHref).
//
// FIX: this used to live at /demo/quote, but every /demo page is Super Admin
// only (middleware.ts), so shoppers who tapped "price breakdown" were sent to
// the staff login. It now has its own public page showing only the
// shopper-safe lines (price incl. shipping and handling, service charge,
// delivery, total) — never the store's own price, rates or margins.
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import QuoteCalculator from '@/components/quote/QuoteCalculator'
import { fetchAffiliatedStore } from '@/lib/supabase/affiliated-stores'
import { fetchStoreProduct } from '@/lib/store-providers/product'
import { ensurePricingSettings } from '@/lib/pricing-settings-server'
import { isStoreStaff } from '@/lib/store-preview'
import { buildCustomerQuote, fullQuoteHref, variantFromQuery } from '@/lib/quote-links'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Price breakdown', robots: { index: false, follow: false } }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function PriceBreakdownPage({ searchParams }: { searchParams: SearchParams }) {
  const q = await searchParams
  const ref = Array.isArray(q.product) ? q.product[0] : q.product
  // No product: the general estimator is the shopper-facing tool.
  if (!ref) redirect('/estimate')

  const slash = ref.indexOf('/')
  const platform = slash > 0 ? ref.slice(0, slash) : ''
  const handle = slash > 0 ? ref.slice(slash + 1) : ''
  if (!platform || !handle) notFound()

  const store = await fetchAffiliatedStore(platform)
  if (!store) notFound()
  const product = await fetchStoreProduct(platform, handle, { includeHidden: false }).catch(() => null)
  if (!product) notFound()

  const variant = variantFromQuery(product, q)
  const settings = await ensurePricingSettings()
  const staff = await isStoreStaff()

  return (
    <QuoteCalculator
      customer={buildCustomerQuote(
        product,
        variant,
        { name: store.name, platform: store.platform },
        settings,
        staff ? fullQuoteHref('/admin/quote', product, variant, settings) : null,
      )}
    />
  )
}
