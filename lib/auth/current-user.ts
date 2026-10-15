// lib/auth/current-user.ts
//
// SERVER-ONLY. The signed-in customer for an API route, or a 401 response.

import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function requireUser(): Promise<
  { ok: true; userId: string; email: string | null } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Please sign in first.' }, { status: 401 }) }
  }
  return { ok: true, userId: user.id, email: user.email ?? null }
}
