// lib/catalogue-stores.ts
//
// What KIND of store a seller row is, and WHERE it is.
//
// Store type (sellers.store_source) — saved explicitly, never guessed:
//
//   'feed'      Shopify / WooCommerce / JSON API / HTML scrape. Products
//               are fetched live from the store's own website.
//   'extractor' The seller wizard's "mock" method: a custom page and
//               product extractor written in code for this one store
//               (e.g. anishka-creation — see lib/store-providers/sellers).
//               Managed in Admin → Sellers. Uses the standard store page.
//   'social'    Instagram / Facebook sellers with no website. Products,
//               photos and videos live in OUR database. Created and
//               managed only in Admin → Social Stores. Uses the social
//               store page.
//   'mall'      Wishdrop Mall, our own store.
//
// Before data/wishdrop-store-types-and-location.sql added the column,
// the type was guessed from provider_type / provider_config, and every
// wizard "mock" store was silently treated as a social store. That is
// why mock stores showed up in Social Stores and on the social store
// page. The fallback below (for a database where the migration hasn't
// run yet) no longer makes that guess: mock is always 'extractor'.
//
// Store location (sellers.store_origin) — 'IN' (default) or 'LK':
// independent of the type, so any kind of store can be a local
// Sri Lankan shop. See lib/store-origin.ts for what changes for a local
// store (pricing and checkout).
//
// Pure functions only — safe to import from client components.

export const WISHDROP_MALL_STORE_SLUG = 'wishdrop-mall'

export type StoreSource = 'feed' | 'extractor' | 'social' | 'mall'
export const STORE_SOURCES: StoreSource[] = ['feed', 'extractor', 'social', 'mall']

export const STORE_SOURCE_LABEL: Record<StoreSource, string> = {
  feed: 'Website feed',
  extractor: 'Custom extractor',
  social: 'Social store',
  mall: 'Wishdrop Mall',
}

/** Slugs that can't be used for a store: they are routes under /stores. */
const RESERVED_SLUGS = new Set(['apply', 'social', 'new', 'stores', WISHDROP_MALL_STORE_SLUG])

type SellerRowLike = Record<string, unknown>

function configType(row: SellerRowLike): string | undefined {
  const config = (row.provider_config ?? null) as Record<string, unknown> | null
  return (config?.type as string | undefined) ?? (row.provider_type as string | undefined) ?? undefined
}

/** The store's type. Reads sellers.store_source; only falls back to the
 *  provider config when that column doesn't exist yet. */
export function storeSourceOf(row: SellerRowLike): StoreSource {
  const saved = row.store_source
  if (typeof saved === 'string' && (STORE_SOURCES as string[]).includes(saved)) return saved as StoreSource

  if (row.platform_slug === WISHDROP_MALL_STORE_SLUG) return 'mall'
  const type = configType(row)
  if (type === 'catalogue') return 'social'
  if (type === undefined || type === 'mock') return 'extractor'
  return 'feed'
}

/** A social store (Admin → Social Stores; products in our database). */
export function isCatalogueStoreRow(row: SellerRowLike): boolean {
  return storeSourceOf(row) === 'social'
}

/** Which store_source a new seller-wizard store gets. */
export function sourceForWizardConfig(providerConfig: { type?: string } | null | undefined): StoreSource {
  return !providerConfig || providerConfig.type === 'mock' ? 'extractor' : 'feed'
}

/** "Meera's Handlooms" -> "meeras-handlooms". */
export function storeSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

/** null if the slug is usable, otherwise the reason it isn't. */
export function storeSlugProblem(slug: string): string | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return 'Use lowercase letters, numbers and dashes only.'
  if (slug.length < 3) return 'The web address needs at least 3 characters.'
  if (slug.length > 40) return 'The web address can be at most 40 characters.'
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" is reserved. Choose another web address.`
  return null
}
