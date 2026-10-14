// lib/category-tiles.ts
//
// Category images for affiliated stores (feed + extractor stores), so
// their store page can show a "Shop by category" row of round image
// tiles like social stores do.
//
// Where a tile's image comes from, in order:
//   1. 'chosen'  — staff picked one in the seller wizard
//   2. 'store'   — the store's own category image (Shopify collection
//                  image, WooCommerce category thumbnail)
//   3. 'product' — no category image: a random product photo from that
//                  category, picked while testing/adding the store
// The result is saved on the seller as provider_config.categoryTiles,
// so the storefront never has to guess again.
//
// Pure — safe to import from client components.

export type CategoryTileSource = 'chosen' | 'store' | 'product' | 'none'

export type CategoryTile = {
  handle: string
  title: string
  image: string | null
  source: CategoryTileSource
  /** Shown in the store page's "Shop by category" row. */
  show: boolean
}

/** What the wizard gets back for one category while testing a store. */
export type CategoryImageCandidate = {
  handle: string
  title: string
  /** The store's own image for the category, if it has one. */
  storeImage: string | null
  /** A few product photos from the category, to choose from. */
  productImages: string[]
}

/** Max categories we look up product photos for in one test (each is a
 *  live request to the store). */
export const CATEGORY_IMAGE_LOOKUP_LIMIT = 24
/** Product photos offered per category. */
export const CATEGORY_IMAGE_OPTIONS = 6

/** provider_config.categoryTiles, validated. Anything malformed is dropped. */
export function categoryTilesOf(config: unknown): CategoryTile[] {
  const raw = (config as { categoryTiles?: unknown } | null)?.categoryTiles
  if (!Array.isArray(raw)) return []
  const out: CategoryTile[] = []
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue
    const r = t as Record<string, unknown>
    if (typeof r.handle !== 'string' || typeof r.title !== 'string') continue
    out.push({
      handle: r.handle,
      title: r.title,
      image: typeof r.image === 'string' && r.image ? r.image : null,
      source: (['chosen', 'store', 'product', 'none'] as const).includes(r.source as CategoryTileSource) ? (r.source as CategoryTileSource) : 'none',
      show: r.show !== false,
    })
  }
  return out
}

function pickRandom<T>(items: T[]): T | null {
  return items.length ? items[Math.floor(Math.random() * items.length)] : null
}

/**
 * Builds tiles for freshly tested categories, keeping anything staff
 * already saved for the same handle (their chosen image, show/hide).
 * New categories get the store's image, else a random product photo.
 */
export function mergeCategoryTiles(saved: CategoryTile[], candidates: CategoryImageCandidate[]): CategoryTile[] {
  const byHandle = new Map(saved.map((t) => [t.handle, t]))
  return candidates.map((c) => {
    const prev = byHandle.get(c.handle)
    if (prev && (prev.source === 'chosen' || prev.image)) return { ...prev, title: c.title }
    if (c.storeImage) return { handle: c.handle, title: c.title, image: c.storeImage, source: 'store', show: prev?.show ?? true }
    const random = pickRandom(c.productImages)
    return {
      handle: c.handle,
      title: c.title,
      image: random,
      source: random ? 'product' : 'none',
      show: prev?.show ?? Boolean(random),
    }
  })
}

/** Live collections with the saved tile images laid over them, plus
 *  which ones belong in the "Shop by category" row. */
export function applyCategoryTiles<T extends { handle: string; title: string; image?: string | null }>(
  collections: T[],
  config: unknown,
): (T & { image: string | null; featured: boolean })[] {
  const tiles = categoryTilesOf(config)
  const byHandle = new Map(tiles.map((t) => [t.handle, t]))
  return collections.map((c) => {
    const tile = byHandle.get(c.handle)
    const image = tile?.image ?? c.image ?? null
    // Saved tiles decide; with none saved, any category that has an image is shown.
    const featured = tiles.length > 0 ? Boolean(tile?.show && image) : Boolean(image)
    return { ...c, image, featured }
  })
}

/**
 * Server helper: for each category, fetch one page of its products and
 * collect a few photos. `fetchCategory` runs the store's own provider.
 * Failures just leave a category without photos.
 */
export async function collectCategoryImages(
  categories: { handle: string; title: string; image?: string | null }[],
  fetchCategory: (handle: string) => Promise<{ image?: string | null; images?: string[] | null; category?: string | null }[]>,
  opts: { concurrency?: number; timeoutMs?: number } = {},
): Promise<CategoryImageCandidate[]> {
  const concurrency = opts.concurrency ?? 4
  const timeoutMs = opts.timeoutMs ?? 9000
  const list = categories.slice(0, CATEGORY_IMAGE_LOOKUP_LIMIT)
  const results: CategoryImageCandidate[] = new Array(list.length)

  let next = 0
  async function worker() {
    while (next < list.length) {
      const i = next++
      const c = list[i]
      let productImages: string[] = []
      try {
        const products = await Promise.race([
          fetchCategory(c.handle),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
        ])
        const seen = new Set<string>()
        for (const p of products) {
          const img = p.images?.[0] || p.image
          if (img && !seen.has(img)) {
            seen.add(img)
            productImages.push(img)
          }
          if (productImages.length >= CATEGORY_IMAGE_OPTIONS) break
        }
      } catch {
        productImages = []
      }
      results[i] = { handle: c.handle, title: c.title, storeImage: c.image ?? null, productImages }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker))

  // Categories past the lookup limit still come back, with only the store image.
  const rest = categories.slice(CATEGORY_IMAGE_LOOKUP_LIMIT).map((c) => ({ handle: c.handle, title: c.title, storeImage: c.image ?? null, productImages: [] }))
  return [...results, ...rest]
}
