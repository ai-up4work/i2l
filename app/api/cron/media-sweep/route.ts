// app/api/cron/media-sweep/route.ts
//
// Daily ghost-media cleanup, called by Vercel Cron (vercel.json, 03:00
// Sri Lanka time). Vercel sends `Authorization: Bearer <CRON_SECRET>`;
// any other caller gets 401. See lib/media-sweep.ts for what it deletes.

import { NextRequest, NextResponse } from 'next/server'
import { runMediaSweep } from '@/lib/media-sweep'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }
  const report = await runMediaSweep({ trigger: 'schedule' })
  // Keep the cron log short: counts only.
  const { sample: _sample, ...summary } = report
  return NextResponse.json(summary, { status: report.status === 'error' ? 500 : 200 })
}
