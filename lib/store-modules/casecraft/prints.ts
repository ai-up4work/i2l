// lib/store-modules/casecraft/prints.ts
// Checks a "printed case" photo from the seller portal before saving it.

export type PrintInput = { image_url: string; caption: string | null; model_label: string | null; design_id: string | null; active: boolean; sort: number }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parsePrint(raw: unknown, partial = false): { ok: true; value: Partial<PrintInput> } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Nothing to save.' }
  const r = raw as Record<string, unknown>
  const v: Partial<PrintInput> = {}
  if ('image_url' in r || !partial) {
    const url = typeof r.image_url === 'string' ? r.image_url.trim() : ''
    if (!/^https:\/\//i.test(url)) return { ok: false, error: 'Add a photo first.' }
    v.image_url = url.slice(0, 1000)
  }
  if ('caption' in r) v.caption = typeof r.caption === 'string' && r.caption.trim() ? r.caption.trim().slice(0, 140) : null
  if ('model_label' in r) v.model_label = typeof r.model_label === 'string' && r.model_label.trim() ? r.model_label.trim().slice(0, 60) : null
  if ('design_id' in r) v.design_id = typeof r.design_id === 'string' && UUID_RE.test(r.design_id) ? r.design_id : null
  if ('active' in r) v.active = r.active !== false
  if ('sort' in r) v.sort = Number.isFinite(Number(r.sort)) ? Math.round(Number(r.sort)) : 0
  return { ok: true, value: v }
}
