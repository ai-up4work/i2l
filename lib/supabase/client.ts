// lib/supabase/client.ts
//
// Browser-side Supabase client — use this from 'use client' components
// (AuthContext, cart/wishlist sync, etc). It reads the session from
// cookies set by middleware.ts, so it stays in sync with server components
// without you having to pass the session down manually.

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
