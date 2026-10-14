// components/store-modules/casecraft/seller/Designs.tsx
//
// Case Craft seller portal → Ready-made designs. Add a design with a
// photo, name, case type, price and the phones it's made for. Shoppers
// see it on the Ready-made tab.
'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { imageThumb } from '@/lib/media'
import { uploadMedia } from '@/lib/upload/useMediaUpload'
import { CASE_TYPES, getCaseType, type CaseTypeId } from '@/lib/store-modules/casecraft/catalog'
import { formatRs, type DesignRow } from '@/lib/store-modules/casecraft/settings'
import ModelChecklist from './ModelChecklist'
import { field, label, Notice, Panel, SellerPageTitle, Toggle } from './ui'

type Draft = {
  id?: string
  name: string
  subtitle: string
  image_url: string
  case_type: CaseTypeId
  allModels: boolean
  models: Set<string>
  price_lkr: string
  is_new: boolean
  is_bestseller: boolean
  active: boolean
}

const EMPTY: Draft = {
  name: '',
  subtitle: '',
  image_url: '',
  case_type: 'tough-cases',
  allModels: true,
  models: new Set(),
  price_lkr: '1500',
  is_new: true,
  is_bestseller: false,
  active: true,
}

function toDraft(d: DesignRow): Draft {
  const t = getCaseType(d.case_type)
  return {
    id: d.id,
    name: d.name,
    subtitle: d.subtitle ?? '',
    image_url: d.image_url,
    case_type: (t?.id ?? 'tough-cases') as CaseTypeId,
    allModels: !d.models?.length,
    models: new Set(d.models ?? []),
    price_lkr: String(Math.round(Number(d.price_lkr))),
    is_new: Boolean(d.is_new),
    is_bestseller: Boolean(d.is_bestseller),
    active: d.active,
  }
}

