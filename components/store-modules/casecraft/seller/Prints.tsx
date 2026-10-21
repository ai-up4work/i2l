// components/store-modules/casecraft/seller/Prints.tsx
//
// Case Craft seller portal → Printed cases. Photos of real, finished cases
// (ready to ship, or sent in by happy customers — with their permission).
// Shoppers see them under "Fresh from the printer" on the shop page, and
// can like them.
'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Heart, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { imageThumb } from '@/lib/media'
import { uploadMedia } from '@/lib/upload/useMediaUpload'
import type { PrintRow } from '@/lib/store-modules/casecraft/settings'
import { field, label, Notice, Panel, SellerPageTitle } from './ui'

type Row = PrintRow & { likes?: number }

export default function Prints() {
  const [prints, setPrints] = useState<Row[] | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<number | null>(null)
  const [caption, setCaption] = useState('')
  const [model, setModel] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/seller/casecraft/prints')
      .then((r) => r.json())
      .then((b) => {
        setPrints((b.prints ?? []) as Row[])
        setNeedsMigration(Boolean(b.needsMigration))
      })
      .catch(() => setPrints([]))
  }, [])

  async function add(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    for (const file of Array.from(files)) {
      setUploading(0)
      try {
        const url = await uploadMedia(file, 'image', { onProgress: setUploading })
        const res = await fetch('/api/seller/casecraft/prints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: url, caption, model_label: model }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Could not save the photo.')
        setPrints((cur) => [{ ...(body.print as Row), likes: 0 }, ...(cur ?? [])])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.')
        break
      } finally {
        setUploading(null)
      }
    }
    setCaption('')
    setModel('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function patch(p: Row, change: Partial<PrintRow>) {
    setError(null)
    const res = await fetch(`/api/seller/casecraft/prints/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return setError(body.error ?? 'Could not save.')
    setPrints((cur) => cur?.map((x) => (x.id === p.id ? { ...(body.print as Row), likes: x.likes } : x)) ?? cur)
  }

  async function remove(p: Row) {
    if (!window.confirm('Delete this photo? Its likes go with it.')) return
    const res = await fetch(`/api/seller/casecraft/prints/${p.id}`, { method: 'DELETE' })
    if (res.ok) setPrints((cur) => cur?.filter((x) => x.id !== p.id) ?? cur)
    else setError('Could not delete it.')
  }

  return (
    <div className="flex flex-col gap-5">
      <SellerPageTitle
        title="Printed cases"
        body="Photos of real cases you've printed. Shoppers see them under “Fresh from the printer” on your shop and can like them — real results sell custom cases."
      />
      {needsMigration && <Notice>The database needs an update first: ask Wishdrop to run data/wishdrop-casecraft-prints-likes.sql.</Notice>}
      {error && <Notice tone="red">{error}</Notice>}

      <Panel title="Add photos" body="Bright, sharp photos of the case on its own or in a hand work best. Only post a customer's photo with their permission.">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <div>
            <span className={label}>Caption (optional)</span>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={140} placeholder="e.g. Anniversary gift for Dilini" className={field} />
          </div>
          <div>
            <span className={label}>Phone (optional)</span>
            <input value={model} onChange={(e) => setModel(e.target.value)} maxLength={60} placeholder="e.g. iPhone 15 Pro" className={field} />
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading !== null}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gold px-4 py-2.5 font-body text-sm font-semibold text-indigo disabled:opacity-60"
            >
              {uploading !== null ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ImagePlus size={15} aria-hidden />}
              {uploading !== null ? `Uploading ${Math.round(uploading)}%` : 'Upload photos'}
            </button>
          </div>
        </div>
      </Panel>

      {prints === null ? (
        <p className="flex items-center justify-center gap-2 py-16 font-body text-sm text-ink/50">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : prints.length === 0 ? (
        <div className="rounded-2xl bg-card px-6 py-14 text-center ring-1 ring-ink/10">
          <ImagePlus size={26} className="mx-auto text-ink/25" aria-hidden />
          <p className="mt-3 font-body text-sm text-ink/60">No photos yet. The section stays hidden on your shop until you add some.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {prints.map((p) => (
            <div key={p.id} className={`overflow-hidden rounded-2xl bg-card ring-1 ring-ink/10 ${p.active ? '' : 'opacity-60'}`}>
              <div className="relative aspect-[4/5] bg-parchment">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageThumb(p.image_url, 400)} alt={p.caption ?? 'Printed case'} className="h-full w-full object-cover" />
                {!p.active && <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 font-body text-[10px] font-bold text-white">Hidden</span>}
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 font-body text-[11px] font-semibold text-ink">
                  <Heart size={11} aria-hidden /> {p.likes ?? 0}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 p-3">
                <input
                  defaultValue={p.caption ?? ''}
                  onBlur={(e) => e.target.value !== (p.caption ?? '') && patch(p, { caption: e.target.value })}
                  placeholder="Caption"
                  maxLength={140}
                  aria-label="Caption"
                  className={`${field} py-1.5 text-xs`}
                />
                <input
                  defaultValue={p.model_label ?? ''}
                  onBlur={(e) => e.target.value !== (p.model_label ?? '') && patch(p, { model_label: e.target.value })}
                  placeholder="Phone"
                  maxLength={60}
                  aria-label="Phone"
                  className={`${field} py-1.5 text-xs`}
                />
                <div className="mt-1 flex gap-1">
                  <button type="button" onClick={() => patch(p, { active: !p.active })} aria-label={p.active ? 'Hide' : 'Show'} className="grid h-8 w-8 place-items-center rounded-full text-ink/60 ring-1 ring-ink/10 hover:text-ink">
                    {p.active ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button type="button" onClick={() => remove(p)} aria-label="Delete" className="grid h-8 w-8 place-items-center rounded-full text-red-600 ring-1 ring-ink/10 hover:bg-red-50">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
