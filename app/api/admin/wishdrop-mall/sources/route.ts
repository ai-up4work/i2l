// app/api/admin/wishdrop-mall/sources/route.ts
//
// GET -> the affiliated stores staff can browse to pick products for
//        Wishdrop Mall: every ACTIVE seller with a real live feed.
//        Excluded: the Mall itself, and 'mock' sellers (no feed to browse)
//        — except anishka-creation, which is 'mock' in config but has a
//        hardcoded real extractor (see lib/store-providers/sellers/).
//        Marketplaces like Amazon/eBay aren't sellers rows; staff add
//        those products with "Paste a link" instead.

import { NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { WISHDROP_MALL_SLUG } from '@/lib/wishdrop-mall'

type Row = { platform_slug: string; name: string; logo_url: string | null; provider_type: string | null }

export async function GET() {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const { admin } = auth

  const { data, error } = await admin
    .from('sellers')
    .select('platform_slug, name, logo_url, provider_type')
    .eq('status', 'active')
    .neq('platform_slug', WISHDROP_MALL_SLUG)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sources = ((data ?? []) as unknown as Row[])
    .filter(
      (r) =>
        r.platform_slug === 'anishka-creation' ||
        (r.provider_type != null && r.provider_type !== 'mock' && r.provider_type !== 'catalogue'),
    )
    .map((r) => ({ platform: r.platform_slug, name: r.name, logo: r.logo_url ?? '' }))

  return NextResponse.json({ sources })
}
