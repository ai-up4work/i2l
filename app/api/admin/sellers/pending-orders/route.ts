// app/api/admin/sellers/pending-orders/route.ts
//
// GET  -> { counts: { [platform_slug]: number } }
// GET ?debug=1 -> same, plus diagnostics (stage breakdown, sample items,
//                 sellers) to see why counts come back as zero.
//
// Pending = orders whose stage is in PENDING_STAGES. Counts distinct orders
// per seller, matched by seller name / platform slug (order_items.seller_name)
// or by store host (order_items.store_url).

import { NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'

export const dynamic = 'force-dynamic'

// Change this list if "pending" should include more stages,
// e.g. ['ordered', 'quality_check'].
const PENDING_STAGES = ['ordered']

// ─── Helpers ────────────────────────────────────────────────────────────────

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

/** Adds orderId to the set stored under key (creating it if needed). */
function addTo(map: Map<string, Set<string>>, key: string | null, orderId: string) {
  if (!key) return
  let set = map.get(key)
  if (!set) map.set(key, (set = new Set()))
  set.add(orderId)
}

type ItemRow = {
  order_id: string
  seller_name: string | null
  store_url: string | null
  orders: { stage: string } | { stage: string }[] | null
}

/** The embedded `orders` relation can come back as an object or an array. */
function stageOf(it: ItemRow): string | undefined {
  return Array.isArray(it.orders) ? it.orders[0]?.stage : it.orders?.stage
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const authCheck = await requireStaffRole(SOURCING_ROLES)
  if (!authCheck.ok) return authCheck.response
  const { admin } = authCheck

  const debug = new URL(req.url).searchParams.get('debug') === '1'

  const [sellersRes, itemsRes] = await Promise.all([
    admin.from('sellers').select('platform_slug, name, outbound_url, provider_config'),
    // No stage filter in the query: we filter in JS so debug can show every stage.
    admin.from('order_items').select('order_id, seller_name, store_url, orders!inner(stage)'),
  ])

  if (sellersRes.error) return NextResponse.json({ error: sellersRes.error.message }, { status: 500 })
  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 })

  const allItems = (itemsRes.data ?? []) as unknown as ItemRow[]
  const items = allItems.filter((it) => PENDING_STAGES.includes(stageOf(it) ?? ''))

  // Distinct order ids per seller name/slug and per store host, so an order
  // with several items from one seller (or one that matches on both name and
  // host) is counted once.
  const byName = new Map<string, Set<string>>()
  const byHost = new Map<string, Set<string>>()
  for (const it of items) {
    const name = it.seller_name?.trim().toLowerCase() || null
    addTo(byName, name, it.order_id)
    addTo(byHost, hostOf(it.store_url), it.order_id)
  }

  const counts: Record<string, number> = {}
  for (const s of sellersRes.data ?? []) {
    const ids = new Set<string>()

    // Match by display name or platform slug (whichever checkout stores)
    for (const k of [s.name, s.platform_slug]) {
      const key = String(k ?? '').trim().toLowerCase()
      if (key) byName.get(key)?.forEach((id) => ids.add(id))
    }

    // Match by store host
    const host = hostOf(s.outbound_url) ?? scraperSiteHost(s.provider_config)
    if (host) byHost.get(host)?.forEach((id) => ids.add(id))

    counts[s.platform_slug] = ids.size
  }

  if (debug) {
    const stageCounts: Record<string, number> = {}
    for (const it of allItems) {
      const st = stageOf(it) ?? 'unknown'
      stageCounts[st] = (stageCounts[st] ?? 0) + 1
    }
    return NextResponse.json({
      counts,
      pendingStages: PENDING_STAGES,
      totalItems: allItems.length,
      stageCounts,
      items: allItems.slice(0, 20).map((it) => ({
        stage: stageOf(it),
        seller_name: it.seller_name,
        store_url: it.store_url,
      })),
      sellers: (sellersRes.data ?? []).map((s) => ({
        platform_slug: s.platform_slug,
        name: s.name,
        outbound_url: s.outbound_url,
      })),
    })
  }

  return NextResponse.json({ counts })
}