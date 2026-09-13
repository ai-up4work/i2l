// lib/supabase/server.ts
//
// Server-side Supabase client for Server Components, Server Actions, and
// Route Handlers (app/api/**/route.ts). Reads/writes the auth cookie via
// Next's cookies() API so the session survives across requests.
//
// NOTE: Server Components can't write cookies (Next.js restriction) — the
// try/catch below swallows that specific failure, which is fine as long as
// middleware.ts is refreshing the session on every request (it is, see
// middleware.ts at the project root).

import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from './types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component — middleware.ts already
            // refreshes the session cookie, so this is safe to ignore.
          }
        },
      },
    },
  )
}

/**
 * Service-role client — bypasses RLS entirely. SERVER-ONLY. Never import
 * this into a 'use client' file or a file that could end up in the client
 * bundle. Use for admin/ops routes (app/api/admin/**, app/admin/**'s data
 * loaders) where the operation legitimately needs to act across all users'
 * rows (e.g. staff editing any seller's products), and for auth.admin.*
 * calls (e.g. creating a seller login) — those specifically require the
 * plain supabase-js client, not the cookie-oriented @supabase/ssr one.
 */
export function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}