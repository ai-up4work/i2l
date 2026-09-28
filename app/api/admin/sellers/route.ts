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

const VALID_STATUSES = ['active', 'pending_review', 'inactive'] as const
type ValidStatus = (typeof VALID_STATUSES)[number]

// ─── Helpers for the pending-orders count ───────────────────────────────────

/** Lowercased hostname without "www.", or null for a missing/bad URL. */
function hostOf(url?: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

/** Safely reads provider_config.scraper.siteHost off Supabase's generic Json type. */
function scraperSiteHost(config: unknown): string | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null
  const scraper = (config as Record<string, unknown>).scraper
  if (!scraper || typeof scraper !== 'object' || Array.isArray(scraper)) return null
  const siteHost = (scraper as Record<string, unknown>).siteHost
  return typeof siteHost === 'string' ? siteHost.toLowerCase() : null
}

function addTo(map: Map<string, Set<string>>, key: string | null, orderId: string) {
  if (!key) return
  let set = map.get(key)
  if (!set) map.set(key, (set = new Set()))
  set.add(orderId)
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  const authCheck = await requireStaffRole(SOURCING_ROLES)
  if (!authCheck.ok) return authCheck.response
  const { admin } = authCheck

  // Wishdrop Mall (our own store, provider_type 'catalogue') is managed
  // from /admin/wishdrop-mall, not the seller wizard — keep it out of this
  // list. `or` rather than `neq` so rows with a NULL provider_type aren't
  // dropped too.
  const { data, error } = await admin
    .from('sellers')
    .select('*')
    .or('provider_type.is.null,provider_type.neq.catalogue')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pending = order still at stage 'ordered' (waiting to be purchased).
  // ASSUMED column names on order_items: order_id, seller_name, store_url.
  // Verify against fetchAdminOrders in lib/supabase/orders-admin.ts.
  // If this query fails, the list still loads and counts show 0.
  const { data: rawItems, error: itemsError } = await admin
    .from('order_items')
    .select('order_id, seller_name, store_url, orders!inner(stage)')
    .eq('orders.stage', 'ordered')

  if (itemsError) console.error('[admin/sellers] pending count failed:', itemsError)

  // Loosely typed on purpose: the columns above may not be in the
  // generated Supabase types.
  const items = (rawItems ?? []) as unknown as Record<string, unknown>[]

  // Distinct order ids per seller name and per store host, so an order
  // with several items from one seller (or matching by both name and
  // host) is counted once.
  const byName = new Map<string, Set<string>>()
  const byHost = new Map<string, Set<string>>()
  for (const it of items) {
    const orderId = String(it.order_id ?? '')
    if (!orderId) continue
    const name = typeof it.seller_name === 'string' ? it.seller_name.trim().toLowerCase() : null
    addTo(byName, name || null, orderId)
    addTo(byHost, hostOf(typeof it.store_url === 'string' ? it.store_url : null), orderId)
  }

  const sellers = (data ?? []).map((s) => {
    const ids = new Set<string>()
    byName.get(String(s.name ?? '').trim().toLowerCase())?.forEach((id) => ids.add(id))
    const host = hostOf(s.outbound_url) ?? scraperSiteHost(s.provider_config)
    if (host) byHost.get(host)?.forEach((id) => ids.add(id))
    return { ...s, orders_pending: ids.size }
  })

  return NextResponse.json({ sellers })
}

// ─── POST ───────────────────────────────────────────────────────────────────

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
    status, // optional; anything invalid/omitted falls back to pending_review
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