// app/demo/quote/page.tsx
//
// The public address of the quote calculator
// (components/quote/QuoteCalculator.tsx — the same one staff use at
// /admin/quote).
//
//   /demo/quote?value=…&currency=…   the calculator, pre-filled (as before)
//   /demo/quote?product=<store>/<handle>&variant=<id>
//                                    CUSTOMER MODE for one product: only the
//                                    shopper-safe breakdown, computed here on
//                                    the server (lib/quote-links.ts). Opened
//                                    from ?price-breakdown on a product page.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import QuoteCalculator from '@/components/quote/QuoteCalculator'
import { fetchAffiliatedStore } from '@/lib/supabase/affiliated-stores'
import { fetchStoreProduct } from '@/lib/store-providers/product'
import { ensurePricingSettings } from '@/lib/pricing-settings-server'
import { isStoreStaff } from '@/lib/store-preview'
import { buildCustomerQuote, fullQuoteHref, variantFromQuery } from '@/lib/quote-links'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const q = await searchParams
  return q.product
    ? { title: 'Price breakdown', robots: { index: false, follow: false } }
    : { title: 'Quote calculator' }
}

export default async function PublicQuotePage({ searchParams }: { searchParams: SearchParams }) {
  const q = await searchParams
  const ref = Array.isArray(q.product) ? q.product[0] : q.product
  if (!ref) return <QuoteCalculator />

  const slash = ref.indexOf('/')
  const platform = slash > 0 ? ref.slice(0, slash) : ''
  const handle = slash > 0 ? ref.slice(slash + 1) : ''
  if (!platform || !handle) notFound()

  // Live (active) stores only — the same visibility as the product page.
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
