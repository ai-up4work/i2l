// lib/store-modules/casecraft/designs.ts
// Validation for ready-made designs (seller API). Pure.

import { getCaseType } from './catalog'

export type DesignInput = {
  name: string
  subtitle: string | null
  image_url: string
  case_type: string
  models: string[]
  price_lkr: number
  is_new: boolean
  is_bestseller: boolean
  active: boolean
  sort: number
}

/** Checks a design from the seller. `partial` for edits. Returns the
 *  clean fields or an error message. */
export function parseDesign(raw: unknown, partial = false): { ok: true; value: Partial<DesignInput> } | { ok: false; error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: Partial<DesignInput> = {}
  const has = (k: string) => r[k] !== undefined

  if (has('name') || !partial) {
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 80) : ''
    if (!name) return { ok: false, error: 'Give the design a name.' }
    out.name = name
  }
  if (has('subtitle')) out.subtitle = typeof r.subtitle === 'string' && r.subtitle.trim() ? r.subtitle.trim().slice(0, 80) : null
  if (has('image_url') || !partial) {
    const url = typeof r.image_url === 'string' ? r.image_url.trim() : ''
    if (!/^https:\/\//.test(url) || url.length > 600) return { ok: false, error: 'Add a photo of the design.' }
    out.image_url = url
  }
  let caseTypeId = typeof r.case_type === 'string' ? r.case_type : undefined
  if (has('case_type') || !partial) {
    const t = getCaseType(caseTypeId ?? 'tough-cases')
    if (!t) return { ok: false, error: 'Pick a case type.' }
    out.case_type = t.id
    caseTypeId = t.id
  }
  if (has('models')) {
    if (!Array.isArray(r.models)) return { ok: false, error: 'Pick the phone models.' }
    const t = getCaseType(caseTypeId ?? 'tough-cases')
    const valid = new Set(t?.models.map((m) => m.label) ?? [])
    out.models = [...new Set(r.models.filter((m): m is string => typeof m === 'string' && valid.has(m)))]
  } else if (!partial || has('case_type')) out.models = [] // new case type: fits every model again
  if (has('price_lkr') || !partial) {
    const p = Number(r.price_lkr)
    if (!Number.isFinite(p) || p <= 0 || p > 1_000_000) return { ok: false, error: 'Enter a price in rupees.' }
    out.price_lkr = Math.round(p)
  }
  for (const k of ['is_new', 'is_bestseller', 'active'] as const) {
    if (has(k)) out[k] = r[k] === true
  }
  if (has('sort')) out.sort = Math.max(-100000, Math.min(100000, Math.round(Number(r.sort) || 0)))
  return { ok: true, value: out }
}
