// app/api/admin/sellers/[platform]/collections/route.ts
//
// GET -> this seller's own native store collections/categories, fetched
// LIVE off their real feed, with real product counts per one -- NOT
// backed by any `collections` / `collection_items` DB tables. There is
// no "curated site collection" concept here; this reflects whatever
// grouping the seller's own store actually has:
//   - shopify      -> real Shopify collections (fetchShopifyCollections),
//                      with an EXACT per-collection product count
//                      computed the same way the store-wide product
//                      count stat is (paged /collections/{handle}/products.json).
//   - woocommerce   -> real WooCommerce product categories
//                      (fetchWooCommerceCategories), which already
//                      returns each category's live product count.
//   - jsonapi       -> real distinct values of the store's own
//                      categoryField (fetchJsonApiCategories), derived
//                      from actually fetching every live product -- also
//                      already returns a count per value.
//   - mock / html-scrape -> nothing live to query, so this always
//                      returns an empty list for these providers.
//
// The only DB read here is `sellers` itself, to resolve platform_slug ->
// provider_config -- that's config lookup, not seller product data, and
// there's no way to know which store/API to call without it.
//
// NOTE ON DATA QUALITY: this endpoint returns whatever collections/
// categories genuinely exist on the seller's store, including anything a
// merchant made for their own storefront navigation (e.g. one collection
// per size) or leftover test collections. This route does NOT filter or
// interpret that -- it's raw truth about what the store has. Any
// filtering of noisy/irrelevant entries (size-variant collections, dev
// leftovers, duplicate titles) is a display-layer concern and is handled
// in SellerFormClient.tsx, not here, so this endpoint stays a faithful
// mirror of the store.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import type { StoreProviderConfig } from '@/lib/store-config'
import { fetchShopifyCollections } from '@/lib/store-providers/shopify'
import { fetchWooCommerceCategories } from '@/lib/store-providers/woocommerce'
import { fetchJsonApiCategories } from '@/lib/store-providers/jsonapi'

async function requireAuthedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

interface SellerCollectionRow {
  id: string
  name: string
  productCount: number
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; StoreCatalog/1.0)',
  Accept: 'application/json',
}

/**
 * Shopify: real collections, each with an EXACT product count.
 * fetchShopifyCollections only gives handle+title (it's also used
 * elsewhere just to populate the category-mapping dropdown, where a
 * count isn't needed) -- so counting each one is done here by paging
 * /collections/{handle}/products.json, the same public endpoint
 * fetchShopifyProducts already relies on for collection-scoped fetches.
 * Collections are typically small enough this rarely goes past page 1.
 */
async function fetchShopifyCollectionsWithCounts(
  config: Extract<StoreProviderConfig, { type: 'shopify' }>
): Promise<SellerCollectionRow[]> {
  const mergedHeaders = { ...HEADERS, ...config.headers }
  const collections = await fetchShopifyCollections(config.baseUrl, mergedHeaders)

  const withCounts = await Promise.all(
    collections.map(async (c): Promise<SellerCollectionRow | null> => {
      let total = 0
      let page = 1
      const pageSize = 250
      while (page <= 20) {
        const qs = new URLSearchParams({ limit: String(pageSize), page: String(page) })
        const res = await fetch(
          `${config.baseUrl}/collections/${encodeURIComponent(c.handle)}/products.json?${qs}`,
          { headers: mergedHeaders, next: { revalidate: 60 * 60 } }
        )
        if (!res.ok) return null // couldn't verify this collection -- drop it rather than guess
        const data = (await res.json()) as { products?: unknown[] }
        const count = data.products?.length ?? 0
        total += count
        if (count < pageSize) break
        page += 1
      }
      return { id: c.handle, name: c.title, productCount: total }
    })
  )

  return withCounts.filter((c): c is SellerCollectionRow => c != null && c.productCount > 0)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const user = await requireAuthedUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { platform } = await params
  const admin = createServiceRoleClient()

  const { data: seller, error: sellerError } = await admin
    .from('sellers')
    .select('id, provider_config')
    .eq('platform_slug', platform)
    .maybeSingle()

  if (sellerError) return NextResponse.json({ error: sellerError.message }, { status: 500 })
  if (!seller) return NextResponse.json({ error: 'Seller not found' }, { status: 404 })

  const providerConfig = (seller.provider_config ?? { type: 'mock' }) as StoreProviderConfig

  try {
    if (providerConfig.type === 'shopify') {
      const collections = await fetchShopifyCollectionsWithCounts(providerConfig)
      return NextResponse.json({ collections })
    }

    if (providerConfig.type === 'woocommerce') {
      const categories = await fetchWooCommerceCategories(providerConfig)
      const collections: SellerCollectionRow[] = categories
        .filter((c) => c.count > 0)
        .map((c) => ({ id: String(c.id), name: c.name, productCount: c.count }))
      return NextResponse.json({ collections })
    }

    if (providerConfig.type === 'jsonapi') {
      const categories = await fetchJsonApiCategories(providerConfig)
      const collections: SellerCollectionRow[] = categories.map((c) => ({
        id: c.value,
        name: c.value,
        productCount: c.count,
      }))
      return NextResponse.json({ collections })
    }

    // mock / html-scrape: nothing live to query.
    return NextResponse.json({ collections: [] })
  } catch (err) {
    // Same "don't fail the panel over a flaky store" posture as
    // useLiveProductCount -- an unreachable store just means no
    // collections info right now, not a 500 for the whole page.
    return NextResponse.json({
      collections: [],
      warning: err instanceof Error ? err.message : "Could not reach this seller's live feed.",
    })
  }
}