// app/api/push/preferences/route.ts
//
// GET   — the signed-in customer's notification preferences.
// PATCH — { offers: boolean } turns offers/promotional broadcasts on or off.
//
// Runs as the customer (RLS "own profile" policy), not the service role.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data, error } = await supabase.from('profiles').select('push_offers').eq('id', user.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not load preferences.' }, { status: 500 })
  return NextResponse.json({ offers: data?.push_offers ?? true })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: { offers?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }
  if (typeof body.offers !== 'boolean') {
    return NextResponse.json({ error: '`offers` must be true or false.' }, { status: 400 })
  }

  const { error } = await supabase.from('profiles').update({ push_offers: body.offers }).eq('id', user.id)
  if (error) return NextResponse.json({ error: 'Could not save preferences.' }, { status: 500 })
  return NextResponse.json({ offers: body.offers })
}
