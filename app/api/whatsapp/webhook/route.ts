// app/api/whatsapp/webhook/route.ts
//
// Requires an env var:
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN – any string you choose; must match
//   what you enter in Meta's App Dashboard when registering this URL.
//
// NOTE: this is a starting skeleton, not production-hardened. Before
// going live, add signature verification using the 'X-Hub-Signature-256'
// header + your app secret, so you can trust that requests actually
// came from Meta and not a forged POST to this public URL.

import { NextRequest, NextResponse } from 'next/server'

// Meta calls this once, at setup time, to verify you own the endpoint.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// Meta POSTs here every time a message or status event happens.
export async function POST(req: NextRequest) {
  const payload = await req.json()

  const entry = payload?.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value

  // Inbound customer message.
  const message = value?.messages?.[0]
  if (message) {
    const from = message.from // customer's WhatsApp number, E.164 digits only
    const text = message.text?.body

    // Per the current design, WhatsApp replies don't need to sync back
    // into the platform thread — this is just where you'd hook that up
    // later if that decision changes. For now, logging is enough to
    // confirm the webhook is wired correctly.
    console.log('Inbound WhatsApp message', { from, text })
  }

  // Delivery/read status updates for messages you sent (sent/delivered/
  // read/failed) — useful for confirming a template message actually
  // reached the customer.
  const status = value?.statuses?.[0]
  if (status) {
    console.log('WhatsApp status update', status)
  }

  // Always return 200 quickly. If Meta doesn't get a fast 200, it
  // retries repeatedly and can eventually disable the webhook.
  return NextResponse.json({ received: true })
}