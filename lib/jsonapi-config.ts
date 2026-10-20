// lib/jsonapi-config.ts
//
// Pure helpers for the jsonapi provider config, safe to import from both
// client components (the seller form) and server routes (test-extractor).
// No fetches, no env access.

import type { JsonApiProviderConfig } from '@/lib/store-config'

/** Everything in a jsonapi config the admin edits — i.e. minus the parts the form owns elsewhere. */
export type JsonApiFields = Omit<JsonApiProviderConfig, 'type' | 'baseUrl' | 'currency'>

const NUMERIC_PAGINATION_KEYS = ['pageSize', 'startPage', 'maxPages'] as const

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

function cleanRecord(rec: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!rec) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (k.trim() && typeof v === 'string' && v.trim()) out[k.trim()] = v.trim()
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * Normalises whatever the form currently holds into a minimal config:
 * trims strings, drops empty values (so an unset field is truly unset,
 * not ''), coerces pagination numbers, and removes auth/pagination blocks
 * that aren't switched on. Never invents values.
 */
export function cleanJsonApiFields(fields: Partial<JsonApiFields>): JsonApiFields {
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    if (key === 'type' || key === 'baseUrl' || key === 'currency') continue
    if (key === 'headers' || key === 'queryParams') {
      const rec = cleanRecord(value as Record<string, string>)
      if (rec) out[key] = rec
      continue
    }
    if (key === 'auth') {
      const a = value as JsonApiFields['auth']
      if (!a || !a.type) continue
      const auth: Record<string, string> = { type: a.type }
      if (a.name?.trim()) auth.name = a.name.trim()
      if (a.valueEnv?.trim()) auth.valueEnv = a.valueEnv.trim()
      if (a.value?.trim()) auth.value = a.value.trim()
      out.auth = auth
      continue
    }
    if (key === 'pagination') {
      const p = value as JsonApiFields['pagination']
      if (!p || !p.type) continue
      const pg: Record<string, unknown> = { type: p.type }
      for (const [pk, pv] of Object.entries(p)) {
        if (pk === 'type') continue
        if ((NUMERIC_PAGINATION_KEYS as readonly string[]).includes(pk)) {
          const n = typeof pv === 'number' ? pv : parseInt(String(pv ?? ''), 10)
          if (Number.isFinite(n) && n > 0) pg[pk] = n
        } else if (typeof pv === 'string' && pv.trim()) {
          pg[pk] = pv.trim()
        }
      }
      out.pagination = pg
      continue
    }
    if (key === 'outOfStockValues') {
      const list = (Array.isArray(value) ? value : String(value ?? '').split(','))
        .map((s) => String(s).trim())
        .filter(Boolean)
      if (list.length) out.outOfStockValues = list
      continue
    }
    if (typeof value === 'string') {
      if (value.trim()) out[key] = value.trim()
      continue
    }
    if (!isEmpty(value)) out[key] = value
  }

  return out as JsonApiFields
}

/** Splits a saved provider_config into the editable fields (drops type/baseUrl/currency). */
export function jsonApiFieldsFromConfig(cfg: JsonApiProviderConfig): JsonApiFields {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { type, baseUrl, currency, ...rest } = cfg
  return rest
}

/** Minimum mapping needed before a feed can be tested or saved. */
export function jsonApiMissingRequired(fields: Partial<JsonApiFields>): string[] {
  const missing: string[] = []
  if (!fields.listEndpoint?.trim()) missing.push('List endpoint')
  if (!fields.idField?.trim()) missing.push('Id field')
  if (!fields.nameField?.trim()) missing.push('Name field')
  if (!fields.priceField?.trim() && !fields.variantPriceField?.trim()) missing.push('Price field')
  if (!fields.imageField?.trim() && !fields.imagesField?.trim()) missing.push('Image field')
  return missing
}

/**
 * Flattens one raw record into the field paths it contains, with a short
 * preview of each value — e.g. 'variants.0.price' → '1100'. Drives the
 * "pick a field" helper in the seller form.
 */
export function flattenFieldPaths(raw: unknown, maxDepth = 4): { path: string; preview: string }[] {
  const out: { path: string; preview: string }[] = []
  const walk = (value: unknown, path: string, depth: number) => {
    if (depth > maxDepth) return
    if (Array.isArray(value)) {
      if (path) out.push({ path, preview: `[${value.length} item${value.length === 1 ? '' : 's'}]` })
      if (value.length > 0) walk(value[0], path ? `${path}.0` : '0', depth + 1)
      return
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k, depth + 1)
      }
      return
    }
    const s = typeof value === 'string' ? value : JSON.stringify(value)
    out.push({ path, preview: s.length > 60 ? `${s.slice(0, 57)}…` : s })
  }
  walk(raw, '', 0)
  return out
}
