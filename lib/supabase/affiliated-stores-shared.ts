// lib/supabase/affiliated-stores-shared.ts
//
// Pure mapper only — no server or client Supabase imports here. This file
// exists specifically so client components (via hooks/useAffiliatedStores.ts)
// can use the mapping logic without pulling in lib/supabase/server.ts
// (which imports next/headers and breaks if it ends up in a client bundle).
//
// Scraper QA / scraper routing config lives in the seller row at
// provider_config.scraper:
//   {
//     "type": "shopify" | "woocommerce",
//     "siteHost": "example.com",            // no www, lowercase
//     "sampleProductUrl": "https://...",
//     "sampleProductLabel": "Product name"
//   }

import type { AffiliatedStore } from '@/data/stores/data'

// Slugs that are `manual` + `mock` in the database but are NOT custom
// seller-portal stores (they have their own hardcoded handling).
const NOT_SOCIAL_SLUGS = new Set(['anishka-creation', 'wishdrop-mall'])

/**
 * True for a custom seller row: no feed, catalogue managed in the seller
 * portal. Mirrors the rule in lib/store-config-db.ts that switches these
 * sellers onto the `catalogue` provider (type 'manual' + config 'mock').
 */
export function isSocialSellerRow(row: Record<string, unknown>): boolean {
  const providerConfig = (row.provider_config ?? {}) as Record<string, unknown>
  return (
    row.type === 'manual' &&
    ((providerConfig.type as string | undefined) ?? 'mock') === 'mock' &&
    !NOT_SOCIAL_SLUGS.has(row.platform_slug as string)
  )
}

export function mapRowToAffiliatedStore(row: Record<string, unknown>): AffiliatedStore {
  const providerConfig = (row.provider_config ?? {}) as Record<string, unknown>
  const display = (providerConfig.display ?? {}) as Record<string, unknown>
  const scraper = (providerConfig.scraper ?? {}) as Record<string, unknown>

  return {
    platform: row.platform_slug as string,
    name: row.name as string,
    logo: (row.logo_url as string) ?? '',
    url: (row.outbound_url as string) ?? undefined,
    country: (row.country as string) ?? '',
    flag: (row.flag_emoji as string) ?? '',
    description: (row.description as string) ?? '',
    categories: (row.categories as string[]) ?? [],
    storeType: row.store_kind as AffiliatedStore['storeType'],
    isNew: display.isNew as boolean | undefined,
    itemCount: display.itemCount as number | undefined,
    bannerStyle: display.bannerStyle as AffiliatedStore['bannerStyle'],
    shipping: display.shipping as string | undefined,
    payment: display.payment as string | undefined,
    tags: display.tags as string[] | undefined,
    buildType: (display.buildType as AffiliatedStore['buildType']) ?? 'template',

    isSocial: isSocialSellerRow(row),
    cover: (row.cover_url as string | null) ?? undefined,
    tagline: (row.tagline as string | null) ?? undefined,
    instagram: (row.instagram_url as string | null) ?? undefined,
    facebook: (row.facebook_url as string | null) ?? undefined,

    // Scraper / QA config (all optional)
    scraperSite: scraper.type as string | undefined,
    sampleProductUrl: scraper.sampleProductUrl as string | undefined,
    sampleProductLabel: scraper.sampleProductLabel as string | undefined,
  }
}