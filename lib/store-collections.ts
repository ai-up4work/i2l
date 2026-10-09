// lib/store-collections.ts
//
// Server-only helpers for collections inside a social store
// (data/wishdrop-store-collections.sql). Collections belong to one store;
// a product can be in several.

import 'server-only'
import { NextResponse } from 'next/server'
import type { createServiceRoleClient } from '@/lib/supabase/server'

type Admin = ReturnType<typeof createServiceRoleClient>

export const COLLECTIONS_MIGRATION_HINT = 'Collections need a database update first: run data/wishdrop-store-collections.sql in Supabase.'

export type StoreCollection = {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  sort_order: number
  active: boolean
  product_count?: number
}

/** Table missing (migration not run yet). */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || /store_collection/.test(error.message ?? '')))
}

export function collectionSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'collection'
  )
}

/** A store's collections, in order, with how many products each holds. */
export async function listCollections(admin: Admin, sellerId: string): Promise<{ collections: StoreCollection[]; missing: boolean }> {
  const { data, error } = await admin
    .from('store_collections' as never)
    .select('id, name, slug, description, image_url, sort_order, active')
    .eq('seller_id', sellerId)
    .order('sort_order')
    .order('created_at')
  if (error) {
    if (isMissingTable(error)) return { collections: [], missing: true }
    throw error
  }
  const collections = (data ?? []) as unknown as StoreCollection[]
  if (collections.length) {
    const { data: links } = await admin
      .from('store_collection_products' as never)
      .select('collection_id')
      .in('collection_id', collections.map((c) => c.id))
    const counts = new Map<string, number>()
    for (const l of (links ?? []) as unknown as { collection_id: string }[]) counts.set(l.collection_id, (counts.get(l.collection_id) ?? 0) + 1)
    for (const c of collections) c.product_count = counts.get(c.id) ?? 0
  }
  return { collections, missing: false }
}

/** Collection ids a product is in. [] if the tables don't exist yet. */
export async function productCollectionIds(admin: Admin, productId: string): Promise<string[]> {
  const { data, error } = await admin.from('store_collection_products' as never).select('collection_id').eq('product_id', productId)
  if (error) return []
  return ((data ?? []) as unknown as { collection_id: string }[]).map((r) => r.collection_id)
}

/**
 * Puts a product in exactly these collections. Ids that aren't collections
 * of the product's own store are ignored, so nobody can attach a product
 * to another store's collection.
 */
export async function setProductCollections(admin: Admin, productId: string, sellerId: string, collectionIds: string[]): Promise<void> {
  const { data: own, error } = await admin.from('store_collections' as never).select('id').eq('seller_id', sellerId)
  if (error) {
    if (isMissingTable(error) && collectionIds.length === 0) return
    throw isMissingTable(error) ? new Error(COLLECTIONS_MIGRATION_HINT) : error
  }
  const allowed = new Set(((own ?? []) as unknown as { id: string }[]).map((r) => r.id))
  const wanted = new Set(collectionIds.filter((id) => allowed.has(id)))

  const current = new Set(await productCollectionIds(admin, productId))
  const toRemove = [...current].filter((id) => !wanted.has(id))
  const toAdd = [...wanted].filter((id) => !current.has(id))
  if (toRemove.length) {
    const { error: e } = await admin.from('store_collection_products' as never).delete().eq('product_id', productId).in('collection_id', toRemove)
    if (e) throw e
  }
  if (toAdd.length) {
    const { error: e } = await admin
      .from('store_collection_products' as never)
      .insert(toAdd.map((collection_id) => ({ collection_id, product_id: productId })) as never)
    if (e) throw e
  }
}

/** Puts exactly these products (of the same store) in a collection. */
export async function setCollectionProducts(admin: Admin, collectionId: string, sellerId: string, productIds: string[]): Promise<void> {
  const { data: own } = await admin.from('products').select('id').eq('seller_id', sellerId)
  const allowed = new Set(((own ?? []) as { id: string }[]).map((r) => r.id))
  const wanted = productIds.filter((id) => allowed.has(id))
  const { error: delError } = await admin.from('store_collection_products' as never).delete().eq('collection_id', collectionId)
  if (delError) throw delError
  if (wanted.length) {
    const { error } = await admin
      .from('store_collection_products' as never)
      .insert(wanted.map((product_id, i) => ({ collection_id: collectionId, product_id, sort_order: i })) as never)
    if (error) throw error
  }
}

/** Product ids in a store's collection, found by its slug. null = no such
 *  (active) collection, or collections not set up. */
export async function productIdsInCollection(admin: Admin, sellerId: string, slug: string): Promise<string[] | null> {
  const { data, error } = await admin
    .from('store_collections' as never)
    .select('id')
    .eq('seller_id', sellerId)
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle()
  if (error || !data) return null
  const { data: links, error: e } = await admin
    .from('store_collection_products' as never)
    .select('product_id')
    .eq('collection_id', (data as unknown as { id: string }).id)
  if (e) return null
  return ((links ?? []) as unknown as { product_id: string }[]).map((r) => r.product_id)
}

/** Shared with the seller portal's own collections route. */
export async function createCollection(
  admin: Admin,
  sellerId: string,
  body: { name?: string; description?: string },
) {
  const name = String(body.name ?? '').trim().slice(0, 60)
  if (!name) return NextResponse.json({ error: 'Give the collection a name.' }, { status: 400 })

  const { data: last } = await admin
    .from('store_collections' as never)
    .select('sort_order')
    .eq('seller_id', sellerId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = ((last as unknown as { sort_order: number } | null)?.sort_order ?? -1) + 1

  const base = collectionSlug(name)
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await admin
      .from('store_collections' as never)
      .insert({
        seller_id: sellerId,
        name,
        slug: attempt === 0 ? base : `${base}-${attempt + 1}`,
        description: String(body.description ?? '').trim().slice(0, 300) || null,
        sort_order: nextOrder,
      } as never)
      .select('id, name, slug, description, image_url, sort_order, active')
      .single()
    if (!error) return NextResponse.json({ collection: { ...(data as object), product_count: 0 } }, { status: 201 })
    if (isMissingTable(error)) return NextResponse.json({ error: COLLECTIONS_MIGRATION_HINT }, { status: 500 })
    if (error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ error: 'A collection with that name already exists.' }, { status: 409 })
}
