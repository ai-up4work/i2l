// app/api/mall/stock/check/route.ts
//
// POST { items: [{ url, qty }] } -> { problems: [{ url, name, available }] }
//
// Called by checkout BEFORE an order is created: are there enough units
// on hand for every Wishdrop Mall line? Read-only. Non-Mall lines are
// ignored. The real deduction happens after the order exists, from the
// order's own rows (/api/mall/orders/[orderId]/stock).

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isMallLineUrl, resolveMallLines } from '@/lib/wishdrop-mall/order-lines'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { items?: { url?: unknown; qty?: unknown }[] }
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((i) => ({ url: typeof i?.url === 'string' ? i.url : '', qty: Math.floor(Number(i?.qty)) }))
    .filter((i) => isMallLineUrl(i.url) && Number.isFinite(i.qty) && i.qty > 0)
    .slice(0, 100)
  if (items.length === 0) return NextResponse.json({ problems: [] })

  const admin = createServiceRoleClient()
  const resolved = await resolveMallLines(admin, items.map((i) => i.url))

  // The same product/variant can appear on more than one line — add them up.
  const wanted = new Map<string, number>()
  for (const i of items) wanted.set(i.url, (wanted.get(i.url) ?? 0) + i.qty)

  const problems: { url: string; name: string; available: number }[] = []
  for (const [url, qty] of wanted) {
    const line = resolved.get(url)
    if (!line) {
      problems.push({ url, name: 'An item in your cart', available: 0 })
      continue
    }
    if (line.stock == null) continue // not tracked
    if (qty > line.stock) {
      const name = line.variantLabel ? `${line.productName} (${line.variantLabel})` : line.productName
      problems.push({ url, name, available: Math.max(line.stock, 0) })
    }
  }
  return NextResponse.json({ problems })
}
