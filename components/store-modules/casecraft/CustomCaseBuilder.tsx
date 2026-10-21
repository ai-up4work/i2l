// components/store-modules/casecraft/CustomCaseBuilder.tsx
//
// Design-your-own: case type -> phone -> print style -> photo -> order.
// Ported from the Case Craft project. The order is saved to Case Craft's
// own orders (seller portal → Print jobs) instead of a WhatsApp message
// and a downloaded ZIP.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  AlertTriangle,
  BringToFront,
  ImagePlus,
  Grid3x3,
  Image as ImageIcon,
  Layers,
  Pencil,
  SlidersHorizontal,
  Type,
  LogIn,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  SendToBack,
  RotateCw,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  CASE_TYPES,
  getCaseType,
  getModel,
  getTemplate,
  cleanTemplateSrc,
  templateSrc,
  TEMPLATES,
  type CaseModel,
  type CaseTypeId,
  type TemplateId,
} from '@/lib/store-modules/casecraft/catalog'
import { formatRs, type DeliveryDetails, type PaymentMethod, type StorefrontData } from '@/lib/store-modules/casecraft/settings'
import CaseCheckout, { type PlacedOrder } from './CaseCheckout'
import { caseFontVariables } from './fonts'
import { RealPhotoPreview, useRealPhoto } from './realPreview'
import { forgetImage, listRecentImages, recentToFile, rememberImage, type RecentImage } from './recentImages'
import {
  coverScale,
  DEFAULT_PLACEMENT,
  DEFAULT_TEXT,
  MAX_STICKERS,
  MAX_ZOOM,
  MIN_ZOOM,
  PLACEMENT_BACKGROUNDS,
  placementBg,
  prepareOriginal,
  printArea,
  renderPrintFiles,
  STICKER_MAX_SIZE,
  STICKER_MIN_SIZE,
  TEXT_COLORS,
  TEXT_FONTS,
  TEXT_MAX_LENGTH,
  TEXT_MAX_SIZE,
  TEXT_MIN_SIZE,
  textFontFamily,
  uploadOrderFile,
  type CaseText,
  type Placement,
  type Sticker,
} from './compose'
import { btnPrimary, CasePreview, PhonePicker, StepCard, TRANSPARENT_CHECKER } from './parts'

type Step = 1 | 2 | 3 | 4 | 5
const STATE_KEY = 'casecraft:builder:v1'

