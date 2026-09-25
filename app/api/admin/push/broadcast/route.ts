// app/api/admin/push/broadcast/route.ts
//
// Broadcasts: one message to all customers or a segment.
//
// GET  — recent broadcast history (for /admin/broadcasts).
// POST — { mode, kind, title, body, url, audience }
//   mode 'preview': how many customers the audience covers, and how many
//                   of them have push turned on. Sends nothing.
//   mode 'test':    push to the signed-in staff member's own devices only.
//   mode 'send':    in-app notification for every customer in the
//                   audience + push to all their devices. Recorded in
//                   push_broadcasts.
//
// Manager and Super Admin only — a broadcast reaches every customer.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import type { Json } from '@/lib/supabase/types'
import { isPushConfigured, sendPushToUsers } from '@/lib/push/server'
import {
  audienceLabel,
  BROADCAST_LIMITS as LIMITS,
  countUsersWithDevices,
  parseAudience,
  resolveAudience,
  type Audience,
  type BroadcastKind,
} from '@/lib/push/audience'

export const runtime = 'nodejs'
// Large audiences take a while to fan out; Vercel's default would cut it short.
export const maxDuration = 300

const BROADCAST_ROLES = ['manager', 'super_admin'] as const

interface Draft {
  kind: BroadcastKind
  title: string
  body: string
  url: string
  audience: Audience
}

function parseDraft(input: Record<string, unknown>): { draft?: Draft; error?: string } {
  const kind = input.kind === 'offer' ? 'offer' : input.kind === 'announcement' ? 'announcement' : null
  if (!kind) return { error: 'Choose announcement or offer.' }

  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  if (!title) return { error: 'Add a title.' }
  if (!body) return { error: 'Add a message.' }
  if (title.length > LIMITS.title) return { error: `Keep the title under ${LIMITS.title} characters.` }
  if (body.length > LIMITS.body) return { error: `Keep the message under ${LIMITS.body} characters.` }

  // Only links inside WishDrop: a path like /deals or /stores/myntra.
  let url = typeof input.url === 'string' && input.url.trim() ? input.url.trim() : '/'
  if (!url.startsWith('/') || url.startsWith('//')) {
    return { error: 'The link must be a page on WishDrop, starting with / (for example /deals).' }
  }
  url = url.slice(0, 300)

  const audience = parseAudience(input.audience)
  if (!audience) return { error: 'Choose who should receive this.' }

  return { draft: { kind, title, body, url, audience } }
}

export async function GET() {
  const auth = await requireStaffRole(BROADCAST_ROLES)
  if (!auth.ok) return auth.response

  const { data, error } = await auth.admin
    .from('push_broadcasts')
    .select(
      'id, kind, title, body, url, audience_label, created_by_name, status, recipient_count, device_count, push_sent, push_failed, error, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) return NextResponse.json({ error: 'Could not load broadcasts.' }, { status: 500 })
  return NextResponse.json({ broadcasts: data ?? [], pushConfigured: isPushConfigured() })
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(BROADCAST_ROLES)
  if (!auth.ok) return auth.response
  const { admin, staffId } = auth

  let input: Record<string, unknown>
  try {
    input = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }

  const mode = input.mode
  if (mode !== 'preview' && mode !== 'test' && mode !== 'send') {
    return NextResponse.json({ error: 'Unknown mode.' }, { status: 400 })
  }

  // Preview only needs kind + audience; don't block counting on an empty title.
  if (mode === 'preview') {
    const audience = parseAudience(input.audience)
    const kind: BroadcastKind = input.kind === 'offer' ? 'offer' : 'announcement'
    if (!audience) return NextResponse.json({ recipients: 0, withPush: 0 })
    try {
      const ids = await resolveAudience(admin, audience, kind)
      const withPush = await countUsersWithDevices(admin, ids)
      return NextResponse.json({ recipients: ids.length, withPush })
    } catch (err) {
      console.error('[broadcast preview]', err)
      return NextResponse.json({ error: 'Could not count this audience.' }, { status: 500 })
    }
  }

  const { draft, error: draftError } = parseDraft(input)
  if (!draft) return NextResponse.json({ error: draftError }, { status: 400 })

  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: 'Push isn’t set up yet: add the VAPID keys on Vercel (see PUSH_NOTIFICATIONS.md).' },
      { status: 503 },
    )
  }

  const { data: staff } = await admin.from('staff_accounts').select('name, user_id').eq('id', staffId).maybeSingle()
  const payload = {
    kind: draft.kind,
    title: draft.title,
    body: draft.body,
    url: draft.url,
    tag: `broadcast-${Date.now()}`,
  } as const

  // ── Test: only the sender's own devices ──
  if (mode === 'test') {
    if (!staff?.user_id) {
      return NextResponse.json({ error: 'Your staff account isn’t linked to a login yet.' }, { status: 400 })
    }
    const result = await sendPushToUsers(admin, [staff.user_id], { ...payload, kind: 'test' })
    if (result.devices === 0) {
      return NextResponse.json(
        {
          error:
            'You have no devices with notifications on. Sign in to the customer site with this account on your phone or browser, turn notifications on in My Profile → Notifications, then try again.',
        },
        { status: 400 },
      )
    }
    return NextResponse.json({ ok: true, ...result })
  }

  // ── Send ──
  // Guard against a double-click / double-submit sending twice.
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: recent } = await admin
    .from('push_broadcasts')
    .select('id')
    .eq('title', draft.title)
    .eq('body', draft.body)
    .gte('created_at', since)
    .limit(1)
  if (recent?.length) {
    return NextResponse.json(
      { error: 'This exact broadcast was sent less than 2 minutes ago.' },
      { status: 409 },
    )
  }

  const { data: row, error: insertError } = await admin
    .from('push_broadcasts')
    .insert({
      kind: draft.kind,
      title: draft.title,
      body: draft.body,
      url: draft.url,
      audience: draft.audience as unknown as Json,
      audience_label: audienceLabel(draft.audience),
      created_by: staffId,
      created_by_name: staff?.name ?? null,
    })
    .select('id')
    .single()
  if (insertError || !row) {
    console.error('[broadcast] insert failed', insertError)
    return NextResponse.json({ error: 'Could not start the broadcast.' }, { status: 500 })
  }

  try {
    const userIds = await resolveAudience(admin, draft.audience, draft.kind)

    // In-app notification (the bell) for everyone in the audience — this
    // reaches customers who haven't turned push on, too.
    for (let i = 0; i < userIds.length; i += 500) {
      const { error } = await admin.from('notifications').insert(
        userIds.slice(i, i + 500).map((user_id) => ({
          user_id,
          type: draft.kind,
          title: draft.title,
          body: draft.body,
          link: draft.url,
        })),
      )
      if (error) throw error
    }

    const result = await sendPushToUsers(admin, userIds, { ...payload, tag: `broadcast-${row.id}` })

    await admin
      .from('push_broadcasts')
      .update({
        status: 'sent',
        recipient_count: userIds.length,
        device_count: result.devices,
        push_sent: result.sent,
        push_failed: result.failed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    return NextResponse.json({ ok: true, id: row.id, recipients: userIds.length, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[broadcast] send failed', err)
    await admin
      .from('push_broadcasts')
      .update({ status: 'failed', error: message.slice(0, 500), completed_at: new Date().toISOString() })
      .eq('id', row.id)
    return NextResponse.json({ error: 'The broadcast failed partway. Check the history below.' }, { status: 500 })
  }
}
