// middleware.ts (project root)
//
// Runs on every matched request to keep the Supabase auth cookie fresh.
// Without this, a session can silently expire mid-visit and server
// components will see a stale/missing user.

import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Skip static assets and image optimization files — no auth-relevant
     * work happens for those, and running the session refresh on every
     * font/image request would be pure overhead.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