export default function Designs() {
  const [designs, setDesigns] = useState<DesignRow[] | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/seller/casecraft/designs')
    const body = await res.json().catch(() => ({}))
    setDesigns((body.designs ?? []) as DesignRow[])
    setNeedsMigration(Boolean(body.needsMigration))
  }

  useEffect(() => {
    load()
  }, [])

  async function quick(d: DesignRow, patch: Record<string, unknown>) {
    setError(null)
    const res = await fetch(`/api/seller/casecraft/designs/${d.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return setError(body.error ?? 'Could not save.')
    setDesigns((cur) => cur?.map((x) => (x.id === d.id ? (body.design as DesignRow) : x)) ?? cur)
  }

  async function remove(d: DesignRow) {
    if (!window.confirm(`Delete "${d.name}"? Shoppers won't see it any more. Past orders keep its name.`)) return
    const res = await fetch(`/api/seller/casecraft/designs/${d.id}`, { method: 'DELETE' })
    if (res.ok) setDesigns((cur) => cur?.filter((x) => x.id !== d.id) ?? cur)
    else setError('Could not delete it.')
  }

  return (
    <div className="flex flex-col gap-5">
      <SellerPageTitle
        title="Ready-made designs"
        body="Your printed designs. Shoppers pick one, choose their phone and order."
        actions={
          <button type="button" onClick={() => setEditing({ ...EMPTY, models: new Set() })} className="inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 font-body text-sm font-semibold text-indigo">
            <Plus size={15} aria-hidden /> Add design
          </button>
        }
      />
      {needsMigration && <Notice>The database needs an update first: ask Wishdrop to run data/wishdrop-casecraft.sql.</Notice>}
      {error && <Notice tone="red">{error}</Notice>}

      {designs === null ? (
        <p className="flex items-center justify-center gap-2 py-16 font-body text-sm text-ink/50">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : designs.length === 0 ? (
        <div className="rounded-2xl bg-card px-6 py-14 text-center ring-1 ring-ink/10">
          <ImagePlus size={26} className="mx-auto text-ink/25" aria-hidden />
          <p className="mt-3 font-body text-sm text-ink/60">No designs yet. Add your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {designs.map((d) => {
            const t = getCaseType(d.case_type)
            return (
              <div key={d.id} className={`overflow-hidden rounded-2xl bg-card ring-1 ring-ink/10 ${d.active ? '' : 'opacity-60'}`}>
                <div className="relative aspect-[3/4] bg-parchment">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageThumb(d.image_url, 400)} alt={d.name} className="h-full w-full object-cover" />
                  {!d.active && <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 font-body text-[10px] font-bold text-white">Hidden</span>}
                </div>
                <div className="p-3">
                  <p className="truncate font-body text-sm font-semibold text-ink">{d.name}</p>
                  <p className="truncate font-body text-xs text-ink/55">
                    {t?.label} · {d.models?.length ? `${d.models.length} phones` : 'All phones'}
                  </p>
                  <p className="mt-0.5 font-body text-sm font-semibold text-ink">{formatRs(Number(d.price_lkr))}</p>
                  <div className="mt-2 flex gap-1">
                    <button type="button" onClick={() => setEditing(toDraft(d))} aria-label="Edit" className="grid h-8 w-8 place-items-center rounded-full text-ink/60 ring-1 ring-ink/10 hover:text-ink">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => quick(d, { active: !d.active })} aria-label={d.active ? 'Hide' : 'Show'} className="grid h-8 w-8 place-items-center rounded-full text-ink/60 ring-1 ring-ink/10 hover:text-ink">
                      {d.active ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button type="button" onClick={() => remove(d)} aria-label="Delete" className="grid h-8 w-8 place-items-center rounded-full text-red-600 ring-1 ring-ink/10 hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <DesignEditor
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={(row) => {
            setDesigns((cur) => {
              const list = cur ?? []
              return list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [row, ...list]
            })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function DesignEditor({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: (row: DesignRow) => void }) {
  const [d, setD] = useState<Draft>(draft)
  const [uploading, setUploading] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const caseType = getCaseType(d.case_type)!

  async function upload(file: File | undefined) {
    if (!file) return
    setError(null)
    setUploading(0)
    try {
      const url = await uploadMedia(file, 'image', { onProgress: setUploading })
      setD((cur) => ({ ...cur, image_url: url }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploading(null)
    }
  }

  async function save() {
    setBusy(true)
    setError(null)
    const payload = {
      name: d.name,
      subtitle: d.subtitle,
      image_url: d.image_url,
      case_type: d.case_type,
      models: d.allModels ? [] : [...d.models],
      price_lkr: Number(d.price_lkr),
      is_new: d.is_new,
      is_bestseller: d.is_bestseller,
      active: d.active,
    }
    if (!d.allModels && d.models.size === 0) {
      setBusy(false)
      return setError('Pick at least one phone, or choose "All phones".')
    }
    const res = await fetch(d.id ? `/api/seller/casecraft/designs/${d.id}` : '/api/seller/casecraft/designs', {
      method: d.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(body.error ?? 'Could not save.')
    onSaved(body.design as DesignRow)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 sm:items-center sm:p-6" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-parchment shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-parchment/95 px-5 py-3 backdrop-blur">
          <p className="font-display text-lg font-semibold text-ink">{d.id ? 'Edit design' : 'Add a design'}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-ink/60 hover:bg-ink/5">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative grid aspect-[3/4] w-28 flex-none place-items-center overflow-hidden rounded-2xl bg-card ring-1 ring-ink/15 sm:w-36"
            >
              {d.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageThumb(d.image_url, 300)} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 px-2 text-center font-body text-xs text-ink/55">
                  <ImagePlus size={20} className="text-teal-deep" aria-hidden /> Add photo
                </span>
              )}
              {uploading !== null && (
                <span className="absolute inset-0 grid place-items-center bg-black/45 font-body text-xs font-semibold text-white">{uploading}%</span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div>
                <span className={label}>Name</span>
                <input className={field} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Sigiriya Sunset" />
              </div>
              <div>
                <span className={label}>Short description (optional)</span>
                <input className={field} value={d.subtitle} onChange={(e) => setD({ ...d, subtitle: e.target.value })} placeholder="e.g. Floral · Pastel" />
              </div>
              <div>
                <span className={label}>Your price (Rs)</span>
                <input className={field} inputMode="numeric" value={d.price_lkr} onChange={(e) => setD({ ...d, price_lkr: e.target.value.replace(/[^\d]/g, '') })} />
              </div>
            </div>
          </div>

          <Panel title="Case" body="Which case it's printed on.">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CASE_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setD({ ...d, case_type: t.id, models: new Set(), allModels: true })}
                  className={`rounded-xl border px-3 py-2.5 text-left font-body text-sm ${d.case_type === t.id ? 'border-teal bg-teal/8 ring-1 ring-teal' : 'border-ink/12'}`}
                >
                  <span className="font-semibold text-ink">{t.label}</span> <span className="text-xs text-ink/55">{t.series}</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Phones" body="The phones this design is available for.">
            <div className="mb-3 flex gap-2">
              {[true, false].map((all) => (
                <button
                  key={String(all)}
                  type="button"
                  onClick={() => setD({ ...d, allModels: all })}
                  className={`rounded-full px-3.5 py-1.5 font-body text-xs font-semibold ${d.allModels === all ? 'bg-indigo text-parchment' : 'bg-parchment text-ink/65 ring-1 ring-ink/10'}`}
                >
                  {all ? 'All phones' : 'Pick phones'}
                </button>
              ))}
            </div>
            {!d.allModels && <ModelChecklist models={caseType.models} checked={d.models} onChange={(models) => setD({ ...d, models })} />}
          </Panel>

          <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-ink/10">
            {(
              [
                ['active', 'Show on the store'],
                ['is_new', 'Mark as new'],
                ['is_bestseller', 'Mark as bestseller'],
              ] as const
            ).map(([k, text]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <span className="font-body text-sm text-ink">{text}</span>
                <Toggle checked={d[k]} onChange={(v) => setD({ ...d, [k]: v })} label={text} />
              </div>
            ))}
          </div>

          {error && <Notice tone="red">{error}</Notice>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-full border border-ink/15 px-4 py-2 font-body text-sm font-semibold text-ink">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || uploading !== null || !d.name.trim() || !d.image_url || !Number(d.price_lkr)}
              className="rounded-full bg-indigo px-5 py-2 font-body text-sm font-semibold text-parchment disabled:opacity-40"
            >
              {busy ? 'Saving…' : d.id ? 'Save changes' : 'Add design'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
