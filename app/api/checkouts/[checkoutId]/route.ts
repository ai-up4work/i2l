// app/api/checkouts/[checkoutId]/route.ts — GET the customer's own checkout
// (totals, orders, payment state) for the Order placed page.

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/current-user'
import { checkoutForCustomer } from '@/lib/payments/server'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ checkoutId: string }> }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const { checkoutId } = await params
  const checkout = await checkoutForCustomer(auth.userId, checkoutId)
  if (!checkout) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  return NextResponse.json({ checkout })
}
