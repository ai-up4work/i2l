// lib/store-providers/sellers/index.ts
//
// Stores that have their own extractor written in code (store type
// 'extractor', the seller wizard's "mock" method). Add a store's slug
// here when you add its extractor file next to this one, so the admin
// knows it has a real product feed to count and test.
//
// Pure — safe to import from client components.

export const CUSTOM_EXTRACTOR_SLUGS = ['anishka-creation'] as const

export function hasCustomExtractor(slug: string | null | undefined): boolean {
  return !!slug && (CUSTOM_EXTRACTOR_SLUGS as readonly string[]).includes(slug)
}
