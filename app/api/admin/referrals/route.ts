// app/api/admin/referrals/route.ts — Manager / Super Admin.
//   GET -> { settings, referrals }
//   PUT -> save settings

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import { staffName } from '@/lib/supabase/staff-name'
import { getReferralSettings, referralsForAdmin, saveReferralSettings, validateSettings } from '@/lib/referrals/server'

export const runtime = 'nodejs'
const ROLES = ['manager', 'super_admin'] as const

export async function GET() {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  try {
    const [settings, referrals] = await Promise.all([getReferralSettings(auth.admin), referralsForAdmin(auth.admin)])
    return NextResponse.json({ settings, referrals })
  } catch (err) {
    console.error('[admin/referrals]', err)
    return NextResponse.json({ error: 'Couldn’t load referrals. Has data/wishdrop-coupons-referrals-payments.sql been run?' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const s = validateSettings(body)
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: 400 })
  await saveReferralSettings(auth.admin, s, await staffName(auth.admin, auth.staffId))
  return NextResponse.json({ settings: await getReferralSettings(auth.admin) })
}
