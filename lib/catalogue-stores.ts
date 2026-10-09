// lib/catalogue-stores.ts
//
// What counts as a "catalogue store": a seller with no website feed whose
// products (photos, videos, prices) live in OUR database — typically an
// Instagram / Facebook seller. They're created in Admin → Catalogues and
// saved with provider type 'catalogue'.
//
// This is deliberately NOT the seller wizard's "mock" method. Mock means
// "a custom extractor is built into the code for this store" (e.g.
// anishka-creation). Mixing the two meant choosing "mock" in the wizard
// silently turned a store into a hand-managed catalogue.
//
// Pure functions only — safe to import from client components.

export const WISHDROP_MALL_STORE_SLUG = 'wishdrop-mall'

/** Slugs that can't be used for a store: they are routes under /stores. */
const RESERVED_SLUGS = new Set(['apply', 'social', 'new', 'stores', WISHDROP_MALL_STORE_SLUG])

type SellerRowLike = Record<string, unknown>

function configType(row: SellerRowLike): string | undefined {
  const config = (row.provider_config ?? null) as Record<string, unknown> | null
  return (config?.type as string | undefined) ?? (row.provider_type as string | undefined) ?? undefined
}

/** A catalogue store created in Admin → Catalogues (Wishdrop Mall excluded —
 *  it is our own store with its own pricing and admin page). */
export function isCatalogueStoreRow(row: SellerRowLike): boolean {
  return configType(row) === 'catalogue' && row.platform_slug !== WISHDROP_MALL_STORE_SLUG
}

/**
 * The OLD way a hand-managed seller was set up: seller wizard → "mock".
 * Still served from the database so nothing breaks, but it keeps the
 * standard store page until staff move it over (Catalogues → Stores →
 * "Make this a catalogue store"). anishka-creation is mock WITH a real
 * built-in extractor, so it is never one of these.
 */
export function isLegacyCustomRow(row: SellerRowLike): boolean {
  return (
    row.type === 'manual' &&
    (configType(row) ?? 'mock') === 'mock' &&
    row.platform_slug !== 'anishka-creation' &&
    row.platform_slug !== WISHDROP_MALL_STORE_SLUG
  )
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