export default function CustomCaseBuilder({ data }: { data: StorefrontData }) {
  const { user, loading, login } = useAuth()
  const types = useMemo(() => CASE_TYPES.filter((t) => data.models[t.id]?.length), [data.models])

  const [step, setStep] = useState<Step>(1)
  const [caseTypeId, setCaseTypeId] = useState<CaseTypeId | null>(types.length === 1 ? types[0].id : null)
  const [modelLabel, setModelLabel] = useState<string | null>(null)
  const [template, setTemplate] = useState<TemplateId>('full')
  const [file, setFile] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT)
  // Undo / redo for the design (size, position, turn, background, text).
  const [past, setPast] = useState<Placement[]>([])
  const [future, setFuture] = useState<Placement[]>([])
  // Clean case look by default; the factory print template on demand.
  const [showGuides, setShowGuides] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const stickerRef = useRef<HTMLInputElement>(null)
  // The layer the controls act on: 'photo', 'text' or a sticker id.
  const [selectedRaw, setSelected] = useState<string>('photo')
  // Preview: the case drawing (editable) or the design on a real photo.
  const [view, setView] = useState<'design' | 'real'>('design')
  const [tab, setTab] = useState<'photo' | 'layers' | 'text' | 'adjust'>('photo')
  // Main photo's pixel size, for the low-resolution warning.
  const [photoPx, setPhotoPx] = useState<{ src: string; w: number; h: number } | null>(null)
  // The photo the shopper chose to keep despite the warning.
  const [lowResOk, setLowResOk] = useState<string | null>(null)
  const [lowResNudge, setLowResNudge] = useState(false)
  // Images used before, kept in this browser (recentImages.ts).
  const [recent, setRecent] = useState<(RecentImage & { url: string })[]>([])
  const refreshRecent = () =>
    listRecentImages().then((list) =>
      setRecent((old) => {
        old.forEach((r) => URL.revokeObjectURL(r.url))
        return list.map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }))
      }),
    )
  useEffect(() => {
    refreshRecent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep choices across a sign-in round trip (the photo itself can't be kept).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STATE_KEY)
      if (raw) {
        const s = JSON.parse(raw) as { caseTypeId?: string; modelLabel?: string; template?: string; step?: number }
        const t = getCaseType(s.caseTypeId)
        if (t && data.models[t.id]) {
          setCaseTypeId(t.id)
          const m = getModel(t.id, s.modelLabel)
          if (m && data.models[t.id]?.includes(m.label)) {
            setModelLabel(m.label)
            setTemplate(getTemplate(s.template).id)
            setStep(s.step === 4 ? 4 : 3)
          } else setStep(2)
        }
      }
    } catch {
      /* ignore */
    }
    setRestored(true)
  }, [data.models])

  useEffect(() => {
    if (!restored) return
    try {
      window.sessionStorage.setItem(STATE_KEY, JSON.stringify({ caseTypeId, modelLabel, template, step: Math.min(step, 4) }))
    } catch {
      /* ignore */
    }
  }, [restored, caseTypeId, modelLabel, template, step])

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl)
  }, [photoUrl])

  const caseType = getCaseType(caseTypeId)
  const models: CaseModel[] = useMemo(
    () => (caseType ? caseType.models.filter((m) => data.models[caseType.id]?.includes(m.label)) : []),
    [caseType, data.models],
  )
  const model = models.find((m) => m.label === modelLabel) ?? null
  const prices = caseType ? data.prices[caseType.id] : undefined
  const unitPrice = model && prices ? prices[model.size] : null
  const fromPrice = prices ? Math.min(...Object.values(prices)) : null
  const overlay = model ? templateSrc(model) : null
  const clean = model ? cleanTemplateSrc(model) : null
  const real = useRealPhoto(model?.file)
  const showReal = view === 'real' && Boolean(real && clean && photoUrl)

  function chooseType(id: CaseTypeId) {
    if (id !== caseTypeId) setModelLabel(null)
    setCaseTypeId(id)
    setStep(2)
  }

  function choosePhoto(f: File | undefined | null) {
    if (!f || !f.type.startsWith('image/')) return
    rememberImage(f).then(refreshRecent)
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    setFile(f)
    const url = URL.createObjectURL(f)
    setPhotoUrl(url)
    setLowResNudge(false)
    const probe = new window.Image()
    probe.onload = () => setPhotoPx({ src: url, w: probe.naturalWidth, h: probe.naturalHeight })
    probe.src = url
    // A new main photo starts centred; added images and text stay.
    setPlacement((p) => ({ ...DEFAULT_PLACEMENT, bg: p.bg, stickers: p.stickers, text: p.text }))
    setSelected('photo')
  }

  /** Adds a small image (logo, cut-out) on top of the main photo. */
  function addSticker(f: File | undefined | null) {
    if (!f || !f.type.startsWith('image/') || (placement.stickers?.length ?? 0) >= MAX_STICKERS) return
    rememberImage(f).then(refreshRecent)
    const src = URL.createObjectURL(f)
    const img = new window.Image()
    img.onload = () => {
      const aspect = img.naturalWidth / Math.max(1, img.naturalHeight)
      const area = printArea(template)
      const areaAspect = (area.width * 9) / (area.height * 16)
      // About 45% of the case wide, but never taller than 45% of it.
      const size = Math.min(0.45, (0.45 * aspect) / areaAspect)
      const st: Sticker = {
        id: `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        src,
        name: f.name,
        aspect,
        x: 0.5,
        y: 0.5,
        size: Math.max(STICKER_MIN_SIZE, size),
        rotate: 0,
      }
      commit({ ...placement, stickers: [...(placement.stickers ?? []), st] })
      setSelected(st.id)
    }
    img.onerror = () => URL.revokeObjectURL(src)
    img.src = src
  }

  /** Saves the design as it is now, before a change (skips repeats). */
  function snapshot() {
    setPast((p) => (p.length && JSON.stringify(p[p.length - 1]) === JSON.stringify(placement) ? p : [...p.slice(-49), placement]))
    setFuture([])
  }
  /** A one-step change (button, swatch): saved for undo, then applied. */
  function commit(next: Placement) {
    snapshot()
    setPlacement(next)
  }
  function undo() {
    if (!past.length) return
    setFuture((f) => [placement, ...f])
    setPlacement(past[past.length - 1])
    setPast((p) => p.slice(0, -1))
  }
  function redo() {
    if (!future.length) return
    setPast((p) => [...p, placement])
    setPlacement(future[0])
    setFuture((f) => f.slice(1))
  }
  // The selected layer (falls back to the photo if it's gone).
  const stickers = placement.stickers ?? []
  const sticker = stickers.find((s) => s.id === selectedRaw) ?? null
  const selected = sticker ? sticker.id : selectedRaw === 'text' && placement.text?.value.trim() ? 'text' : 'photo'
  const patchSticker = (id: string, patch: Partial<Sticker>, p: Placement = placement): Placement => ({
    ...p,
    stickers: (p.stickers ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)),
  })
  const round3 = (v: number) => Math.round(v * 1000) / 1000
  const nudge = (dx: number, dy: number) => {
    const keep = (v: number) => Math.max(0, Math.min(1, round3(v)))
    if (sticker) return commit(patchSticker(sticker.id, { x: keep(sticker.x + dx), y: keep(sticker.y + dy) }))
    if (selected === 'text' && placement.text)
      return commit({ ...placement, text: { ...placement.text, x: keep(placement.text.x + dx), y: keep(placement.text.y + dy) } })
    const clamp = (v: number) => Math.max(-1.5, Math.min(1.5, round3(v)))
    commit({ ...placement, x: clamp(placement.x + dx), y: clamp(placement.y + dy) })
  }
  const centre = () => {
    if (sticker) return commit(patchSticker(sticker.id, { x: 0.5, y: 0.5 }))
    if (selected === 'text' && placement.text) return commit({ ...placement, text: { ...placement.text, x: 0.5 } })
    commit({ ...placement, x: 0, y: 0 })
  }
  const turn = (deg: number) => {
    const from = sticker ? sticker.rotate : (placement.rotate ?? 0)
    let r = (from + deg) % 360
    if (r > 180) r -= 360
    if (r <= -180) r += 360
    if (sticker) return commit(patchSticker(sticker.id, { rotate: r }))
    commit({ ...placement, rotate: r })
  }
  const currentTurn = sticker ? sticker.rotate : (placement.rotate ?? 0)
  /** The size control under the preview, for whichever layer is selected. */
  const sizeCtl = sticker
    ? {
        label: 'Image size',
        value: sticker.size,
        min: STICKER_MIN_SIZE,
        max: STICKER_MAX_SIZE,
        step: 0.05,
        shown: `${Math.round(sticker.size * 100)}%`,
        set: (v: number, p: Placement = placement) => patchSticker(sticker.id, { size: v }, p),
      }
    : selected === 'text' && placement.text
      ? {
          label: 'Text size',
          value: placement.text.size,
          min: TEXT_MIN_SIZE,
          max: TEXT_MAX_SIZE,
          step: 0.01,
          shown: 'Aa',
          set: (v: number, p: Placement = placement) => ({ ...p, text: { ...(p.text ?? DEFAULT_TEXT), size: v } }),
        }
      : {
          label: 'Zoom',
          value: placement.zoom,
          min: MIN_ZOOM,
          max: MAX_ZOOM,
          step: 0.1,
          shown: `${Math.round(placement.zoom * 100)}%`,
          set: (v: number, p: Placement = placement) => ({ ...p, zoom: v }),
        }
  const resetSelected = () => {
    if (sticker) return commit(patchSticker(sticker.id, { x: 0.5, y: 0.5, rotate: 0, size: Math.min(0.45, sticker.size) }))
    if (selected === 'text' && placement.text)
      return commit({ ...placement, text: { ...placement.text, x: DEFAULT_TEXT.x, y: DEFAULT_TEXT.y, size: DEFAULT_TEXT.size } })
    commit({ ...placement, zoom: 1, x: 0, y: 0, rotate: 0 })
  }
  const moveSticker = (dir: 1 | -1) => {
    if (!sticker) return
    const i = stickers.findIndex((s) => s.id === sticker.id)
    const j = i + dir
    if (j < 0 || j >= stickers.length) return
    const next = [...stickers]
    ;[next[i], next[j]] = [next[j], next[i]]
    commit({ ...placement, stickers: next })
  }
  const removeSticker = () => {
    if (!sticker) return
    commit({ ...placement, stickers: stickers.filter((s) => s.id !== sticker.id) })
    setSelected('photo')
  }
  const layerName = sticker ? 'image' : selected === 'text' ? 'text' : 'photo'

  // Print sharpness of the main photo: its own pixels vs the pixels it
  // covers in the print file (1440 px across the case ≈ 300 dpi). Below
  // half of that (~150 dpi) it starts to look soft.
  const quality = (() => {
    if (!photoUrl || !photoPx || photoPx.src !== photoUrl) return null
    const area = printArea(template)
    const areaAspect = (area.width * 9) / (area.height * 16)
    const r = photoPx.w / photoPx.h
    const widthFrac = r * coverScale(r, 1, 1, 1 / areaAspect, placement.zoom, placement.rotate ?? 0)
    return photoPx.w / (widthFrac * area.width * 1440)
  })()
  const lowRes = quality !== null && quality < 0.5
  const lowResPending = lowRes && lowResOk !== photoUrl
  /** Live text edits (typing, size slider): snapshot happens on focus / press. */
  const setText = (patch: Partial<CaseText>) => setPlacement((p) => ({ ...p, text: { ...(p.text ?? DEFAULT_TEXT), ...patch } }))

  async function place(delivery: DeliveryDetails, payment: PaymentMethod): Promise<PlacedOrder> {
    if (!caseType || !model || !file || !photoUrl || !overlay) throw new Error('Finish your design first.')
    try {
      setBusyLabel('Preparing your print…')
      const [{ print, preview }, original] = await Promise.all([renderPrintFiles({ photoUrl, placement, template, overlaySrc: overlay }), prepareOriginal(file)])
      setBusyLabel('Uploading your photo…')
      const [photoLink, printLink, previewLink] = await Promise.all([
        uploadOrderFile(original, 'photo'),
        uploadOrderFile(print, 'print'),
        uploadOrderFile(preview, 'preview'),
      ])
      setBusyLabel('Placing your order…')
      const res = await fetch('/api/casecraft/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeSlug: data.storeSlug,
          kind: 'custom',
          caseTypeId: caseType.id,
          model: model.label,
          template,
          quantity,
          delivery,
          payment,
          photoUrl: photoLink,
          printUrl: printLink,
          previewUrl: previewLink,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not place the order.')
      try {
        window.sessionStorage.removeItem(STATE_KEY)
      } catch {
        /* ignore */
      }
      return body as PlacedOrder
    } finally {
      setBusyLabel(null)
    }
  }

  if (!types.length) {
    return <p className="rounded-2xl bg-card p-8 text-center font-body text-sm text-ink/60 ring-1 ring-ink/10">Custom cases aren&rsquo;t available right now. Have a look at the ready-made designs.</p>
  }

  const zoomBy = (d: number) => commit(sizeCtl.set(Math.min(sizeCtl.max, Math.max(sizeCtl.min, Math.round((sizeCtl.value + d) * 1000) / 1000))))
  const toolBtn =
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-ink/12 bg-card px-3 font-body text-xs font-semibold text-ink/75 transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-35'
  const sectionLabel = 'mb-2 block font-body text-xs font-semibold text-ink/60'
  const iconBtn = 'grid h-8 w-8 flex-none place-items-center rounded-full text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-30'

  // ---- Pieces of the studio --------------------------------------------------

  const studio = step >= 4 && Boolean(model)
  const caseStage = (
    <div className="relative mx-auto w-full max-w-[230px] sm:max-w-[270px]">
      {lowRes && (
        <span className="absolute -right-3 top-3 z-30 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 font-body text-[10px] font-bold text-ink shadow">
          <AlertTriangle size={11} aria-hidden /> Low resolution
        </span>
      )}
      {showReal && real && clean && photoUrl ? (
        <RealPhotoPreview entry={real} photoUrl={photoUrl} placement={placement} template={template} />
      ) : (
        <CasePreview
          photoUrl={photoUrl}
          placement={placement}
          template={template}
          overlaySrc={overlay}
          maskSrc={clean?.mask}
          cameraSrc={clean?.camera}
          brand={model?.brand}
          size={model?.size}
          guides={showGuides}
          onPlacementChange={step === 4 ? setPlacement : undefined}
          onGestureStart={snapshot}
          selected={selected}
          onSelect={(id) => {
            setSelected(id)
            if (id === 'text') setTab('text')
            else if (id !== 'photo') setTab('layers')
          }}
          empty={
            <span className="font-body text-xs text-ink/45">
              {!caseType ? 'Pick a case to start' : !model ? 'Pick your phone' : 'Your photo goes here'}
            </span>
          }
        />
      )}
    </div>
  )

  const viewSwitch = real && clean && photoUrl && (
    <div className="flex gap-1 rounded-full bg-white/70 p-1 ring-1 ring-ink/10 backdrop-blur" role="radiogroup" aria-label="Preview">
      {(
        [
          ['design', 'Design'],
          ['real', 'Real look'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={view === id}
          onClick={() => setView(id)}
          className={`rounded-full px-3.5 py-1.5 font-body text-xs font-semibold transition-colors ${view === id ? 'bg-indigo text-parchment' : 'text-ink/60 hover:text-ink'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  // One toolbar under the case: history, size of the selected layer, reset, guides.
  const toolbar = photoUrl && (
    <div className="w-full max-w-[340px] rounded-2xl bg-card px-2 py-2 shadow-[0_8px_24px_-12px_rgba(8,39,79,0.25)] ring-1 ring-ink/10">
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo" className={iconBtn}>
          <Undo2 size={15} />
        </button>
        <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo" className={iconBtn}>
          <Redo2 size={15} />
        </button>
        <span className="mx-1 h-5 w-px flex-none bg-ink/10" aria-hidden />
        <button type="button" onClick={() => zoomBy(-sizeCtl.step)} disabled={sizeCtl.value <= sizeCtl.min} aria-label={`${sizeCtl.label}: smaller`} className={iconBtn}>
          <Minus size={15} />
        </button>
        <input
          type="range"
          min={sizeCtl.min}
          max={sizeCtl.max}
          step={0.005}
          value={sizeCtl.value}
          onPointerDown={snapshot}
          onKeyDown={snapshot}
          onChange={(e) => setPlacement((p) => sizeCtl.set(Number(e.target.value), p))}
          aria-label={sizeCtl.label}
          title={sizeCtl.label}
          className="min-w-0 flex-1 accent-[var(--color-teal)]"
        />
        <button type="button" onClick={() => zoomBy(sizeCtl.step)} disabled={sizeCtl.value >= sizeCtl.max} aria-label={`${sizeCtl.label}: bigger`} className={iconBtn}>
          <Plus size={15} />
        </button>
        <span className="mx-1 h-5 w-px flex-none bg-ink/10" aria-hidden />
        <button type="button" onClick={resetSelected} aria-label={`Reset the ${layerName}`} title={`Reset the ${layerName}`} className={iconBtn}>
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          onClick={() => setShowGuides((g) => !g)}
          aria-pressed={showGuides}
          aria-label="Show print guides"
          title="Print guides: the exact camera cut-out and safe area"
          disabled={showReal}
          className={`${iconBtn} ${showGuides ? 'bg-teal/12 text-teal-deep' : ''}`}
        >
          <Grid3x3 size={15} />
        </button>
      </div>
      <p className="mt-0.5 px-2 text-center font-body text-[11px] text-ink/50">
        {sizeCtl.label} · <span className="tabular-nums">{sizeCtl.shown}</span>
        {showReal ? ' · switch to Design to drag' : ' · drag on the case to move'}
      </p>
    </div>
  )

  const stage = (
    <div className="relative flex flex-col items-center gap-4 overflow-hidden rounded-[28px] bg-[radial-gradient(120%_80%_at_50%_30%,#ffffff_0%,#f6f2ea_55%,#ece6da_100%)] px-4 pb-5 pt-4 ring-1 ring-ink/8 sm:px-6">
      <div className="flex min-h-9 w-full items-center justify-center">{viewSwitch}</div>
      {caseStage}
      {toolbar}
    </div>
  )

  const recentStrip = recent.length > 0 && (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className={sectionLabel}>Recent photos</span>
        <span className="font-body text-[11px] text-ink/40">Saved on this device</span>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pt-1.5">
        {recent.map((r) => (
          <div key={r.id} className="group/recent relative h-[76px] w-[58px] flex-none">
            <button
              type="button"
              onClick={() => choosePhoto(recentToFile(r))}
              title={`Use ${r.name} as the main photo`}
              aria-label={`Use ${r.name} as the main photo`}
              className={`h-full w-full overflow-hidden rounded-xl ring-1 ring-ink/10 transition hover:ring-2 hover:ring-teal ${TRANSPARENT_CHECKER}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.url} alt="" className="h-full w-full object-cover" />
            </button>
            {photoUrl && stickers.length < MAX_STICKERS && (
              <button
                type="button"
                onClick={() => {
                  addSticker(recentToFile(r))
                  setTab('layers')
                }}
                title="Add on top as a layer"
                aria-label={`Add ${r.name} on top as a layer`}
                className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-indigo text-parchment shadow transition-colors hover:bg-indigo-deep"
              >
                <Plus size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={() => forgetImage(r.id).then(refreshRecent)}
              title="Remove from recent"
              aria-label={`Remove ${r.name} from recent photos`}
              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink/70 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover/recent:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )

  const lowResBox = lowResPending && (
    <div className={`rounded-2xl border p-4 transition-shadow ${lowResNudge ? 'border-gold ring-2 ring-gold/60' : 'border-gold/60'} bg-gold/10`} role="alert">
      <p className="flex items-start gap-2 font-body text-sm font-semibold text-ink">
        <AlertTriangle size={16} className="mt-0.5 flex-none text-gold-deep" aria-hidden />
        This photo may print blurry
      </p>
      <p className="mt-1 pl-6 font-body text-xs leading-relaxed text-ink/65">
        It&rsquo;s {photoPx?.w}×{photoPx?.h} px — small for the size it&rsquo;s shown on your case
        {quality !== null && quality < 0.33 ? ', so it will look noticeably soft' : ''}. A larger, original photo (not a screenshot or a WhatsApp copy)
        prints much sharper. Zooming out also helps.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 pl-6">
        <button type="button" onClick={() => fileRef.current?.click()} className={btnPrimary}>
          <ImagePlus size={15} aria-hidden /> Choose a sharper photo
        </button>
        <button
          type="button"
          onClick={() => {
            setLowResOk(photoUrl)
            setLowResNudge(false)
          }}
          className={toolBtn}
        >
          Use this photo anyway
        </button>
      </div>
    </div>
  )

  const photoPanel = (
    <div className="flex flex-col gap-5">
      {photoUrl ? (
        <div className="flex items-center gap-3 rounded-2xl bg-parchment/70 p-2.5 ring-1 ring-ink/8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" className="h-16 w-12 flex-none rounded-lg object-cover ring-1 ring-ink/10" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-body text-sm font-semibold text-ink">{file?.name ?? 'Your photo'}</p>
            <p className="font-body text-xs text-ink/50">
              {photoPx && photoPx.src === photoUrl ? `${photoPx.w} × ${photoPx.h} px` : 'Main photo'}
              {quality !== null && !lowRes && <span className="text-teal-deep"> · sharp enough to print</span>}
            </p>
          </div>
          <button type="button" onClick={() => fileRef.current?.click()} className={toolBtn}>
            Replace
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            choosePhoto(e.dataTransfer.files?.[0])
          }}
          className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ink/15 bg-parchment/40 px-4 py-10 text-center transition-colors hover:border-teal hover:bg-teal/5"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-teal/12 text-teal-deep">
            <ImagePlus size={22} aria-hidden />
          </span>
          <span className="font-display text-xl text-ink">Add your photo</span>
          <span className="font-body text-xs text-ink/50">Tap to choose, or drop it here. A clear, original photo prints best.</span>
        </button>
      )}
      {lowResBox}
      {recentStrip}
    </div>
  )

  const layersPanel = (
    <div className="flex flex-col gap-4">
      <input
        ref={stickerRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          addSticker(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Layer to edit">
        {[...(placement.text?.value.trim() ? ['text'] : []), ...stickers.map((s) => s.id).reverse(), 'photo'].map((id) => {
          const st = stickers.find((s) => s.id === id)
          const n = st ? stickers.indexOf(st) + 1 : 0
          return (
            <LayerRow
              key={id}
              on={selected === id}
              onClick={() => setSelected(id)}
              label={id === 'photo' ? 'Main photo' : id === 'text' ? `Text: “${placement.text?.value.trim()}”` : `Image ${n}`}
              hint={id === 'photo' ? 'At the back' : id === 'text' ? 'Always on top' : st?.name}
              thumb={id === 'photo' ? photoUrl : st?.src}
              checker={Boolean(st)}
            />
          )
        })}
      </div>
      {sticker && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => moveSticker(1)} disabled={stickers[stickers.length - 1]?.id === sticker.id} className={toolBtn}>
            <BringToFront size={14} aria-hidden /> Bring forward
          </button>
          <button type="button" onClick={() => moveSticker(-1)} disabled={stickers[0]?.id === sticker.id} className={toolBtn}>
            <SendToBack size={14} aria-hidden /> Send back
          </button>
          <button type="button" onClick={removeSticker} className={`${toolBtn} text-[#b42318] hover:text-[#b42318]`}>
            <Trash2 size={14} aria-hidden /> Remove
          </button>
        </div>
      )}
      {stickers.length < MAX_STICKERS ? (
        <button
          type="button"
          onClick={() => stickerRef.current?.click()}
          className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-ink/15 px-4 py-3.5 text-left transition-colors hover:border-teal hover:bg-teal/5"
        >
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-teal/12 text-teal-deep">
            <Plus size={17} aria-hidden />
          </span>
          <span>
            <span className="block font-body text-sm font-semibold text-ink">Add an image on top</span>
            <span className="block font-body text-xs text-ink/50">A logo or cut-out — a PNG with a see-through background works best.</span>
          </span>
        </button>
      ) : (
        <p className="font-body text-xs text-ink/50">That&rsquo;s the most images one case can hold ({MAX_STICKERS}).</p>
      )}
    </div>
  )

  const textPanel = (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        <input
          type="text"
          value={placement.text?.value ?? ''}
          maxLength={TEXT_MAX_LENGTH}
          onFocus={() => {
            snapshot()
            setSelected('text')
          }}
          onChange={(e) => setText({ value: e.target.value })}
          placeholder="Type a name or a short line"
          aria-label="Text on the case"
          className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-card px-3.5 py-2.5 font-body text-sm text-ink outline-none placeholder:text-ink/35 focus:border-teal focus:ring-2 focus:ring-teal/20"
        />
        {placement.text?.value && (
          <button type="button" onClick={() => commit({ ...placement, text: null })} aria-label="Remove text" title="Remove text" className={`${toolBtn} h-auto`}>
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div>
        <span className={sectionLabel}>Font</span>
        <div className="grid max-h-[17rem] grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3" role="radiogroup" aria-label="Font">
          {TEXT_FONTS.map((f) => {
            const on = (placement.text?.font ?? DEFAULT_TEXT.font) === f.id
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={f.label}
                onClick={() => commit({ ...placement, text: { ...(placement.text ?? DEFAULT_TEXT), font: f.id } })}
                className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl border px-2 pb-1.5 pt-2.5 transition-colors ${
                  on ? 'border-teal bg-teal/8 ring-1 ring-teal' : 'border-ink/10 bg-card hover:border-ink/30'
                }`}
              >
                <span
                  className="block w-full truncate text-center text-lg leading-tight text-ink"
                  style={{ fontFamily: textFontFamily(f.id), fontStyle: f.italic ? 'italic' : 'normal', fontWeight: f.weight }}
                >
                  {placement.text?.value.trim() || 'Your name'}
                </span>
                <span className="font-body text-[11px] text-ink/45">{f.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className={sectionLabel}>Colour</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Text colour">
            {TEXT_COLORS.map((c) => {
              const on = (placement.text?.color ?? DEFAULT_TEXT.color) === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => commit({ ...placement, text: { ...(placement.text ?? DEFAULT_TEXT), color: c.id } })}
                  className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-card transition-shadow ${on ? 'ring-2 ring-teal' : 'ring-1 ring-ink/15 hover:ring-ink/30'}`}
                  style={{ background: c.id }}
                />
              )
            })}
            {(() => {
              const current = placement.text?.color ?? DEFAULT_TEXT.color
              const custom = !TEXT_COLORS.some((c) => c.id === current)
              return (
                <label
                  title="Pick any colour"
                  className={`relative h-8 w-8 cursor-pointer overflow-hidden rounded-full ring-offset-2 ring-offset-card transition-shadow ${
                    custom ? 'ring-2 ring-teal' : 'ring-1 ring-ink/15 hover:ring-ink/30'
                  }`}
                  style={{ background: custom ? current : 'conic-gradient(#f43f5e, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #f43f5e)' }}
                >
                  <span className="sr-only">Pick any colour</span>
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(current) ? current : '#ffffff'}
                    onFocus={snapshot}
                    onChange={(e) => setText({ color: e.target.value })}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
              )
            })()}
          </div>
        </div>
        <div>
          <span className={sectionLabel}>Place it</span>
          <div className="flex gap-1.5">
            {(
              [
                ['Top', 0.15],
                ['Middle', 0.5],
                ['Bottom', 0.85],
              ] as const
            ).map(([label, y]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  commit({ ...placement, text: { ...(placement.text ?? DEFAULT_TEXT), x: 0.5, y } })
                  setSelected('text')
                }}
                className={`${toolBtn} flex-1`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-2">
        <span className="font-body text-sm text-ink/70">Soft shadow behind the letters</span>
        <span className="relative inline-flex">
          <input
            type="checkbox"
            checked={placement.text?.shadow ?? DEFAULT_TEXT.shadow}
            onChange={(e) => commit({ ...placement, text: { ...(placement.text ?? DEFAULT_TEXT), shadow: e.target.checked } })}
            className="peer sr-only"
          />
          <span className="h-5 w-9 rounded-full bg-ink/15 transition-colors peer-checked:bg-teal peer-focus-visible:ring-2 peer-focus-visible:ring-teal/40" />
          <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
        </span>
      </label>
      <p className="-mt-2 font-body text-xs text-ink/45">Resize the text with the slider under the case, and drag it into place.</p>
    </div>
  )

  const padBtn = 'grid h-10 w-10 place-items-center rounded-xl border border-ink/12 bg-card text-ink/70 transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-35'
  const adjustPanel = (
    <div className="flex flex-col gap-6">
      <p className="rounded-xl bg-parchment/70 px-3 py-2 font-body text-xs text-ink/60 ring-1 ring-ink/8">
        Adjusting the <span className="font-semibold text-ink">{sticker ? `image ${stickers.indexOf(sticker) + 1}` : selected === 'text' ? 'text' : 'main photo'}</span>. Tap
        something on the case to adjust it instead.
      </p>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-5 sm:gap-8">
        <div>
          <span className={sectionLabel}>Move</span>
          <div className="grid w-max grid-cols-3 gap-1.5">
            <span />
            <button type="button" onClick={() => nudge(0, -0.02)} aria-label="Move up" className={padBtn}>
              <ArrowUp size={16} />
            </button>
            <span />
            <button type="button" onClick={() => nudge(-0.02, 0)} aria-label="Move left" className={padBtn}>
              <ArrowLeft size={16} />
            </button>
            <button type="button" onClick={centre} aria-label="Centre" title="Centre" className={padBtn}>
              <span className="h-2 w-2 rounded-full bg-current" />
            </button>
            <button type="button" onClick={() => nudge(0.02, 0)} aria-label="Move right" className={padBtn}>
              <ArrowRight size={16} />
            </button>
            <span />
            <button type="button" onClick={() => nudge(0, 0.02)} aria-label="Move down" className={padBtn}>
              <ArrowDown size={16} />
            </button>
            <span />
          </div>
        </div>
        <div>
          <span className={sectionLabel}>
            Rotate <span className="font-normal tabular-nums text-ink/45">{selected === 'text' ? '' : `${currentTurn}°`}</span>
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => turn(-90)} disabled={selected === 'text'} aria-label="Turn left 90°" title="Turn left 90°" className={toolBtn}>
              <RotateCcw size={14} /> 90°
            </button>
            <button type="button" onClick={() => turn(90)} disabled={selected === 'text'} aria-label="Turn right 90°" title="Turn right 90°" className={toolBtn}>
              <RotateCw size={14} /> 90°
            </button>
            <button type="button" onClick={() => turn(-15)} disabled={selected === 'text'} aria-label="Turn left 15°" title="Turn left 15°" className={toolBtn}>
              <RotateCcw size={14} /> 15°
            </button>
            <button type="button" onClick={() => turn(15)} disabled={selected === 'text'} aria-label="Turn right 15°" title="Turn right 15°" className={toolBtn}>
              <RotateCw size={14} /> 15°
            </button>
          </div>
          {selected === 'text' && <p className="mt-1.5 font-body text-[11px] text-ink/45">Text stays level.</p>}
        </div>
      </div>
      <div>
        <span className={sectionLabel}>Where the photo doesn&rsquo;t reach</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Background behind the photo">
          {PLACEMENT_BACKGROUNDS.map((b) => {
            const on = placementBg(placement) === b.id
            return (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => commit({ ...placement, bg: b.id })}
                className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 font-body text-xs font-semibold transition-colors ${
                  on ? 'bg-teal/10 text-ink ring-2 ring-teal' : 'text-ink/65 ring-1 ring-ink/12 hover:ring-ink/30'
                }`}
              >
                <span
                  className={`relative h-6 w-6 overflow-hidden rounded-full ring-1 ring-ink/10 ${
                    b.id === 'black' ? 'bg-black' : b.id === 'transparent' ? TRANSPARENT_CHECKER : 'bg-white'
                  }`}
                >
                  {b.id === 'blur' && photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="" className="h-full w-full scale-150 object-cover blur-[3px]" />
                  )}
                </span>
                {b.id === 'transparent' ? 'Leave unprinted' : b.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  const TABS = [
    { id: 'photo', label: 'Photo', icon: ImageIcon },
    { id: 'layers', label: 'Layers', icon: Layers },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
  ] as const

  const signInGate = (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-ink/15 px-5 py-10 text-center">
      <p className="font-display text-xl text-ink">Sign in to add your photo</p>
      <p className="max-w-xs font-body text-sm text-ink/60">So your photo stays with your order. Your case and phone choices are kept.</p>
      <button type="button" onClick={login} className={btnPrimary}>
        <LogIn size={15} aria-hidden /> Sign in
      </button>
    </div>
  )

  const tools = (
    <div className="flex min-w-0 flex-col">
      <div className="mb-1 flex items-end justify-between gap-3">
        <h2 className="font-display text-2xl leading-tight text-ink sm:text-[1.7rem]">Design your case</h2>
        {model && unitPrice != null && <span className="font-display text-xl text-ink">{formatRs(unitPrice)}</span>}
      </div>
      <p className="mb-4 font-body text-sm text-ink/55">
        {caseType?.label} for {model?.label} · {getTemplate(template).label.toLowerCase()}
      </p>

      {!user && !loading ? (
        signInGate
      ) : (
        <>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => choosePhoto(e.target.files?.[0])} />
          {photoUrl && (
            <div className="mb-5 grid grid-cols-4 gap-1 rounded-2xl bg-parchment p-1 ring-1 ring-ink/8" role="tablist" aria-label="Design tools">
              {TABS.map((t) => {
                const on = tab === t.id
                const Icon = t.icon
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTab(t.id)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 font-body text-xs font-semibold transition-colors sm:flex-row sm:justify-center sm:gap-1.5 ${
                      on ? 'bg-card text-ink shadow-sm ring-1 ring-ink/8' : 'text-ink/55 hover:text-ink'
                    }`}
                  >
                    <Icon size={15} aria-hidden className={on ? 'text-teal-deep' : ''} />
                    {t.label}
                    {t.id === 'layers' && stickers.length > 0 && (
                      <span className="rounded-full bg-teal/15 px-1.5 text-[10px] tabular-nums text-teal-deep">{stickers.length}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex-1" role="tabpanel">
            {!photoUrl || tab === 'photo' ? photoPanel : tab === 'layers' ? layersPanel : tab === 'text' ? textPanel : adjustPanel}
          </div>
          {photoUrl && (
            <div className="mt-6 border-t border-ink/10 pt-4">
              <button
                type="button"
                onClick={() => {
                  if (lowResPending) {
                    setTab('photo')
                    setLowResNudge(true)
                    return
                  }
                  setStep(5)
                }}
                className={`${btnPrimary} w-full py-3.5 text-[15px]`}
              >
                Continue to delivery
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )

  // Steps 1–3, once done: a slim bar of choices, each one tappable to change.
  const setupBar = studio && caseType && model && (
    <div className="-mx-1 flex items-center gap-1 overflow-x-auto rounded-2xl bg-card p-1.5 ring-1 ring-ink/10 sm:mx-0 sm:gap-2 sm:p-2">
      {(
        [
          ['Case', caseType.label, 1],
          ['Phone', model.label, 2],
          ['Print', getTemplate(template).label, 3],
        ] as const
      ).map(([k, v, n]) => (
        <button
          key={k}
          type="button"
          onClick={() => setStep(n as Step)}
          className="group/pill inline-flex flex-none items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-left transition-colors hover:bg-parchment"
        >
          <span className="font-body text-xs text-ink/45">{k}</span>
          <span className="font-body text-sm font-semibold text-ink">{v}</span>
          <Pencil size={12} className="flex-none text-ink/30 transition-colors group-hover/pill:text-teal-deep" aria-hidden />
        </button>
      ))}
    </div>
  )

  // ---- Layout ------------------------------------------------------------------

  if (studio) {
    return (
      <div data-casecraft-fonts className={`flex flex-col gap-4 ${caseFontVariables}`}>
        {setupBar}
        {step === 4 ? (
          <section className="grid grid-cols-1 gap-6 rounded-[32px] bg-card p-3 ring-1 ring-ink/10 sm:p-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-8 lg:p-5">
            <div className="lg:sticky lg:top-24 lg:self-start">{stage}</div>
            <div className="px-1 pb-2 sm:px-2 lg:py-3 lg:pr-3">{tools}</div>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-6 rounded-[32px] bg-card p-4 ring-1 ring-ink/10 sm:p-5 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
            <div className="flex flex-col items-center gap-3">
              <div className="w-full max-w-[180px]">
                <CasePreview
                  photoUrl={photoUrl}
                  placement={placement}
                  template={template}
                  overlaySrc={overlay}
                  maskSrc={clean?.mask}
                  cameraSrc={clean?.camera}
                  brand={model?.brand}
                  size={model?.size}
                  guides={false}
                />
              </div>
              <button type="button" onClick={() => setStep(4)} className={toolBtn}>
                <Pencil size={13} aria-hidden /> Edit design
              </button>
            </div>
            <div className="min-w-0">
              <h2 className="mb-4 font-display text-2xl text-ink">Delivery &amp; payment</h2>
              {model && unitPrice != null && caseType && (
                <CaseCheckout
                  data={data}
                  quantity={quantity}
                  onQuantity={setQuantity}
                  busyLabel={busyLabel}
                  item={{
                    title: `Custom ${caseType.label}`,
                    detail: `${model.label} · ${getTemplate(template).label}`,
                    unitPrice,
                    thumb: photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl} alt="" className="h-14 w-10 flex-none rounded-lg object-cover ring-1 ring-ink/10" />
                    ) : undefined,
                  }}
                  onPlace={place}
                />
              )}
            </div>
          </section>
        )}
      </div>
    )
  }

  // Steps 1–3: the choices on the left, the case taking shape on the right.
  return (
    <div data-casecraft-fonts className={`grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10 ${caseFontVariables}`}>
      <div className={`lg:sticky lg:top-24 lg:order-last ${model ? '' : 'hidden lg:block'}`}>
        <div className="flex flex-col items-center gap-3 rounded-[28px] bg-[radial-gradient(120%_80%_at_50%_30%,#ffffff_0%,#f6f2ea_55%,#ece6da_100%)] p-5 ring-1 ring-ink/8">
          {caseStage}
          {model && unitPrice != null && (
            <p className="text-center font-body text-sm text-ink/60">
              {model.label} · <span className="font-display text-base text-ink">{formatRs(unitPrice)}</span>
            </p>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <StepCard
          n={1}
          title="Choose your case"
          summary={caseType ? `${caseType.label} · ${caseType.series}` : fromPrice ? `From ${formatRs(fromPrice)}` : undefined}
          open={step === 1}
          done={Boolean(caseType)}
          onOpen={() => setStep(1)}
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {types.map((t) => {
              const on = t.id === caseTypeId
              const p = data.prices[t.id]
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => chooseType(t.id)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${on ? 'border-teal bg-teal/8 ring-1 ring-teal' : 'border-ink/10 hover:border-ink/25'}`}
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck size={16} className={on ? 'text-teal-deep' : 'text-ink/40'} aria-hidden />
                    <span className="font-body text-sm font-semibold text-ink">{t.label}</span>
                    <span className="rounded-full bg-ink/6 px-2 py-0.5 font-body text-[10px] font-semibold text-ink/55">{t.series}</span>
                  </span>
                  <span className="mt-1.5 block font-body text-xs text-ink/60">{t.description}</span>
                  {p && <span className="mt-2 block font-body text-xs font-semibold text-ink">From {formatRs(Math.min(...Object.values(p)))}</span>}
                </button>
              )
            })}
          </div>
        </StepCard>

        <StepCard n={2} title="Select your phone" summary={model?.label} open={step === 2} done={Boolean(model)} disabled={!caseType} onOpen={() => setStep(2)}>
          <PhonePicker
            key={caseTypeId ?? 'none'}
            models={models}
            selected={modelLabel}
            prices={prices}
            onSelect={(m) => {
              setModelLabel(m.label)
              setStep(3)
            }}
          />
        </StepCard>

        <StepCard n={3} title="Print style" summary={photoUrl ? getTemplate(template).label : undefined} open={step === 3} done={Boolean(photoUrl)} disabled={!model} onOpen={() => setStep(3)}>
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES.map((t) => {
              const on = t.id === template
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTemplate(t.id)
                    setStep(4)
                  }}
                  className={`rounded-xl border p-3 text-left transition-colors ${on ? 'border-teal bg-teal/8 ring-1 ring-teal' : 'border-ink/10 hover:border-ink/25'}`}
                >
                  <TemplateIcon id={t.id} />
                  <span className="mt-2 block font-body text-[13px] font-semibold text-ink">{t.label}</span>
                  <span className="block font-body text-[11px] leading-snug text-ink/55">{t.desc}</span>
                </button>
              )
            })}
          </div>
        </StepCard>

        {photoUrl && model && (
          <button type="button" onClick={() => setStep(4)} className={`${btnPrimary} self-start`}>
            Back to your design
          </button>
        )}
      </div>
    </div>
  )
}

function LayerRow({
  on,
  onClick,
  label,
  hint,
  thumb,
  checker,
}: {
  on: boolean
  onClick: () => void
  label: string
  hint?: string
  thumb?: string | null
  checker?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl p-2 pr-3 text-left transition-colors ${
        on ? 'bg-teal/8 ring-2 ring-teal' : 'ring-1 ring-ink/10 hover:ring-ink/25'
      }`}
    >
      {thumb ? (
        <span className={`h-11 w-11 flex-none overflow-hidden rounded-xl ring-1 ring-ink/10 ${checker ? TRANSPARENT_CHECKER : 'bg-ink/5'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt="" className={`h-full w-full ${checker ? 'object-contain' : 'object-cover'}`} />
        </span>
      ) : (
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-parchment font-display text-lg italic text-ink/70 ring-1 ring-ink/10">Aa</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-body text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="block truncate font-body text-xs text-ink/45">{hint}</span>}
      </span>
    </button>
  )
}

function TemplateIcon({ id }: { id: TemplateId }) {
  return (
    <span className="relative block h-12 w-7 overflow-hidden rounded-md bg-white ring-1 ring-ink/20">
      {id === 'full' && <span className="absolute inset-0 bg-gradient-to-br from-teal to-indigo" />}
      {id === 'centered' && <span className="absolute inset-[18%] rounded-sm bg-gradient-to-br from-teal to-indigo" />}
      {id === 'top' && <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-br from-teal to-indigo" />}
    </span>
  )
}
