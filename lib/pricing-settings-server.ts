// lib/pricing-settings-server.ts
//
// Server side of the editable pricing settings (lib/pricing-settings.ts).
//
// loadPricingSettings() reads the saved row from Supabase
// (public.pricing_settings, data/wishdrop-pricing-settings.sql), cached
// across requests and invalidated the moment staff save on Admin →
// Pricing engine (revalidateTag(PRICING_SETTINGS_TAG)). If the table is
// missing or unreachable it falls back to the defaults, so a database
// problem can never take prices off the site.
//
// ensurePricingSettings() also installs them as the live settings for
// this server process. Call it at the top of any server code that prices
// something (product pages, API routes) before calling lib/pricing.ts /
// lib/quote.ts. The root layout calls it on every page render and passes
// the same object to the browser.

import 'server-only'
import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import {
  DEFAULT_PRICING_SETTINGS,
  normalizePricingSettings,
  setPricingSettings,
  type PricingSettings,
} from '@/lib/pricing-settings'

export const PRICING_SETTINGS_TAG = 'pricing-settings'

export type PricingSettingsRecord = {
  settings: PricingSettings
  /** False when nothing has been saved yet (or the table is missing). */
  saved: boolean
  updatedAt: string | null
  updatedBy: string | null
}

async function readFromDatabase(): Promise<PricingSettingsRecord> {
  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('pricing_settings')
      .select('settings, updated_at, updated_by_name')
      .eq('id', 1)
      .maybeSingle()
    if (error) throw error
    if (!data) return { settings: DEFAULT_PRICING_SETTINGS, saved: false, updatedAt: null, updatedBy: null }
    const row = data as { settings: unknown; updated_at: string | null; updated_by_name: string | null }
    return { settings: normalizePricingSettings(row.settings), saved: true, updatedAt: row.updated_at, updatedBy: row.updated_by_name }
  } catch (err) {
    console.error('[pricing-settings] using defaults —', err instanceof Error ? err.message : err)
    return { settings: DEFAULT_PRICING_SETTINGS, saved: false, updatedAt: null, updatedBy: null }
  }
}

const cachedRead = unstable_cache(readFromDatabase, ['pricing-settings-v1'], {
  tags: [PRICING_SETTINGS_TAG],
  // Safety net only — saving invalidates the cache immediately.
  revalidate: 600,
})

export async function loadPricingSettingsRecord(): Promise<PricingSettingsRecord> {
  try {
    return await cachedRead()
  } catch {
    // unstable_cache can't run outside a request (e.g. some scripts).
    return readFromDatabase()
  }
}

export async function loadPricingSettings(): Promise<PricingSettings> {
  return (await loadPricingSettingsRecord()).settings
}

/** Loads the saved settings AND makes them the live ones for this server. */
export async function ensurePricingSettings(): Promise<PricingSettings> {
  const settings = await loadPricingSettings()
  setPricingSettings(settings)
  return settings
}
