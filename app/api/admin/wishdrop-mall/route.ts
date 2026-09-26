// app/api/admin/wishdrop-mall/route.ts
//
// GET   -> the Wishdrop Mall store row (or null if not set up yet) plus
//          every product in it, including ops-only fields (source price
//          and where it's bought from) for the admin table.
// POST  -> one-time setup: creates the Mall's `sellers` row. Starts
//          'inactive' (hidden from shoppers) so staff can stock it before
//          it goes live.
// PATCH -> store settings: { name, description, logoUrl, status }
//
// Super admin only (SUPER_ADMIN_ONLY) — Wishdrop's own store is run by
// the super admin.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { MALL_PRODUCT_COLUMNS, MALL_STORE_COLUMNS, getMallStore } from '@/lib/wishdrop-mall/admin'
import {
  MALL_CURRENCY,
  WISHDROP_MALL_DESCRIPTION,
  WISHDROP_MALL_NAME,
  WISHDROP_MALL_SLUG,
  type MallProductRow,
} from '@/lib/wishdrop-mall'

export async function GET() {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth

  try {
    const store = await getMallStore(admin)
    if (!store) return NextResponse.json({ store: null, products: [] })

    const { data, error } = await admin
      .from('products')
      .select(`${MALL_PRODUCT_COLUMNS}, product_variants(count)`)
      .eq('seller_id', store.id)
      .order('created_at', { ascending: false })
    if (error) throw error

    const products: MallProductRow[] = ((data ?? []) as unknown as (MallProductRow & {
      product_variants: { count: number }[] | null
    })[]).map(({ product_variants, ...row }) => ({
      ...row,
      images: row.images ?? [],
      variant_count: product_variants?.[0]?.count ?? 0,
    }))

    return NextResponse.json({ store, products }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST() {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin, staffId } = auth

  const existing = await getMallStore(admin).catch(() => null)
  if (existing) return NextResponse.json({ store: existing })

  // contact_email: the Mall is our own store, so the staff member who set
  // it up is the contact on record (some sellers columns expect one).
  const { data: staff } = await admin.from('staff_accounts').select('email').eq('id', staffId).maybeSingle()

  const { data, error } = await admin
    .from('sellers')
    .insert({
      platform_slug: WISHDROP_MALL_SLUG,
      name: WISHDROP_MALL_NAME,
      description: WISHDROP_MALL_DESCRIPTION,
      type: 'manual',
      store_kind: 'local',
      status: 'inactive',
      country: 'India',
      flag_emoji: '🇮🇳',
      categories: [],
      contact_email: (staff as { email?: string } | null)?.email ?? null,
      provider_type: 'catalogue',
      provider_config: {
        type: 'catalogue',
        currency: MALL_CURRENCY,
        display: { isNew: true, buildType: 'template', tags: ['Wishdrop'] },
      },
    })
    .select(MALL_STORE_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `The slug "${WISHDROP_MALL_SLUG}" is already used by another seller. Rename that seller first.` },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ store: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const store = await getMallStore(admin).catch(() => null)
  if (!store) return NextResponse.json({ error: 'Wishdrop Mall has not been set up yet.' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    description?: string
    logoUrl?: string
    status?: string
  }

  const patch: {
    last_edit: string
    name?: string
    description?: string | null
    logo_url?: string | null
    status?: string
  } = { last_edit: new Date().toISOString() }

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Store name cannot be empty.' }, { status: 400 })
    patch.name = name.slice(0, 80)
  }
  if (body.description !== undefined) patch.description = String(body.description).trim().slice(0, 500) || null
  if (body.logoUrl !== undefined) patch.logo_url = String(body.logoUrl).trim() || null
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'inactive') {
      return NextResponse.json({ error: "status must be 'active' or 'inactive'." }, { status: 400 })
    }
    patch.status = body.status
  }

  const { data, error } = await admin
    .from('sellers')
    .update(patch)
    .eq('id', store.id)
    .select(MALL_STORE_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ store: data })
}
