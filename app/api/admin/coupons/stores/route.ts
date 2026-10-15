// app/api/admin/coupons/stores/route.ts — the stores a coupon can be
// limited to: every active affiliated store, plus the marketplaces
// customers paste links from (the `site` our scraper puts on a cart line).

import { NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import { SITE_LOGOS } from '@/lib/platform-logos'

export const runtime = 'nodejs'

function label(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function GET() {
  const auth = await requireStaffRole(['manager', 'super_admin'])
  if (!auth.ok) return auth.response
  const { data } = await auth.admin.from('sellers').select('platform_slug, name').eq('status', 'active')
  const stores = ((data ?? []) as { platform_slug: string | null; name: string | null }[])
    .filter((s) => s.platform_slug)
    .map((s) => ({ slug: s.platform_slug as string, name: s.name || label(s.platform_slug as string), kind: 'store' as const }))
  const known = new Set(stores.map((s) => s.slug))
  const marketplaces = Object.keys(SITE_LOGOS)
    .filter((slug) => !known.has(slug))
    .map((slug) => ({ slug, name: label(slug), kind: 'marketplace' as const }))
  return NextResponse.json({
    stores: [...stores, ...marketplaces].sort((a, b) => a.name.localeCompare(b.name)),
  })
}
