// app/api/admin/media-sweep/route.ts
//
// Super Admin → Media cleanup.
//   GET   recent runs
//   POST  { dryRun?: boolean, force?: boolean }
//         dryRun (default true) only reports. force skips the
//         "more than half look unused" stop, after the admin has seen
//         the list.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SUPER_ADMIN_ONLY } from '@/lib/supabase/admin-auth'
import { recentSweepRuns, runMediaSweep } from '@/lib/media-sweep'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  return NextResponse.json({ runs: await recentSweepRuns(10) })
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(SUPER_ADMIN_ONLY)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as { dryRun?: unknown; force?: unknown }
  const report = await runMediaSweep({
    dryRun: body.dryRun !== false,
    force: body.force === true,
    trigger: 'manual',
  })
  return NextResponse.json({ report, runs: await recentSweepRuns(10) })
}
