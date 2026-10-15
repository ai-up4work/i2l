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
import { checkMallStock } from '@/lib/wishdrop-mall/stock'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { items?: { url?: unknown; qty?: unknown }[] }
  const items = (Array.isArray(body.items) ? body.items : []).map((i) => ({
    url: typeof i?.url === 'string' ? i.url : '',
    qty: Math.floor(Number(i?.qty)),
  }))
  const problems = await checkMallStock(createServiceRoleClient(), items)
  return NextResponse.json({ problems })
}
