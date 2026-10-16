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
import { cookies, headers } from 'next/headers'
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
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // Audit log (data/wishdrop-audit-log.sql): tell the database WHO is
      // behind this server-side change, so its triggers record the staff
      // member (or customer) instead of "System (server)".
      global: { fetch: fetchWithActor },
    },
  )
}

/* ------------------------------------------------------------------------
 * Audit attribution for service-role writes.
 *
 * The service role has no logged-in user, so database triggers can't see
 * who made a change. Every request this client makes carries:
 *   x-wishdrop-actor-user  the signed-in user's id, read from their auth
 *                          cookie (the same session the route already
 *                          verified with requireStaffRole / requireUser);
 *   x-wishdrop-route       the page the action came from (Referer path).
 * PostgREST exposes request headers to SQL (request.headers), where
 * public.audit_row_change() reads them. Attribution only, never used for
 * permission checks. Outside a request (scripts, cron) nothing is added.
 * ---------------------------------------------------------------------- */

const actorCache = new WeakMap<object, { user: string | null; route: string | null }>()

function b64urlDecode(v: string): string {
  const b64 = v.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64 + '='.repeat((4 - (b64.length % 4)) % 4), 'base64').toString('utf8')
}

async function currentActor(): Promise<{ user: string | null; route: string | null }> {
  try {
    const store = await cookies()
    const hit = actorCache.get(store)
    if (hit) return hit

    // @supabase/ssr session cookie: sb-<ref>-auth-token, possibly split
    // into .0 / .1 chunks, possibly "base64-" encoded JSON.
    const parts = store
      .getAll()
      .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
      .sort((x, y) => (Number(x.name.split('.').pop()) || 0) - (Number(y.name.split('.').pop()) || 0))
    let user: string | null = null
    if (parts.length) {
      let raw = parts.map((c) => c.value).join('')
      if (raw.startsWith('base64-')) raw = b64urlDecode(raw.slice(7))
      const session = JSON.parse(raw) as { access_token?: string } | [string, ...unknown[]]
      const token = Array.isArray(session) ? session[0] : session.access_token
      const payload = token ? (JSON.parse(b64urlDecode(token.split('.')[1] ?? '')) as { sub?: string }) : null
      user = payload?.sub && /^[0-9a-f-]{36}$/i.test(payload.sub) ? payload.sub : null
    }

    let route: string | null = null
    try {
      const ref = (await headers()).get('referer')
      if (ref) route = new URL(ref).pathname.slice(0, 300)
    } catch {
      /* no request headers */
    }

    const actor = { user, route }
    actorCache.set(store, actor)
    return actor
  } catch {
    return { user: null, route: null } // outside a request, or an unreadable cookie
  }
}

const fetchWithActor: typeof fetch = async (input, init) => {
  const { user, route } = await currentActor()
  if (!user && !route) return fetch(input, init)
  const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  if (user) h.set('x-wishdrop-actor-user', user)
  if (route) h.set('x-wishdrop-route', route)
  return fetch(input, { ...init, headers: h })
}
