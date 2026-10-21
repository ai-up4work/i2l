// app/api/casecraft/likes/route.ts
//
// Likes on Case Craft ready-made designs and "fresh from the printer"
// photos (data/wishdrop-casecraft-prints-likes.sql).
//
//   GET  ?store=<slug>&device=<id>   -> { mine: ['design:<id>', 'print:<id>', …] }
//   POST { store, type, id, like, device } -> { liked, likes }
//
// Signed-in shoppers like as themselves ('u:<user id>', taken from the
// session — never from the request). Guests like with a random id kept on
// their device ('d:<id>'), so liking needs no account. One like per liker
// per item (primary key); requests are rate-limited per IP.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isRateLimited } from '@/lib/rate-limit'
import { storeModuleFor } from '@/lib/store-modules'
import { CASECRAFT_MIGRATION_HINT, casecraftDb, isMissingTable, sellerIdForSlug } from '@/lib/store-modules/casecraft/server'

export const dynamic = 'force-dynamic'

const DEVICE_RE = /^[0-9a-f-]{20,40}$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function likerFor(device: unknown): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) return `u:${user.id}`
  return typeof device === 'string' && DEVICE_RE.test(device) ? `d:${device.toLowerCase()}` : null
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const liker = await likerFor(q.get('device'))
  if (!liker) return NextResponse.json({ mine: [] })
  const db = casecraftDb()
  const { data, error } = await db.from('casecraft_likes').select('target_type, target_id').eq('liker', liker).limit(1000)
  if (error) return NextResponse.json({ mine: [] })
  return NextResponse.json(
    { mine: ((data ?? []) as { target_type: string; target_id: string }[]).map((r) => `${r.target_type}:${r.target_id}`) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest) {
  if (await isRateLimited(req, 'casecraft-like', 60, 60)) {
    return NextResponse.json({ error: 'Too many likes at once — try again in a minute.' }, { status: 429 })
  }
  const body = (await req.json().catch(() => null)) as { store?: unknown; type?: unknown; id?: unknown; like?: unknown; device?: unknown } | null
  const store = typeof body?.store === 'string' ? body.store : ''
  const type = body?.type === 'design' || body?.type === 'print' ? body.type : null
  const id = typeof body?.id === 'string' && UUID_RE.test(body.id) ? body.id : null
  if (!storeModuleFor(store) || storeModuleFor(store)?.key !== 'casecraft' || !type || !id) {
    return NextResponse.json({ error: 'Unknown item.' }, { status: 400 })
  }
  const liker = await likerFor(body?.device)
  if (!liker) return NextResponse.json({ error: 'Could not tell who you are — reload and try again.' }, { status: 400 })

  const db = casecraftDb()
  const sellerId = await sellerIdForSlug(store, db)
  if (!sellerId) return NextResponse.json({ error: 'Unknown store.' }, { status: 404 })
  // The item must be this store's and on show.
  const table = type === 'design' ? 'casecraft_designs' : 'casecraft_prints'
  const { data: item, error: itemErr } = await db.from(table).select('id').eq('id', id).eq('seller_id', sellerId).eq('active', true).maybeSingle()
  if (itemErr) {
    if (isMissingTable(itemErr)) return NextResponse.json({ error: CASECRAFT_MIGRATION_HINT }, { status: 503 })
    return NextResponse.json({ error: itemErr.message }, { status: 500 })
  }
  if (!item) return NextResponse.json({ error: 'Unknown item.' }, { status: 404 })

  const like = body?.like !== false
  const res = like
    ? await db.from('casecraft_likes').upsert({ target_type: type, target_id: id, liker }, { onConflict: 'target_type,target_id,liker', ignoreDuplicates: true })
    : await db.from('casecraft_likes').delete().eq('target_type', type).eq('target_id', id).eq('liker', liker)
  if (res.error) {
    if (isMissingTable(res.error)) return NextResponse.json({ error: CASECRAFT_MIGRATION_HINT }, { status: 503 })
    return NextResponse.json({ error: res.error.message }, { status: 500 })
  }
  const { count } = await db.from('casecraft_likes').select('liker', { count: 'exact', head: true }).eq('target_type', type).eq('target_id', id)
  return NextResponse.json({ liked: like, likes: count ?? 0 })
}
