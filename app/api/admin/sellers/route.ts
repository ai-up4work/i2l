// app/api/admin/sellers/route.ts
//
// GET  -> list every seller (admin view — includes inactive/pending, unlike
//         the public storefront which only sees status='active')
// POST -> create a new seller
//
// Gated via requireStaffRole(SOURCING_ROLES) — Super Admin/Manager/Sales &
// Purchase only, per the permission matrix (Warehouse has no functional
// need for sourcing/catalogue data). See lib/supabase/admin-auth.ts.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'

// Mirrors SellerStatus from data/sellers/data.ts. Kept as a small local
// constant (rather than importing the client-side type) since this is the
// one place we validate an admin-controlled string against it before it
// touches the DB.
const VALID_STATUSES = ['active', 'pending_review', 'inactive'] as const
type ValidStatus = (typeof VALID_STATUSES)[number]

export async function GET() {
  const authCheck = await requireStaffRole(SOURCING_ROLES)
  if (!authCheck.ok) return authCheck.response
  const { admin } = authCheck

  const { data, error } = await admin.from('sellers').select('*').order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sellers: data })
}

export async function POST(req: NextRequest) {
  const authCheck = await requireStaffRole(SOURCING_ROLES)
  if (!authCheck.ok) return authCheck.response
  const { admin } = authCheck

  const body = await req.json()
  const {
    storeName,
    platform,
    storeUrl,
    contactName,
    contactEmail,
    contactPhone,
    notes,
    logoUrl,
    providerConfig, // { type: 'mock'|'shopify'|'woocommerce'|'jsonapi'|'html-scrape', ...fields }
    status, // optional — the seller wizard now creates the row as soon as
    // Method is confirmed (before Test & verify has run), so it decides
    // up front whether this starts life as 'active' (mock — nothing to
    // verify) or 'pending_review' (a real feed, unverified until the
    // wizard's auto-run checklist passes or an admin confirms it by hand).
    // Anything else the client might send (or omit) falls back to
    // pending_review below, which is always the safe default — it just
    // means the storefront won't surface the seller's products until
    // someone/something verifies the feed.
  } = body

  if (!storeName || !platform || !contactEmail) {
    return NextResponse.json({ error: 'storeName, platform, and contactEmail are required' }, { status: 400 })
  }

  const resolvedStatus: ValidStatus = VALID_STATUSES.includes(status) ? status : 'pending_review'

  const { data, error } = await admin
    .from('sellers')
    .insert({
      platform_slug: platform,
      name: storeName,
      store_kind: 'local',
      status: resolvedStatus,
      type: providerConfig?.type === 'mock' || !providerConfig ? 'manual' : 'feed',
      outbound_url: storeUrl || null,
      logo_url: logoUrl || null,
      contact_name: contactName || null,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      notes: notes || null,
      provider_type: providerConfig?.type ?? 'mock',
      provider_config: providerConfig ?? { type: 'mock' },
    })
    .select()
    .single()

  if (error) {
    // Postgres unique_violation on platform_slug
    if (error.code === '23505') {
      return NextResponse.json({ error: `Platform slug "${platform}" is already in use.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ seller: data }, { status: 201 })
}