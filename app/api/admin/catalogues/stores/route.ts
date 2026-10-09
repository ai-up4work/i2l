// app/api/admin/catalogues/stores/route.ts
//
// Catalogue stores: sellers with no website feed (Instagram / Facebook
// sellers) whose products live in our database. They are created HERE,
// from Admin → Catalogues — not through the seller wizard, whose "mock"
// method is for stores with a custom extractor built into the code.
// See lib/catalogue-stores.ts.
//
// GET  -> every catalogue store (any status) with product counts, plus
//         "legacy" hand-managed sellers made the old way (wizard → mock),
//         so they can be moved over.
// POST -> create a store. It starts HIDDEN, so staff can add a logo and
//         products before shoppers see it.
//
// Gated to SOURCING_ROLES.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { isCatalogueStoreRow, isLegacyCustomRow, storeSlugFromName, storeSlugProblem } from '@/lib/catalogue-stores'
import { PROFILE_COLUMNS, STORE_COLUMNS, toAdminStore, type StoreRow } from '@/lib/catalogue-stores-admin'

export async function GET() {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  // Profile columns may not exist yet; fall back so the page still loads.
  let needsMigration = false
  let data: unknown[] | null = null
  const full = await admin.from('sellers').select(`${STORE_COLUMNS}, ${PROFILE_COLUMNS}`).order('created_at', { ascending: false })
  let error = full.error
  data = full.data
  if (error?.code === '42703') {
    needsMigration = true
    const basic = await admin.from('sellers').select(STORE_COLUMNS).order('created_at', { ascending: false })
    error = basic.error
    data = basic.data
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = ((data ?? []) as unknown as StoreRow[]).filter((r) => isCatalogueStoreRow(r) || isLegacyCustomRow(r))

  const counts = new Map<string, { total: number; active: number }>()
  if (rows.length) {
    const { data: products } = await admin
      .from('products')
      .select('seller_id, active')
      .in('seller_id', rows.map((r) => r.id as string))
      .limit(10000)
    for (const p of (products ?? []) as { seller_id: string; active: boolean }[]) {
      const c = counts.get(p.seller_id) ?? { total: 0, active: 0 }
      c.total += 1
      if (p.active) c.active += 1
      counts.set(p.seller_id, c)
    }
  }

  return NextResponse.json(
    { stores: rows.map((r) => toAdminStore(r, counts.get(r.id as string))), needsMigration },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    slug?: string
    contactName?: string
    contactEmail?: string
    contactPhone?: string
    country?: string
    marginPercent?: number | string
  }

  const name = String(body.name ?? '').trim().slice(0, 80)
  if (!name) return NextResponse.json({ error: 'Store name is required.' }, { status: 400 })

  const slug = String(body.slug ?? '').trim().toLowerCase() || storeSlugFromName(name)
  const slugProblem = storeSlugProblem(slug)
  if (slugProblem) return NextResponse.json({ error: slugProblem }, { status: 400 })

  const margin = body.marginPercent === undefined || body.marginPercent === '' ? 25 : Number(body.marginPercent)
  if (!Number.isFinite(margin) || margin < 0 || margin > 1000) {
    return NextResponse.json({ error: 'Enter a valid margin percentage.' }, { status: 400 })
  }

  const contactEmail = String(body.contactEmail ?? '').trim().toLowerCase()
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address, or leave it empty.' }, { status: 400 })
  }

  const country = String(body.country ?? '').trim().slice(0, 60) || 'India'

  const { data, error } = await admin
    .from('sellers')
    .insert({
      platform_slug: slug,
      name,
      type: 'manual',
      store_kind: 'local',
      // Hidden until staff press "Go live" — an empty store shouldn't be
      // on the public stores page.
      status: 'inactive',
      country,
      categories: [],
      contact_name: String(body.contactName ?? '').trim().slice(0, 80) || null,
      contact_email: contactEmail || null,
      contact_phone: String(body.contactPhone ?? '').trim().slice(0, 30) || null,
      default_margin_percent: margin,
      provider_type: 'catalogue',
      // Sellers price in INR; the storefront runs it through the normal
      // import formula (only Wishdrop Mall is fixed-price).
      provider_config: { type: 'catalogue', currency: 'INR', display: { isNew: true } },
    })
    .select(STORE_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `The web address "${slug}" is already used by another store. Change it and try again.` }, { status: 409 })
    }
    if (/invalid input value for enum seller_status/.test(error.message)) {
      return NextResponse.json({ error: 'The database needs an update first: run data/seller-status-values.sql in Supabase.' }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ store: toAdminStore(data as unknown as StoreRow) }, { status: 201 })
}
