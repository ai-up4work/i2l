// app/api/admin/wishdrop-mall/sources/route.ts
//
// GET -> the affiliated stores staff can browse to pick products for
//        Wishdrop Mall: every seller with a real live feed, WHATEVER ITS
//        STATUS. A store that's set up but not live for shoppers
//        (pending_review / inactive — e.g. we can read its catalogue but
//        don't have permission to list it publicly) can still supply Mall
//        products; `live: false` lets the picker label it.
//        Browsing a hidden store works because /api/stores/[platform]
//        serves a staff preview to Super Admin (lib/store-preview.ts).
//        Excluded: the Mall itself, and 'mock' sellers (no feed to browse)
//        — except anishka-creation, which is 'mock' in config but has a
//        hardcoded real extractor (see lib/store-providers/sellers/).
//        Marketplaces like Amazon/eBay aren't sellers rows; staff add
//        those products with "Paste a link" instead.

import { NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { WISHDROP_MALL_SLUG } from '@/lib/wishdrop-mall'
import { hasCustomExtractor } from '@/lib/store-providers/sellers'

type Row = { platform_slug: string; name: string; logo_url: string | null; provider_type: string | null; status: string | null }

export async function GET() {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const { data, error } = await admin
    .from('sellers')
    .select('platform_slug, name, logo_url, provider_type, status')
    .neq('platform_slug', WISHDROP_MALL_SLUG)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sources = ((data ?? []) as unknown as Row[])
    .filter(
      (r) =>
        hasCustomExtractor(r.platform_slug) ||
        (r.provider_type != null && r.provider_type !== 'mock' && r.provider_type !== 'catalogue'),
    )
    .map((r) => ({
      platform: r.platform_slug,
      name: r.name,
      logo: r.logo_url ?? '',
      live: r.status === 'active',
      status: r.status ?? 'unknown',
    }))

  return NextResponse.json({ sources })
}
