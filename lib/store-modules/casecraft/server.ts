// lib/store-modules/casecraft/server.ts
//
// Server side of Case Craft: reads and writes its own tables
// (data/wishdrop-casecraft.sql) with the service role. Never import from
// a client component.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'
import {
  buildStorefrontData,
  DEFAULT_CASECRAFT_SETTINGS,
  normalizeCaseCraftSettings,
  type CaseCraftSettings,
  type DesignRow,
  type PrintRow,
  type StorefrontData,
} from './settings'

/** The Case Craft tables aren't in the generated Database types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, 'public', any>

export function casecraftDb(client?: unknown): Db {
  return (client ?? createServiceRoleClient()) as unknown as Db
}

export const CASECRAFT_MIGRATION_HINT = 'The database needs an update first: run data/wishdrop-casecraft.sql in Supabase.'

/** Table missing (migration not run yet). */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /schema cache|does not exist/i.test(error.message ?? '')
}

export async function sellerIdForSlug(slug: string, db: Db = casecraftDb()): Promise<string | null> {
  const { data } = await db.from('sellers').select('id').eq('platform_slug', slug).maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

export type SettingsRecord = {
  settings: CaseCraftSettings
  marginPercent: number
  marginUpdatedAt: string | null
  marginUpdatedBy: string | null
  needsMigration: boolean
}

export async function loadSettings(sellerId: string, db: Db = casecraftDb()): Promise<SettingsRecord> {
  const { data, error } = await db.from('casecraft_settings').select('*').eq('seller_id', sellerId).maybeSingle()
  if (error) {
    if (!isMissingTable(error)) console.error('[casecraft] settings —', error.message)
    return { settings: DEFAULT_CASECRAFT_SETTINGS, marginPercent: 0, marginUpdatedAt: null, marginUpdatedBy: null, needsMigration: isMissingTable(error) }
  }
  const row = (data ?? null) as { settings?: unknown; margin_percent?: number | string; margin_updated_at?: string | null; margin_updated_by?: string | null } | null
  return {
    settings: normalizeCaseCraftSettings(row?.settings ?? {}),
    marginPercent: Number(row?.margin_percent ?? 0),
    marginUpdatedAt: row?.margin_updated_at ?? null,
    marginUpdatedBy: row?.margin_updated_by ?? null,
    needsMigration: false,
  }
}

export async function loadDesigns(sellerId: string, db: Db = casecraftDb()): Promise<{ designs: DesignRow[]; needsMigration: boolean }> {
  const { data, error } = await db
    .from('casecraft_designs')
    .select('*')
    .eq('seller_id', sellerId)
    .order('sort', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    if (!isMissingTable(error)) console.error('[casecraft] designs —', error.message)
    return { designs: [], needsMigration: isMissingTable(error) }
  }
  return { designs: (data ?? []) as DesignRow[], needsMigration: false }
}

export async function loadPrints(sellerId: string, db: Db = casecraftDb()): Promise<{ prints: PrintRow[]; needsMigration: boolean }> {
  const { data, error } = await db
    .from('casecraft_prints')
    .select('*')
    .eq('seller_id', sellerId)
    .order('sort', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) {
    if (!isMissingTable(error)) console.error('[casecraft] prints —', error.message)
    return { prints: [], needsMigration: isMissingTable(error) }
  }
  return { prints: (data ?? []) as PrintRow[], needsMigration: false }
}

/** Like totals for these designs / prints, keyed 'design:<id>' / 'print:<id>'. */
export async function loadLikeCounts(designIds: string[], printIds: string[], db: Db = casecraftDb()): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const ids = [...designIds, ...printIds]
  if (!ids.length) return out
  const { data, error } = await db.from('casecraft_like_counts').select('target_type, target_id, likes').in('target_id', ids)
  if (error) {
    if (!isMissingTable(error)) console.error('[casecraft] likes —', error.message)
    return out
  }
  for (const r of (data ?? []) as { target_type: string; target_id: string; likes: number }[]) out[`${r.target_type}:${r.target_id}`] = Number(r.likes)
  return out
}

/** Everything the store page needs, with Wishdrop's margin applied. */
export async function loadStorefront(slug: string): Promise<StorefrontData | null> {
  const db = casecraftDb()
  const sellerId = await sellerIdForSlug(slug, db)
  if (!sellerId) return null
  const [rec, des, pr] = await Promise.all([loadSettings(sellerId, db), loadDesigns(sellerId, db), loadPrints(sellerId, db)])
  const likes = await loadLikeCounts(
    des.designs.filter((d) => d.active).map((d) => d.id),
    pr.prints.filter((p) => p.active).map((p) => p.id),
    db,
  )
  return buildStorefrontData(slug, rec.settings, rec.marginPercent, des.designs, pr.prints, likes)
}

/** Short, readable order reference, e.g. CC-7K2QF9. */
export function newOrderRef(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return `CC-${s}`
}
