// lib/store-categories.ts
//
// The one list of shopping categories used everywhere: the Shop menu in
// the header, the landing page's "Shop by category" tiles, the
// /categories page, and the category picker when staff create or edit a
// store. Stores save the category NAMES in `sellers.categories` (text[]).
//
// Hardcoded for now. To add a category, add a line here — every place
// above picks it up.
//
// `featured` ones (9, so they fill a 3-column grid) show on the landing page and in the Shop menu; the
// /categories page shows all of them.
//
// Images: the existing photos in public/categories/ are reused where they
// fit (fashion, beauty, electronics, home, toys, sports). For the others,
// drop a photo in public/categories/ with the file name below.
//
// Safe to import from client and server code.

import {
  Baby,
  Dumbbell,
  Footprints,
  Gamepad2,
  Gem,
  Heart,
  House,
  Layers,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export type StoreCategory = {
  name: string
  slug: string
  icon: LucideIcon
  blurb: string
  /** Photo in public/categories/. If the file isn't there, the icon shows instead. */
  image: string
  /** Shown on the landing page and in the header's Shop menu. The
   *  /categories page always shows every category. */
  featured: boolean
  /** Older names that mean this category — so stores saved before a
   *  rename still show up under it, and get the new name when re-saved. */
  aliases?: string[]
}

export const STORE_CATEGORIES: StoreCategory[] = [
  // ── Featured (landing page + Shop menu), in display order ──
  { name: 'Clothing', slug: 'clothing', icon: Shirt, featured: true, blurb: 'Everyday wear, tops, dresses and more', image: '/categories/fashion.png' },
  { name: 'Ethnic Wear', slug: 'ethnic-wear', icon: Layers, featured: true, blurb: 'Sarees, kurtis, lehengas and sets', image: '/categories/ethnic-wear.png' },
  { name: 'Footwear', slug: 'footwear', icon: Footprints, featured: true, blurb: 'Sneakers, sandals, heels and formal shoes', image: '/categories/footwear.png' },
  { name: 'Beauty & Personal Care', slug: 'beauty', icon: Sparkles, featured: true, blurb: 'Skincare, makeup, haircare and grooming', image: '/categories/beauty.png', aliases: ['Beauty'] },
  { name: 'Electronics', slug: 'electronics', icon: Smartphone, featured: true, blurb: 'Phones, audio, gadgets and accessories', image: '/categories/electronics.png' },
  { name: 'Jewellery', slug: 'jewellery', icon: Gem, featured: true, blurb: 'Rings, earrings, chains and bangles', image: '/categories/jewellery.png' },
  { name: 'Home & Kitchen', slug: 'home-kitchen', icon: House, featured: true, blurb: 'Décor, kitchenware, bedding and essentials', image: '/categories/home.png', aliases: ['Home', 'Home & Living'] },
  { name: 'Mom, Baby & Kids', slug: 'mom-baby-kids', icon: Baby, featured: true, blurb: 'Maternity wear, baby care and kids’ clothing', image: '/categories/mom-baby-kids.png', aliases: ['Maternity Wear', 'Baby & Kids'] },
  { name: 'Bags & Accessories', slug: 'bags-accessories', icon: ShoppingBag, featured: true, blurb: 'Handbags, wallets, watches and eyewear', image: '/categories/bags-accessories.png' },
  // ── Everything else (on /categories) ──
  { name: 'Toys, Games & Collectibles', slug: 'toys-games-collectibles', icon: Gamepad2, featured: false, blurb: 'Toys, board games, figures and fandom merch', image: '/categories/toys.png', aliases: ['Collectibles', 'Toys & Games', 'Toys'] },
  { name: 'Sports & Fitness', slug: 'sports-fitness', icon: Dumbbell, featured: false, blurb: 'Activewear, gym gear and equipment', image: '/categories/sports.png', aliases: ['Sports'] },
  { name: 'Handmade', slug: 'handmade', icon: Heart, featured: false, blurb: 'Crafted by hand, one piece at a time', image: '/categories/handmade.png' },
]

/** The categories shown on the landing page and in the Shop menu. */
export const FEATURED_STORE_CATEGORIES = STORE_CATEGORIES.filter((c) => c.featured)

const BY_KEY = new Map<string, StoreCategory>()
for (const c of STORE_CATEGORIES) {
  BY_KEY.set(c.slug, c)
  BY_KEY.set(c.name.toLowerCase(), c)
  for (const alias of c.aliases ?? []) BY_KEY.set(alias.toLowerCase(), c)
}

/** A category by its slug or name (any case). */
export function findStoreCategory(key: string | null | undefined): StoreCategory | undefined {
  if (!key) return undefined
  return BY_KEY.get(key.trim().toLowerCase())
}

/** Link to the categories page, filtered to one category. */
export function categoryHref(category: StoreCategory): string {
  return `/categories?category=${category.slug}`
}

/**
 * Cleans what a form sent into the saved shape: known category names
 * only, no duplicates, in the order of STORE_CATEGORIES.
 * Returns null when the input isn't a list at all.
 */
export function normalizeStoreCategories(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const picked = new Set(
    raw
      .filter((v): v is string => typeof v === 'string')
      .map((v) => findStoreCategory(v)?.name)
      .filter((v): v is string => !!v),
  )
  return STORE_CATEGORIES.filter((c) => picked.has(c.name)).map((c) => c.name)
}

/** Whether a store with these saved categories belongs in `category`. */
export function storeHasCategory(storeCategories: string[] | null | undefined, category: StoreCategory): boolean {
  return (storeCategories ?? []).some((c) => findStoreCategory(c)?.slug === category.slug)
}

/**
 * Slugs of the categories that have at least one store. Categories without
 * a store are shown greyed out ("Coming soon") on the landing page, in the
 * Shop menu and on /categories, so shoppers never click into an empty list.
 */
export function categoriesWithStores(stores: { categories?: string[] | null }[]): Set<string> {
  const out = new Set<string>()
  for (const s of stores) for (const c of s.categories ?? []) {
    const cat = findStoreCategory(c)
    if (cat) out.add(cat.slug)
  }
  return out
}
