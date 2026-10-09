// app/api/admin/catalogues/stores/[slug]/route.ts
//
// GET   -> one catalogue store, for its admin page.
// PATCH -> edit it: name, profile (logo, cover, tagline, about, social
//          links), contact details, default margin, and status
//          ('active' = live, 'inactive' = hidden).
//          { convert: true } moves a legacy hand-managed seller (wizard →
//          mock) over to a catalogue store.
//
// The seller-portal login is created with the existing
// /api/admin/sellers/[platform]/create-login route.
// Only catalogue stores and legacy custom sellers can be touched here —
// never a feed seller, and never Wishdrop Mall.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { isCatalogueStoreRow, isLegacyCustomRow } from '@/lib/catalogue-stores'
import { isOwnCloudinaryUrl } from '@/lib/cloudinary'
import { PROFILE_COLUMNS, STORE_COLUMNS, toAdminStore, type StoreRow } from '@/lib/catalogue-stores-admin'

type Params = { params: Promise<{ slug: string }> }
type Admin = Extract<Awaited<ReturnType<typeof requireStaffRole>>, { ok: true }>['admin']

const MIGRATION_HINT = 'The database needs an update first: run data/wishdrop-social-stores.sql in Supabase.'

async function loadStore(admin: Admin, slug: string): Promise<{ row: StoreRow | null; needsMigration: boolean; error?: string }> {
  let needsMigration = false
  let { data, error } = await admin.from('sellers').select(`${STORE_COLUMNS}, ${PROFILE_COLUMNS}`).eq('platform_slug', slug).maybeSingle()
  if (error?.code === '42703') {
    needsMigration = true
    ;({ data, error } = await admin.from('sellers').select(STORE_COLUMNS).eq('platform_slug', slug).maybeSingle())
  }
  if (error) return { row: null, needsMigration, error: error.message }
  const row = data as unknown as StoreRow | null
  if (!row || !(isCatalogueStoreRow(row) || isLegacyCustomRow(row))) return { row: null, needsMigration }
  return { row, needsMigration }
}

async function productCounts(admin: Admin, sellerId: string) {
  const { data } = await admin.from('products').select('active').eq('seller_id', sellerId).limit(10000)
  const rows = (data ?? []) as { active: boolean }[]
  return { total: rows.length, active: rows.filter((r) => r.active).length }
}

function socialLink(value: unknown, hosts: string[], base: string): string | null | 'invalid' {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^@?[a-z0-9._-]{1,60}$/i.test(raw)) return `${base}${raw.replace(/^@/, '')}`
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase()
    if (!hosts.includes(host)) return 'invalid'
    u.protocol = 'https:'
    return u.toString().slice(0, 300)
  } catch {
    return 'invalid'
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { slug } = await params
  const { row, needsMigration, error } = await loadStore(auth.admin, slug)
  if (error) return NextResponse.json({ error }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Store not found.' }, { status: 404 })
  return NextResponse.json(
    { store: toAdminStore(row, await productCounts(auth.admin, row.id as string)), needsMigration },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { admin } = auth
  const { slug } = await params

  const { row, error: loadError } = await loadStore(admin, slug)
  if (loadError) return NextResponse.json({ error: loadError }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Store not found.' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max) || null

  if (body.convert === true) {
    if (!isLegacyCustomRow(row)) return NextResponse.json({ error: 'This store is already a catalogue store.' }, { status: 400 })
    const old = (row.provider_config ?? {}) as Record<string, unknown>
    patch.provider_type = 'catalogue'
    patch.provider_config = { type: 'catalogue', currency: (old.currency as string | undefined) ?? 'INR', ...(old.display ? { display: old.display } : {}) }
  }

  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim().slice(0, 80)
    if (!name) return NextResponse.json({ error: 'Store name is required.' }, { status: 400 })
    patch.name = name
  }
  if (body.description !== undefined) patch.description = text(body.description, 1000)
  if (body.tagline !== undefined) patch.tagline = text(body.tagline, 120)
  if (body.country !== undefined) patch.country = text(body.country, 60)
  if (body.contactName !== undefined) patch.contact_name = text(body.contactName, 80)
  if (body.contactPhone !== undefined) patch.contact_phone = text(body.contactPhone, 30)
  if (body.notes !== undefined) patch.notes = text(body.notes, 2000)
  if (body.contactEmail !== undefined) {
    const email = String(body.contactEmail ?? '').trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    patch.contact_email = email || null
  }

  for (const [key, column] of [['logoUrl', 'logo_url'], ['coverUrl', 'cover_url']] as const) {
    if (body[key] === undefined) continue
    const url = String(body[key] ?? '').trim()
    if (url && !isOwnCloudinaryUrl(url, 'image')) {
      return NextResponse.json({ error: 'Please upload the image with the Upload button.' }, { status: 400 })
    }
    patch[column] = url || null
  }
  if (body.instagram !== undefined) {
    const v = socialLink(body.instagram, ['instagram.com'], 'https://instagram.com/')
    if (v === 'invalid') return NextResponse.json({ error: 'Enter an Instagram name or an instagram.com link.' }, { status: 400 })
    patch.instagram_url = v
  }
  if (body.facebook !== undefined) {
    const v = socialLink(body.facebook, ['facebook.com', 'fb.com'], 'https://facebook.com/')
    if (v === 'invalid') return NextResponse.json({ error: 'Enter a Facebook page name or a facebook.com link.' }, { status: 400 })
    patch.facebook_url = v
  }

  if (body.marginPercent !== undefined) {
    const m = Number(body.marginPercent)
    if (!Number.isFinite(m) || m < 0 || m > 1000) return NextResponse.json({ error: 'Enter a valid margin percentage.' }, { status: 400 })
    // Applies to products added from now on; existing products keep the
    // margin they were saved with (change those per product).
    patch.default_margin_percent = m
  }

  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'inactive') return NextResponse.json({ error: 'status must be "active" or "inactive".' }, { status: 400 })
    patch.status = body.status
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  patch.last_edit = new Date().toISOString()

  const { error } = await admin
    .from('sellers')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq('id', row.id as string)
  if (error) {
    if (error.code === '42703') return NextResponse.json({ error: MIGRATION_HINT }, { status: 500 })
    if (/invalid input value for enum seller_status/.test(error.message)) {
      return NextResponse.json({ error: 'The database needs an update first: run data/seller-status-values.sql in Supabase.' }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const fresh = await loadStore(admin, slug)
  if (!fresh.row) return NextResponse.json({ error: 'Store not found after saving.' }, { status: 500 })
  return NextResponse.json({ store: toAdminStore(fresh.row, await productCounts(admin, fresh.row.id as string)) })
}
