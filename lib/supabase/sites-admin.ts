// lib/supabase/sites-admin.ts
//
// Real `sites` table access — previously AdminDataContext.tsx hardcoded
// a `SITES` const (three fixed rows) instead of ever reading this table,
// even though it already exists and is already seeded (see
// data/wishdrop-seed-staff-sites.sql). The warehouses admin page's own
// header comment already flagged this as a known gap ("no addSite/
// updateSite/deactivateSite mutation yet... won't survive a refresh").
// This file is what actually closes it.

import { createClient } from '@/lib/supabase/client'
import type { Site } from '@/types/admin'

function mapRow(row: {
  id: string
  name: string
  location: string
  headcount: number
  active: boolean
  is_default: boolean
}): Site {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    headcount: row.headcount,
    active: row.active,
    isDefault: row.is_default,
  }
}

export async function fetchSites(): Promise<Site[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('sites').select('id, name, location, headcount, active, is_default').order('name')
  if (error) {
    console.error('[fetchSites]', { message: error.message, details: error.details, hint: error.hint, code: error.code })
    return []
  }
  return (data ?? []).map(mapRow)
}

export async function createSite(name: string, location: string): Promise<{ ok: boolean; site?: Site; error?: string }> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('sites')
    .insert({ name, location })
    .select('id, name, location, headcount, active, is_default')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not create site.' }
  return { ok: true, site: mapRow(data) }
}

export async function updateSite(siteId: string, patch: { name?: string; location?: string }): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('sites').update(patch).eq('id', siteId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function setSiteActive(siteId: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('sites').update({ active }).eq('id', siteId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/**
 * Makes `siteId` the one default site, clearing any previous default in
 * the same operation (two statements, not one atomic transaction — the
 * client can't open one — but the partial unique index on
 * sites.is_default, see data/wishdrop-sites-default.sql, means the
 * worst a failure between them can do is leave NO default rather than
 * two, since the index would reject a second `true` row outright).
 */
export async function setDefaultSite(siteId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { error: clearError } = await supabase.from('sites').update({ is_default: false }).eq('is_default', true)
  if (clearError) return { ok: false, error: clearError.message }
  const { error: setError } = await supabase.from('sites').update({ is_default: true }).eq('id', siteId)
  return setError ? { ok: false, error: setError.message } : { ok: true }
}