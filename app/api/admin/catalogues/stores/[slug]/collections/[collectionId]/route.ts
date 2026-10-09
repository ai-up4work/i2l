// app/api/admin/catalogues/stores/[slug]/collections/[collectionId]/route.ts
//
// GET    -> ids of the products in this collection.
// PATCH  -> { name?, description?, active?, move?: 'up' | 'down', productIds? }
//           productIds replaces the collection's products (same store only).
// DELETE -> delete the collection (its products are not touched).
//
// Staff only (SOURCING_ROLES).

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { setCollectionProducts } from '@/lib/store-collections'

type Params = { params: Promise<{ slug: string; collectionId: string }> }
type Admin = Extract<Awaited<ReturnType<typeof requireStaffRole>>, { ok: true }>['admin']

/** The collection, only if it belongs to the store in the URL. */
async function findCollection(admin: Admin, slug: string, collectionId: string) {
  const { data: store } = await admin.from('sellers').select('id').eq('platform_slug', slug).maybeSingle()
  const sellerId = (store as { id: string } | null)?.id
  if (!sellerId) return null
  const { data } = await admin
    .from('store_collections' as never)
    .select('id, seller_id, sort_order')
    .eq('id', collectionId)
    .eq('seller_id', sellerId)
    .maybeSingle()
  return (data as unknown as { id: string; seller_id: string; sort_order: number } | null) ?? null
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { slug, collectionId } = await params
  const collection = await findCollection(auth.admin, slug, collectionId)
  if (!collection) return NextResponse.json({ error: 'Collection not found.' }, { status: 404 })
  const { data } = await auth.admin.from('store_collection_products' as never).select('product_id').eq('collection_id', collectionId).order('sort_order')
  return NextResponse.json({ productIds: ((data ?? []) as unknown as { product_id: string }[]).map((r) => r.product_id) })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth
  const { slug, collectionId } = await params
  const collection = await findCollection(admin, slug, collectionId)
  if (!collection) return NextResponse.json({ error: 'Collection not found.' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    description?: string
    active?: boolean
    move?: 'up' | 'down'
    productIds?: string[]
  }

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim().slice(0, 60)
    if (!name) return NextResponse.json({ error: 'Give the collection a name.' }, { status: 400 })
    patch.name = name
  }
  if (body.description !== undefined) patch.description = String(body.description ?? '').trim().slice(0, 300) || null
  if (body.active !== undefined) patch.active = Boolean(body.active)
  if (Object.keys(patch).length) {
    const { error } = await admin.from('store_collections' as never).update(patch as never).eq('id', collectionId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (body.move === 'up' || body.move === 'down') {
    // Swap places with the neighbour, after renumbering 0..n so ties
    // (e.g. older rows all at 0) can't block a move.
    const { data: all } = await admin
      .from('store_collections' as never)
      .select('id')
      .eq('seller_id', collection.seller_id)
      .order('sort_order')
      .order('created_at')
    const ids = ((all ?? []) as unknown as { id: string }[]).map((r) => r.id)
    const i = ids.indexOf(collectionId)
    const j = body.move === 'up' ? i - 1 : i + 1
    if (i >= 0 && j >= 0 && j < ids.length) {
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
      for (let k = 0; k < ids.length; k++) {
        await admin.from('store_collections' as never).update({ sort_order: k } as never).eq('id', ids[k])
      }
    }
  }

  if (body.productIds !== undefined) {
    try {
      await setCollectionProducts(admin, collectionId, collection.seller_id, Array.isArray(body.productIds) ? body.productIds : [])
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { slug, collectionId } = await params
  const collection = await findCollection(auth.admin, slug, collectionId)
  if (!collection) return NextResponse.json({ error: 'Collection not found.' }, { status: 404 })
  const { error } = await auth.admin.from('store_collections' as never).delete().eq('id', collectionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
