// app/api/admin/referrals/[referralId]/route.ts — Manager / Super Admin.
//   POST { action: 'reward' }            -> give the referrer their reward now
//   POST { action: 'void', reason }      -> cancel a referral (e.g. fraud);
//                                           unused reward coupons are withdrawn

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import { staffName } from '@/lib/supabase/staff-name'
import { adminRewardReferral, adminVoidReferral } from '@/lib/referrals/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ referralId: string }> }) {
  const auth = await requireStaffRole(['manager', 'super_admin'])
  if (!auth.ok) return auth.response
  const { referralId } = await params
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; reason?: unknown }
  const name = (await staffName(auth.admin, auth.staffId)) ?? 'Staff'
  const result =
    body.action === 'reward'
      ? await adminRewardReferral(auth.admin, referralId, name)
      : body.action === 'void'
        ? await adminVoidReferral(auth.admin, referralId, typeof body.reason === 'string' ? body.reason.slice(0, 200) : '')
        : { ok: false, error: 'Unknown action.' }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
