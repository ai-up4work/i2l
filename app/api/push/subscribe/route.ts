// app/api/push/subscribe/route.ts
//
// POST   — register this browser/device for push for the signed-in customer.
// DELETE — unregister it (turning notifications off, or signing out).
//
// Uses the service role for the write because a device's endpoint is
// unique: if a different account signs in on the same device, the row is
// reassigned to them, which RLS (own rows only) wouldn't allow.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

interface SubscriptionBody {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

function isValidEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false
  try {
    return new URL(endpoint).protocol === 'https:'
  } catch {
    return false
  }
}

async function currentUserId() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: SubscriptionBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }

  const { endpoint, keys } = body
  if (!isValidEndpoint(endpoint) || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid push subscription.' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint,
      p256dh: keys.p256dh.slice(0, 200),
      auth: keys.auth.slice(0, 100),
      user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      last_seen_at: new Date().toISOString(),
      failure_count: 0,
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    console.error('[push/subscribe] upsert failed', error)
    return NextResponse.json({ error: 'Could not save this device.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: { endpoint?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }
  if (!isValidEndpoint(body.endpoint)) {
    return NextResponse.json({ error: 'Invalid endpoint.' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint)
    .eq('user_id', userId)
  if (error) {
    console.error('[push/subscribe] delete failed', error)
    return NextResponse.json({ error: 'Could not remove this device.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
