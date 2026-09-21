// app/api/whatsapp/webhook/route.ts
//
// Requires an env var:
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN – any string you choose; must match
//   what you enter in Meta's App Dashboard when registering this URL.
//
// NOTE: not production-hardened yet — add signature verification using
// the 'X-Hub-Signature-256' header + your Meta app secret before this
// is handling real customer traffic, so you can trust a POST here
// actually came from Meta and not a forged request to this public URL.
// Left as a follow-up rather than built now to avoid introducing yet
// another required env var (the app secret) into an already-long setup
// chain before the core sync has even been tested once.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getOrCreateGeneralThread, sendChatMessage } from '@/lib/supabase/chat'
import { whatsAppDigitsToE164 } from '@/lib/chat/phone'

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

type InboundMessage = {
  from?: string
  type?: string
  text?: { body?: string }
}

async function handleInboundMessage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  message: InboundMessage,
) {
  const fromDigits = message.from
  if (!fromDigits) return

  // Text only for now — an image/audio/sticker/etc. reply is logged,
  // not dropped silently, but doesn't get written into chat_messages
  // yet (there's no attachment-download-and-reupload step here the way
  // the in-app composer's own upload flow has).
  if (message.type !== 'text' || !message.text?.body) {
    console.log('[whatsapp webhook] unsupported message type, skipping', message.type)
    return
  }

  const phoneE164 = whatsAppDigitsToE164(fromDigits)

  // Matched by profiles.phone specifically (not pending_phone) — that
  // column is only ever set once verify-code/route.ts's OTP check has
  // actually succeeded, so a match here is already implicitly "this is
  // a verified number," with no separate phone_verified check needed.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('phone', phoneE164)
    .maybeSingle()

  if (profileError) {
    console.error('[whatsapp webhook] profile lookup failed', profileError)
    return
  }
  if (!profile) {
    // No verified WishDrop account has this number on file — nothing
    // to attach the message to. Logged, not stored: there's no "unknown
    // sender" holding area for this yet (a real gap if this turns out
    // to happen often — e.g. someone messaging from a different phone
    // than the one on their account — but out of scope for this pass).
    console.log('[whatsapp webhook] no matching customer for', phoneE164, '— message dropped')
    return
  }

  const threadId = await getOrCreateGeneralThread(supabase, profile.id)

  await sendChatMessage(supabase, {
    threadId,
    sender: 'customer',
    senderName: profile.full_name || profile.email || 'Customer',
    text: message.text.body,
    channel: 'whatsapp',
  })
}

// Meta POSTs here every time a message or status event happens.
export async function POST(req: NextRequest) {
  const payload = await req.json()
  const supabase = createServiceRoleClient()

  // Looping every entry/change/message rather than only ever reading
  // [0] of each — Meta can and does batch more than one in a single
  // call, even though the common case is exactly one of each.
  try {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value
        for (const message of value?.messages ?? []) {
          await handleInboundMessage(supabase, message)
        }
        // Delivery/read status updates for messages you sent (sent/
        // delivered/read/failed) — logged for now; nothing in the app
        // currently displays per-message delivery state, so there's
        // nowhere to write this yet.
        for (const status of value?.statuses ?? []) {
          console.log('[whatsapp webhook] status update', status)
        }
      }
    }
  } catch (err) {
    // Logged, not re-thrown: a non-2xx response makes Meta retry the
    // SAME payload repeatedly and can eventually disable the webhook
    // entirely — worse than losing one event is losing the whole
    // subscription over it.
    console.error('[whatsapp webhook] failed to process payload', err)
  }

  // Always return 200 quickly regardless of outcome, for the same
  // reason — Meta's retry behavior treats anything else as "resend."
  return NextResponse.json({ received: true })
}