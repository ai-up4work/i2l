// lib/store-modules/index.ts
//
// CUSTOM STORES ("mock" stores in the seller wizard, store type
// 'extractor'). A custom store is not limited to a product feed: it can
// have its own customer page and its own seller portal pages, written in
// code just for it. Case Craft (custom-printed phone cases) is the first.
//
// A store module is registered here by store slug. When a store has one:
//   - /stores/<slug> shows the module's own storefront instead of the
//     standard catalogue page (lib/store-modules/storefronts.tsx);
//   - the seller portal shows the module's own sections at
//     /seller/studio/<section> instead of Overview / Products
//     (lib/store-modules/seller-sections.tsx); Store profile stays.
//
// The module keeps its own data and its own orders. It doesn't use the
// Wishdrop order pipeline or the admin pages.
//
// To add one: make lib/store-modules/<key>/, add its meta below, its
// storefront to storefronts.tsx and its seller sections to
// seller-sections.tsx.
//
// Pure — safe to import from client components.

export type SellerSectionIcon = 'orders' | 'designs' | 'prints' | 'pricing' | 'overview'

export type StoreModuleMeta = {
  /** Folder name under lib/store-modules. */
  key: string
  /** Store slugs (sellers.platform_slug) that use this module. */
  slugs: string[]
  /** Seller portal sections, in menu order. The first is the portal home. */
  sellerSections: { key: string; label: string; short: string; icon: SellerSectionIcon }[]
}

export const CASECRAFT_MODULE: StoreModuleMeta = {
  key: 'casecraft',
  slugs: ['case-craft', 'casecraft'],
  sellerSections: [
    { key: 'orders', label: 'Print jobs', short: 'Jobs', icon: 'orders' },
    { key: 'designs', label: 'Ready-made designs', short: 'Designs', icon: 'designs' },
    { key: 'prints', label: 'Printed cases', short: 'Prints', icon: 'prints' },
    { key: 'pricing', label: 'Prices & models', short: 'Prices', icon: 'pricing' },
  ],
}

export const STORE_MODULES: StoreModuleMeta[] = [CASECRAFT_MODULE]

export function storeModuleFor(slug: string | null | undefined): StoreModuleMeta | null {
  if (!slug) return null
  return STORE_MODULES.find((m) => m.slugs.includes(slug)) ?? null
}

export function hasStoreModule(slug: string | null | undefined): boolean {
  return storeModuleFor(slug) !== null
}

/** Seller portal home for a store: the module's first section, or /seller. */
export function sellerHomeFor(slug: string | null | undefined): string {
  const mod = storeModuleFor(slug)
  return mod ? `/seller/studio/${mod.sellerSections[0].key}` : '/seller'
}

/** Menu items for the seller portal, serializable (icons by name). */
export type SellerNavItem = { href: string; label: string; short: string; icon: SellerSectionIcon | 'products' | 'profile'; exact: boolean }

export function sellerNavFor(slug: string | null | undefined): SellerNavItem[] {
  const mod = storeModuleFor(slug)
  if (!mod) {
    return [
      { href: '/seller', label: 'Overview', short: 'Overview', icon: 'overview', exact: true },
      { href: '/seller/products', label: 'Products', short: 'Products', icon: 'products', exact: false },
      { href: '/seller/account', label: 'Store profile', short: 'Profile', icon: 'profile', exact: false },
    ]
  }
  return [
    ...mod.sellerSections.map((s) => ({ href: `/seller/studio/${s.key}`, label: s.label, short: s.short, icon: s.icon, exact: false })),
    { href: '/seller/account', label: 'Store profile', short: 'Profile', icon: 'profile' as const, exact: false },
  ]
}
