// lib/store-listing-server.ts
//
// One server-side way to list a store's products, priced exactly the way
// shoppers see them. Used by:
//   - app/api/stores/[platform]/route.ts   (the catalogue's own API)
//   - app/(public)/stores/[platform]/page.tsx (first page rendered into the
//     HTML, so search engines and AI crawlers that don't run JavaScript
//     still see real products and product links)
//   - app/sitemaps/products/[platform]/route.ts (per-store product +
//     image sitemaps)
//
// Before this, the provider dispatch lived only inside the API route, so
// nothing else on the server could list products without an HTTP hop.

import 'server-only'
import { withStorePricing } from '@/lib/store-origin'
import { sellerPricingInfo, type ResolvedSeller } from '@/lib/store-config-db'
import { fetchJsonApiProducts } from '@/lib/store-providers/jsonapi'
import { fetchMockProducts } from '@/lib/store-providers/mock'
import { fetchShopifyProducts } from '@/lib/store-providers/shopify'
import { fetchWooCommerceProductsCached } from '@/lib/store-providers/woocommerce'
import { fetchHtmlScrapeProducts } from '@/lib/store-providers/html-scrape'
import { fetchCatalogueProducts } from '@/lib/store-providers/catalogue'
import { fetchAnishkaCreationProducts } from '@/lib/store-providers/sellers/anishka-creation'
import { fetchGuldastaProducts } from '@/lib/store-providers/sellers/guldasta-stories'
import type { ProviderFetchParams } from '@/lib/store-providers/types'
import type { StoreProduct } from '@/lib/store.types'

export interface StoreListing {
  products: StoreProduct[]
  total: number
  totalPages: number
  totalIsExact?: boolean
}

export interface StoreListingOptions {
  /** Staff preview of a hidden store (catalogue stores only). */
  includeHidden?: boolean
  /** Catalogue stores: limit to one collection. */
  collection?: string
}

/** Lists one page of a store's products, with storefront pricing applied. */
export async function listStoreProducts(
  platform: string,
  seller: ResolvedSeller,
  params: ProviderFetchParams,
  opts: StoreListingOptions = {},
): Promise<StoreListing> {
  const config = seller.config

  const result =
    platform === 'anishka-creation'
      ? await fetchAnishkaCreationProducts(platform, seller.name, params)
      : platform === 'guldasta-stories'
      ? await fetchGuldastaProducts(platform, seller.name, params)
      : config.type === 'shopify'
        ? await fetchShopifyProducts(platform, config, seller.name, params)
        : config.type === 'woocommerce'
          ? await fetchWooCommerceProductsCached(platform, config, params)
          : config.type === 'jsonapi'
            ? await fetchJsonApiProducts(platform, config, seller.name, params)
            : config.type === 'html-scrape'
              ? await fetchHtmlScrapeProducts(platform, config, seller.name, params)
              : config.type === 'catalogue'
                ? await fetchCatalogueProducts(platform, seller.name, params, {
                    includeHidden: opts.includeHidden,
                    collection: opts.collection,
                  })
                : await fetchMockProducts(platform, params)

  const pricing = sellerPricingInfo(seller)
  return {
    products: result.products.map((p) => withStorePricing(p, pricing)),
    total: result.total,
    totalPages: result.totalPages,
    totalIsExact: result.totalIsExact,
  }
}

/** True for stores whose products are made-up demo data (never put in sitemaps). */
export function isMockStore(seller: ResolvedSeller): boolean {
  return seller.config.type === 'mock'
}

/**
 * Resolves after `ms` with null if `work` hasn't finished — lets a page
 * render without waiting on a slow upstream store (the browser then loads
 * the products itself, as before).
 */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    work.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}
