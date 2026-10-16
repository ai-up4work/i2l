// app/api/admin/orders/[orderId]/payment/route.ts
//
// Staff (Sales, Manager, Super Admin): the payment side of an order —
// which checkout it belongs to, the money breakdown (coupon included),
// customer contact, and payment history.
//
// GET                                   -> { payment, requestPayment }
// POST { action: 'mark-paid', method, reference?, amountLKR?, note? }
// POST { action: 'mark-unpaid', reason }
// POST { action: 'cancel', reason }      -> cancel an UNPAID order (all of its checkout)
// POST { action: 'refund', mode: 'cancel' | 'partial', amountLKR, method, reference?, reason }
//                                       -> Manager / Super Admin: refund a PAID order
//
// Payment is manual for now (WhatsApp) — see lib/payments/server.ts.

import { NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { cancelUnpaidCheckout, checkoutForOrder, refundOrder, refundsForOrder, requestPaymentForOrder, REFUND_METHODS, type RefundMethod, markCheckoutUnpaid, recordManualPayment, MANUAL_METHODS, type ManualMethod } from '@/lib/payments/server'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { orderId } = await params
  const payment = await checkoutForOrder(orderId)
  // Not a checkout order: a request order carries its payment on the request.
  const requestPayment = payment ? null : await requestPaymentForOrder(orderId)
  const refunds = await refundsForOrder(orderId)
  return NextResponse.json({ payment, requestPayment, refunds, canRefund: auth.role !== 'sales' })
}

export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const auth = await requireStaffRole(SOURCING_ROLES)
  if (!auth.ok) return auth.response
  const { orderId } = await params
  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    method?: string
    reference?: string
    amountLKR?: number
    note?: string
    reason?: string
    mode?: 'cancel' | 'partial'
  }

  // Refunds: Manager / Super Admin only. Works for checkout and request orders.
  if (body.action === 'refund') {
    if (auth.role === 'sales') return NextResponse.json({ error: 'Ask a manager to refund an order.' }, { status: 403 })
    if (!REFUND_METHODS.includes(body.method as RefundMethod)) {
      return NextResponse.json({ error: 'Choose how to refund.' }, { status: 400 })
    }
    const r = await refundOrder(orderId, { id: auth.staffId }, {
      mode: body.mode === 'partial' ? 'partial' : 'cancel',
      amountLKR: Number(body.amountLKR),
      method: body.method as RefundMethod,
      reference: body.reference,
      reason: body.reason ?? '',
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 })
    return NextResponse.json({
      refund: r,
      payment: await checkoutForOrder(orderId),
      requestPayment: await requestPaymentForOrder(orderId),
      refunds: await refundsForOrder(orderId),
    })
  }

  const current = await checkoutForOrder(orderId)
  if (!current) {
    return NextResponse.json({ error: 'This order wasn’t placed through checkout, so it has no payment record.' }, { status: 404 })
  }

  let result
  if (body.action === 'mark-paid') {
    if (!MANUAL_METHODS.includes(body.method as ManualMethod)) {
      return NextResponse.json({ error: 'Choose how the customer paid.' }, { status: 400 })
    }
    result = await recordManualPayment(current.id, auth.staffId, {
      method: body.method as ManualMethod,
      reference: body.reference,
      amountLKR: body.amountLKR != null ? Number(body.amountLKR) : undefined,
      note: body.note,
    })
  } else if (body.action === 'mark-unpaid') {
    if (auth.role === 'sales') {
      return NextResponse.json({ error: 'Ask a manager to undo a payment.' }, { status: 403 })
    }
    result = await markCheckoutUnpaid(current.id, auth.staffId, body.reason ?? '')
  } else if (body.action === 'cancel') {
    result = await cancelUnpaidCheckout(current.id, auth.staffId, body.reason ?? '')
  } else {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
  return NextResponse.json({ payment: await checkoutForOrder(orderId) })
}
