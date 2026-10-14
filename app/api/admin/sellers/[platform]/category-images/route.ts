// app/api/admin/sellers/[platform]/category-images/route.ts
//
// GET -> { categoryImages: CategoryImageCandidate[] } for a SAVED store
// of any kind, including extractor ("mock") stores whose extractor lives
// in code and so can't be tested from unsaved wizard fields.
//
// Reuses the store's own public API (/api/stores/[platform]) — the same
// code the store page runs — so every provider, including custom
// extractors, is covered without re-implementing any of them here. The
// staff member's cookies are forwarded, so a store that isn't live yet
// can still be read (staff preview, lib/store-preview.ts).
//
// The images are suggestions; the wizard saves the chosen ones as
// provider_config.categoryTiles (lib/category-tiles.ts).

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { collectCategoryImages } from '@/lib/category-tiles'

export const dynamic = 'force-dynamic'

type LiveCollection = { handle: string; title: string; image?: string | null }

export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { platform } = await params

  const origin = req.nextUrl.origin
  const headers = { cookie: req.headers.get('cookie') ?? '', accept: 'application/json' }

  const res = await fetch(`${origin}/api/stores/${encodeURIComponent(platform)}?collections=1&raw=1`, { headers, cache: 'no-store' })
  const body = (await res.json().catch(() => ({}))) as { collections?: LiveCollection[]; error?: string }
  if (!res.ok) return NextResponse.json({ error: body.error ?? 'Could not read this store’s categories.' }, { status: 502 })

  const collections = body.collections ?? []
  if (collections.length === 0) {
    return NextResponse.json({ categoryImages: [], note: 'This store has no categories to show.' })
  }

  // Ignore any saved tile image here: these are fresh suggestions. The
  // store's own image comes from the live list where it has one.
  const categoryImages = await collectCategoryImages(collections, async (handle) => {
    const qs = new URLSearchParams({ category: handle, per_page: '12', page: '1' })
    const r = await fetch(`${origin}/api/stores/${encodeURIComponent(platform)}?${qs}`, { headers, cache: 'no-store' })
    if (!r.ok) return []
    const data = (await r.json().catch(() => ({}))) as { products?: { image?: string; images?: string[] }[] }
    return data.products ?? []
  })

  return NextResponse.json({ categoryImages }, { headers: { 'Cache-Control': 'no-store' } })
}
