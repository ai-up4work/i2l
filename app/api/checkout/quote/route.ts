// app/api/checkout/quote/route.ts
//
// POST -> the server's price for the cart: every line, the totals, and
// whether a coupon code applies (and how much it takes off). Nothing is
// saved. The cart page shows these numbers, so what the customer sees is
// exactly what POST /api/checkout will charge.

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/current-user'
import { parseLines, quoteCheckout } from '@/lib/checkout/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const lines = parseLines(body.lines)
  if ('error' in lines) return NextResponse.json({ error: lines.error }, { status: 400 })

  try {
    const quote = await quoteCheckout(auth.userId, {
      lines,
      delivery: body.delivery === 'economy' ? 'economy' : 'express',
      couponToken: typeof body.couponToken === 'string' && body.couponToken.trim() ? body.couponToken.trim() : null,
    })
    return NextResponse.json(quote)
  } catch (err) {
    console.error('[checkout/quote]', err)
    return NextResponse.json({ error: 'Couldn’t price your cart right now. Please try again.' }, { status: 500 })
  }
}
