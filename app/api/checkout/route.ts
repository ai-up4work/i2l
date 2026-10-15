// app/api/checkout/route.ts
//
// POST -> place the order. Replaces the browser-side insert that used to
// live in DashboardContext.confirmCartOrder: prices are re-worked out on
// the server, the coupon is checked and redeemed atomically, and orders
// are created with the service role. Returns the checkout id the payment
// page uses.

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/current-user'
import { parseLines, parseRecipient, placeCheckout } from '@/lib/checkout/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const lines = parseLines(body.lines)
  if ('error' in lines) return NextResponse.json({ error: lines.error }, { status: 400 })
  const recipient = parseRecipient(body.recipient)
  if ('error' in recipient) return NextResponse.json({ error: recipient.error }, { status: 400 })

  try {
    const result = await placeCheckout(auth.userId, {
      lines,
      recipient,
      delivery: body.delivery === 'economy' ? 'economy' : 'express',
      couponToken: typeof body.couponToken === 'string' && body.couponToken.trim() ? body.couponToken.trim() : null,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[checkout]', err)
    return NextResponse.json({ error: 'Something went wrong placing your order. Please try again.' }, { status: 500 })
  }
}
