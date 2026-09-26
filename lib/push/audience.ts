// lib/push/audience.ts
//
// Broadcast audiences, and how each one is resolved to customer user ids.
// Server only (uses the service-role client).
//
// Every audience:
//   - excludes staff accounts (staff also have auth users/profiles), and
//   - for kind 'offer', excludes customers who turned offers off
//     (profiles.push_offers = false). Announcements ignore that setting —
//     they're for service news like delays or closures.

import type { createServiceRoleClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createServiceRoleClient>

export type BroadcastKind = 'announcement' | 'offer'

/** Longer text is cut off on most lock screens. Shared by the API and the admin form. */
export const BROADCAST_LIMITS = { title: 65, body: 240 } as const

export type Audience =
  | { type: 'all' }
  | { type: 'active_orders' }
  | { type: 'ordered_before' }
  | { type: 'never_ordered' }
  | { type: 'customers'; userIds: string[] }

export const AUDIENCE_OPTIONS: { type: Exclude<Audience['type'], 'customers'>; label: string; hint: string }[] = [
  { type: 'all', label: 'All customers', hint: 'Everyone with a Wishdrop account' },
  { type: 'active_orders', label: 'Customers with an order in progress', hint: 'Ordered, in quality check, or shipped' },
  { type: 'ordered_before', label: 'Customers who have ordered', hint: 'At least one order that wasn’t cancelled' },
  { type: 'never_ordered', label: 'Customers who haven’t ordered yet', hint: 'Signed up but no orders' },
]

export function audienceLabel(a: Audience): string {
  if (a.type === 'customers') return `${a.userIds.length} selected customer${a.userIds.length === 1 ? '' : 's'}`
  return AUDIENCE_OPTIONS.find((o) => o.type === a.type)?.label ?? a.type
}

export function parseAudience(input: unknown): Audience | null {
  if (!input || typeof input !== 'object') return null
  const a = input as { type?: string; userIds?: unknown }
  switch (a.type) {
    case 'all':
    case 'active_orders':
    case 'ordered_before':
    case 'never_ordered':
      return { type: a.type }
    case 'customers': {
      if (!Array.isArray(a.userIds)) return null
      const ids = a.userIds.filter(
        (id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id),
      )
      return ids.length ? { type: 'customers', userIds: Array.from(new Set(ids)).slice(0, 500) } : null
    }
    default:
      return null
  }
}

const PAGE = 1000 // PostgREST's default max rows per request

/** Reads one column across every page of a query. */
async function collectIds(
  build: (from: number, to: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>,
  column: string,
): Promise<Set<string>> {
  const ids = new Set<string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    for (const row of data ?? []) {
      const v = row[column]
      if (typeof v === 'string') ids.add(v)
    }
    if (!data || data.length < PAGE) break
  }
  return ids
}

async function staffUserIds(admin: AdminClient) {
  return collectIds(
    (from, to) => admin.from('staff_accounts').select('user_id').not('user_id', 'is', null).range(from, to),
    'user_id',
  )
}

async function customerIds(admin: AdminClient, kind: BroadcastKind) {
  return collectIds((from, to) => {
    let q = admin.from('profiles').select('id')
    if (kind === 'offer') q = q.eq('push_offers', true)
    return q.order('id').range(from, to)
  }, 'id')
}

async function orderUserIds(admin: AdminClient, stages: string[]) {
  return collectIds(
    (from, to) =>
      admin
        .from('orders')
        .select('user_id')
        .in('stage', stages as never)
        .order('id')
        .range(from, to),
    'user_id',
  )
}

const ACTIVE_STAGES = ['ordered', 'quality_check', 'shipped']
const NON_CANCELLED_STAGES = ['ordered', 'quality_check', 'shipped', 'delivered']

/** Resolves an audience to the customer user ids it currently covers. */
export async function resolveAudience(admin: AdminClient, audience: Audience, kind: BroadcastKind): Promise<string[]> {
  const [staff, customers] = await Promise.all([staffUserIds(admin), customerIds(admin, kind)])

  let ids: Set<string>
  switch (audience.type) {
    case 'all':
      ids = customers
      break
    case 'active_orders': {
      const ordered = await orderUserIds(admin, ACTIVE_STAGES)
      ids = new Set([...ordered].filter((id) => customers.has(id)))
      break
    }
    case 'ordered_before': {
      const ordered = await orderUserIds(admin, NON_CANCELLED_STAGES)
      ids = new Set([...ordered].filter((id) => customers.has(id)))
      break
    }
    case 'never_ordered': {
      const ordered = await orderUserIds(admin, NON_CANCELLED_STAGES)
      ids = new Set([...customers].filter((id) => !ordered.has(id)))
      break
    }
    case 'customers':
      ids = new Set(audience.userIds.filter((id) => customers.has(id)))
      break
  }

  return [...ids].filter((id) => !staff.has(id))
}

/** How many of these users have at least one device with push turned on. */
export async function countUsersWithDevices(admin: AdminClient, userIds: string[]): Promise<number> {
  const withDevice = new Set<string>()
  for (let i = 0; i < userIds.length; i += 300) {
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('user_id')
      .in('user_id', userIds.slice(i, i + 300))
    if (error) throw error
    for (const row of data ?? []) withDevice.add(row.user_id)
  }
  return withDevice.size
}
