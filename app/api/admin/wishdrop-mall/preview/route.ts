// app/api/admin/wishdrop-mall/preview/route.ts
//
// POST { platform, handle }  -> draft from an affiliated store's feed
// POST { url }               -> draft from any pasted product link
//
// Returns { draft, duplicateOf } — nothing is saved here. The admin UI
// shows the draft in an editable preview (name, category, LKR price)
// and then POSTs the result to /api/admin/wishdrop-mall/products.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { draftFromLink, draftFromStore, SourcingError } from '@/lib/wishdrop-mall/sourcing'
import { findMallDuplicate, getMallStore } from '@/lib/wishdrop-mall/admin'

// Pasted links can go through the full scraper fallback chain, which may
// take minutes — same budget as /api/product-lookup.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const body = (await req.json().catch(() => ({}))) as { platform?: string; handle?: string; url?: string }

  try {
    const store = await getMallStore(admin)
    if (!store) return NextResponse.json({ error: 'Set up Wishdrop Mall first.' }, { status: 404 })

    let draft
    if (body.url) {
      draft = await draftFromLink(body.url, req.signal)
    } else if (body.platform && body.handle) {
      draft = await draftFromStore(body.platform, body.handle)
    } else {
      return NextResponse.json({ error: 'Send either { url } or { platform, handle }.' }, { status: 400 })
    }

    const duplicateOf = await findMallDuplicate(admin, store.id, draft.source)
    return NextResponse.json({ draft, duplicateOf })
  } catch (err) {
    if (err instanceof SourcingError) return NextResponse.json({ error: err.message }, { status: err.status })
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[wishdrop-mall/preview]', msg)
    return NextResponse.json({ error: `Couldn't load that product: ${msg}` }, { status: 502 })
  }
}
