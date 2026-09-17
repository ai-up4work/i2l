// lib/supabase/middleware.ts
//
// Called from the root middleware.ts on every request. Refreshes the auth
// token if it's expired, and keeps the browser client + server client
// (Server Components can't set cookies themselves) in sync. This is the
// standard @supabase/ssr pattern for Next.js App Router.
//
// Also returns the resolved `user` (and the bound `supabase` client) so
// middleware.ts can make route-protection decisions off the SAME
// just-refreshed session, instead of creating a second client and
// re-doing the cookie dance.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Do not remove — this refreshes the session and must run before any
  // other logic that reads auth state, per Supabase's SSR guidance.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabaseResponse, supabase, user: user as User | null }
}