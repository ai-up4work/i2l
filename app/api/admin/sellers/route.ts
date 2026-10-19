// app/api/admin/sellers/route.ts
//
// GET  -> list every seller (admin view — includes inactive/pending, unlike
//         the public storefront which only sees status='active')
// POST -> create a new seller
//
// Pending-order counts are NOT computed here. They load in the background
// from /api/admin/sellers/pending-orders (see hooks/useSellerPendingOrderCounts.ts).
//
// Gated via requireStaffRole(SOURCING_ROLES) — Super Admin/Manager/Sales &
// Purchase only, per the permission matrix. See lib/supabase/admin-auth.ts.

import { NextRequest, NextResponse } from 'next/server'
import { sourceForWizardConfig, storeSourceOf } from '@/lib/catalogue-stores'
import { isStoreOrigin, DEFAULT_STORE_ORIGIN } from '@/lib/store-origin'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { normalizeStoreCategories } from '@/lib/store-categories'

// Mirrors SellerStatus from data/sellers/data.ts.
const VALID_STATUSES = ['active', 'pending_review', 'inactive'] as const
type ValidStatus = (typeof VALID_STATUSES)[number]

export async function GET() {
  const authCheck = await requireStaffRole(SOURCING_ROLES)
  if (!authCheck.ok) return authCheck.response
  const { admin } = authCheck

  // Only feed and extractor ("mock") stores live here. Social stores are
  // managed in Admin → Social Stores and Wishdrop Mall on its own page,
  // so neither shows up in this list (decided by the saved store type —
  // lib/catalogue-stores.ts).
  const { data, error } = await admin
    .from('sellers')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const sellers = ((data ?? []) as unknown as Record<string, unknown>[]).filter((row) => {
    const source = storeSourceOf(row)
    return source === 'feed' || source === 'extractor'
  })
  return NextResponse.json({ sellers })
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
    coverUrl, // optional — null/absent means "no cover" (brand gradient)
    storeOrigin, // 'IN' (default) | 'LK' — lib/store-origin.ts
    providerConfig, // { type: 'mock'|'shopify'|'woocommerce'|'jsonapi'|'html-scrape', ...fields }
    status, // optional — the wizard decides 'active' (mock) vs 'pending_review'
    // (real feed, unverified). Anything invalid/omitted falls back to
    // pending_review, the safe default.
    categories, // shopping categories (lib/store-categories.ts)
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
      cover_url: coverUrl || null,
      contact_name: contactName || null,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      notes: notes || null,
      provider_type: providerConfig?.type ?? 'mock',
      provider_config: providerConfig ?? { type: 'mock' },
      // Saved, never guessed later: a wizard "mock" store is an
      // extractor store, not a social store (lib/catalogue-stores.ts).
      store_source: sourceForWizardConfig(providerConfig),
      store_origin: isStoreOrigin(storeOrigin) ? storeOrigin : DEFAULT_STORE_ORIGIN,
      categories: normalizeStoreCategories(categories) ?? [],
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