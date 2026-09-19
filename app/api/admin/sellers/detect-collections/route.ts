// app/api/admin/sellers/detect-collections/route.ts
//
// Given a seller's Shopify base URL, fetches that store's REAL, live
// collections list (handle + title) off its public /collections.json
// endpoint — see lib/store-providers/shopify.ts's fetchShopifyCollections
// for the actual fetch/pagination logic; this route just exposes it to
// the browser, since that lib file runs server-side only.
//
// Used by the "Category mapping" block in SellerFormClient.tsx's Method
// step (Shopify only) to let an admin map the site's own category names
// onto this specific seller's collection handles, producing the
// `collectionMap` that fetchShopifyProducts (same lib file) consults when
// a shopper filters the storefront by category.
//
// Gated via requireStaffRole(SOURCING_ROLES) — this previously had no auth
// check at all. See lib/supabase/admin-auth.ts.
import { NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { fetchShopifyCollections } from '@/lib/store-providers/shopify'

export async function POST(req: Request) {
  const authCheck = await requireStaffRole(SOURCING_ROLES)
  if (!authCheck.ok) return authCheck.response

  let baseUrl: unknown
  try {
    const body = await req.json()
    baseUrl = body?.baseUrl
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    return NextResponse.json({ ok: false, error: 'baseUrl is required' }, { status: 400 })
  }

  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  try {
    const collections = await fetchShopifyCollections(normalizedBaseUrl)
    return NextResponse.json({ ok: true, collections })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Couldn't reach that store's collections." },
      { status: 502 }
    )
  }
}