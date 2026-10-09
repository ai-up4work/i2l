// app/api/admin/catalogues/stores/[slug]/collections/route.ts
//
// GET  -> this store's collections (with product counts) and its products
//         (id, name, photo, active), so staff can fill a collection.
// POST -> create a collection: { name, description? }.
//
// Staff only (SOURCING_ROLES). Tables: data/wishdrop-store-collections.sql.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { createCollection, listCollections } from '@/lib/store-collections'

type Params = { params: Promise<{ slug: string }> }

async function storeId(admin: Extract<Awaited<ReturnType<typeof requireStaffRole>>, { ok: true }>['admin'], slug: string) {
  const { data } = await admin.from('sellers').select('id').eq('platform_slug', slug).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { slug } = await params
  const sellerId = await storeId(auth.admin, slug)
  if (!sellerId) return NextResponse.json({ error: 'Store not found.' }, { status: 404 })

  try {
    const { collections, missing } = await listCollections(auth.admin, sellerId)
    const { data: products } = await auth.admin
      .from('products')
      .select('id, name, images, active')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
    return NextResponse.json(
      { collections, products: products ?? [], needsMigration: missing },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not load collections' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { slug } = await params
  const sellerId = await storeId(auth.admin, slug)
  if (!sellerId) return NextResponse.json({ error: 'Store not found.' }, { status: 404 })
  return createCollection(auth.admin, sellerId, await req.json().catch(() => ({})))
}
