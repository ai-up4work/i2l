// app/api/payments/mock/route.ts — POST { checkoutId, card } -> pay a
// checkout with the mock gateway (lib/payments/server.ts). No money moves.

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/current-user'
import { payCheckout } from '@/lib/payments/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as { checkoutId?: unknown; card?: Record<string, unknown> }
  if (typeof body.checkoutId !== 'string') return NextResponse.json({ error: 'Missing order.' }, { status: 400 })
  const result = await payCheckout(auth.userId, body.checkoutId, (body.card ?? {}) as never)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
  return NextResponse.json(result)
}
