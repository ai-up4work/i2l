// lib/store-preview.ts
//
// Hidden stores. A store whose status isn't 'active' (hidden in Social
// Stores, or deactivated on the Sellers page) is unavailable to shoppers:
// they get a friendly "this shop isn't available" page, and its product
// pages and product lists return nothing.
//
// Two kinds of people can still open it, as a preview with a banner:
//   - staff who manage stores (Super Admin, Manager, Sales);
//   - the store's own seller (sellers.owner_user_id), so they can check
//     their store before it goes live or while it's paused.
// Responses served in preview mode are never cached.

import 'server-only'
import { cache } from 'react'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const STORE_PREVIEW_ROLES = ['super_admin', 'manager', 'sales'] as const

export type PreviewViewer = 'staff' | 'seller'

/** Who is signed in, for preview purposes. Cached per request. Never throws. */
const getViewer = cache(async (): Promise<{ userId: string; isStaff: boolean } | null> => {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const admin = createServiceRoleClient()
    let { data: staff } = await admin.from('staff_accounts').select('role, status').eq('user_id', user.id).maybeSingle()
    if (!staff && user.email) {
      ;({ data: staff } = await admin.from('staff_accounts').select('role, status').eq('email', user.email).maybeSingle())
    }
    const row = staff as { role: string; status: string } | null
    const isStaff = Boolean(row && row.status === 'active' && (STORE_PREVIEW_ROLES as readonly string[]).includes(row.role))
    return { userId: user.id, isStaff }
  } catch {
    return null
  }
})

/**
 * Can the signed-in user preview this (hidden) store? Returns who they are
 * ('staff' or 'seller' for the store's own seller), or null for everyone
 * else. Cached per request. Never throws.
 */
export const canPreviewStore = cache(async (platform: string): Promise<PreviewViewer | null> => {
  const viewer = await getViewer()
  if (!viewer) return null
  if (viewer.isStaff) return 'staff'
  try {
    const { data } = await createServiceRoleClient()
      .from('sellers')
      .select('id')
      .eq('platform_slug', platform)
      .eq('owner_user_id', viewer.userId)
      .maybeSingle()
    return data ? 'seller' : null
  } catch {
    return null
  }
})

export const PREVIEW_CACHE_HEADERS = { 'Cache-Control': 'private, no-store' }
