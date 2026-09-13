// lib/supabase/product-snapshots.ts
//
// Shared by Cart/Wishlist/RecentlyViewed contexts. Every product-like type
// in this app (CartProduct, WishlistProduct, RecentlyViewedProduct) already
// uses the listing URL as its stable `.id` — see the comment on
// WishlistProduct: "Stable identity — use the listing URL, same convention
// as the cart." So `product_snapshots.url` is keyed on that same id, and
// `ensureProductSnapshot` finds-or-creates a row for it rather than
// inserting a fresh row on every add (which would break the DB's
// unique(user_id, product_snapshot_id) constraints on cart_items etc, and
// would defeat "add the same item twice increments qty" behavior).
//
// NOTE: every snapshot created here has source='external'. There is
// currently no real manual-catalog seller with products in the `products`
// table (see scripts/seed-sellers.mjs's findings), so there's nothing to
// link source='catalogue' snapshots to yet. Once manual sellers exist with
// real product rows, add a branch here that looks up `products` by
// platform+handle and creates a source='catalogue' snapshot instead.

import type { SupabaseClient } from '@supabase/supabase-js'

export type SnapshotInput = {
  id: string // the app's existing url-as-id convention
  title: string
  image?: string | null
  currencyCode?: string | null
  price?: string | number | null
  site?: string | null
}

export async function ensureProductSnapshot(
  supabase: SupabaseClient,
  product: SnapshotInput,
): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from('product_snapshots')
    .select('id')
    .eq('source', 'external')
    .eq('url', product.id)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findError) throw findError
  if (existing) return existing.id

  const price =
    product.price == null || product.price === '' ? null : Number(product.price)

  const { data, error } = await supabase
    .from('product_snapshots')
    .insert({
      source: 'external',
      url: product.id,
      site: product.site ?? null,
      title: product.title,
      image_url: product.image ?? null,
      currency: product.currencyCode ?? null,
      price: Number.isFinite(price) ? price : null,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

/** Looks up an existing snapshot id by url without creating one. Used for deletes. */
export async function findSnapshotId(supabase: SupabaseClient, url: string): Promise<string | null> {
  const { data } = await supabase
    .from('product_snapshots')
    .select('id')
    .eq('source', 'external')
    .eq('url', url)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}
