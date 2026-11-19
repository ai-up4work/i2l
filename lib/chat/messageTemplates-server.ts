// lib/chat/messageTemplates-server.ts
//
// Server side of the editable customer-message templates. Reads the saved
// overrides (public.message_templates, data/wishdrop-message-templates.sql),
// cached across requests and invalidated the moment Super Admin saves.
// If the table is missing or unreachable it returns nothing, so messages
// fall back to the built-in wording and never fail to send.

import 'server-only'
import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { setTemplateOverrides, type TemplateOverrides } from './messageTemplateDefs'

export const MESSAGE_TEMPLATES_TAG = 'message-templates'

export type TemplateRecord = { overrides: TemplateOverrides; updatedAt: Record<string, string>; updatedBy: Record<string, string | null>; needsMigration: boolean }

async function readFromDatabase(): Promise<TemplateRecord> {
  const empty: TemplateRecord = { overrides: {}, updatedAt: {}, updatedBy: {}, needsMigration: false }
  try {
    const { data, error } = await createServiceRoleClient()
      .from('message_templates' as never)
      .select('key, body, updated_at, updated_by_name')
    if (error) {
      const e = error as { code?: string; message?: string }
      const missing = e.code === '42P01' || e.code === 'PGRST205' || /schema cache|does not exist/i.test(e.message ?? '')
      if (!missing) console.error('[message-templates] using defaults —', e.message)
      return { ...empty, needsMigration: missing }
    }
    const rec: TemplateRecord = { ...empty }
    const overrides: Record<string, string> = {}
    for (const r of (data ?? []) as unknown as { key: string; body: string; updated_at: string; updated_by_name: string | null }[]) {
      overrides[r.key] = r.body
      rec.updatedAt[r.key] = r.updated_at
      rec.updatedBy[r.key] = r.updated_by_name
    }
    setTemplateOverrides(overrides)
    // Keep only keys the app knows (setTemplateOverrides already filtered).
    const { getTemplateOverrides } = await import('./messageTemplateDefs')
    rec.overrides = getTemplateOverrides()
    return rec
  } catch (err) {
    console.error('[message-templates] using defaults —', err instanceof Error ? err.message : err)
    return empty
  }
}

const cachedRead = unstable_cache(readFromDatabase, ['message-templates-v1'], {
  tags: [MESSAGE_TEMPLATES_TAG],
  revalidate: 600, // safety net; saving invalidates immediately
})

export async function loadTemplateRecord(): Promise<TemplateRecord> {
  try {
    return await cachedRead()
  } catch {
    return readFromDatabase()
  }
}

/** Loads the saved wording AND installs it for this server process. Call before building a customer message on the server. */
export async function ensureMessageTemplates(): Promise<void> {
  const rec = await loadTemplateRecord()
  setTemplateOverrides(rec.overrides)
}
