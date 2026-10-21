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
  Layers,
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
  const real = useRealPhoto(model?.label)
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
  const sectionLabel = 'mb-2 block font-body text-[11px] font-semibold uppercase tracking-wider text-ink/45'
  const iconBtn = 'grid h-8 w-8 flex-none place-items-center rounded-full text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-30'

  const preview = (
    <div className="flex flex-col items-center gap-4">
      {real && clean && photoUrl && (
        <div className="flex gap-1 rounded-full bg-parchment p-1 ring-1 ring-ink/10" role="radiogroup" aria-label="Preview">
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
              className={`rounded-full px-3.5 py-1.5 font-body text-xs font-semibold transition-colors ${
                view === id ? 'bg-card text-ink shadow-sm' : 'text-ink/55 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="relative w-full max-w-[220px] sm:max-w-[250px]">
      {lowRes && (
        <span className="absolute -right-2 top-2 z-30 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 font-body text-[10px] font-bold text-ink shadow">
          <AlertTriangle size={11} aria-hidden /> Low resolution
        </span>
      )}
      {showReal && real && clean && photoUrl ? (
        <RealPhotoPreview entry={real} maskSrc={clean.mask} photoUrl={photoUrl} placement={placement} template={template} />
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
        onSelect={setSelected}
        empty={
          <span className="font-body text-xs text-ink/45">
            {!caseType ? 'Pick a case to start' : !model ? 'Pick your phone' : 'Your photo goes here'}
          </span>
        }
      />
      )}
      </div>
      {showReal && <p className="-mt-2 text-center font-body text-[11px] text-ink/45">Switch to Design to drag things on the case.</p>}

      {photoUrl && step === 4 && (
        <div className="w-full max-w-[280px] space-y-3 rounded-2xl bg-card p-3 ring-1 ring-ink/10">
          {/* Zoom: − / slider / +, with the size and a reset */}
          <div className="flex items-center gap-1">
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
              className="w-full accent-[var(--color-teal)]"
            />
            <button type="button" onClick={() => zoomBy(sizeCtl.step)} disabled={sizeCtl.value >= sizeCtl.max} aria-label={`${sizeCtl.label}: bigger`} className={iconBtn}>
              <Plus size={15} />
            </button>
            <span className="w-11 flex-none text-right font-body text-xs font-semibold tabular-nums text-ink/60">{sizeCtl.shown}</span>
            <button
              type="button"
              onClick={resetSelected}
              aria-label={`Reset the ${layerName}'s size, position and turn`}
              title={`Reset the ${layerName}`}
              className={iconBtn}
            >
              <RotateCcw size={14} />
            </button>
          </div>

          {/* Undo / redo */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-body text-xs font-medium text-ink/55">History</span>
            <div className="flex gap-1">
              <button type="button" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo" className={iconBtn}>
                <Undo2 size={15} />
              </button>
              <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo" className={iconBtn}>
                <Redo2 size={15} />
              </button>
            </div>
          </div>

          {/* Factory template: exact camera cut-out and safe area */}
          <label className="flex cursor-pointer items-center justify-between gap-2">
            <span className="font-body text-xs font-medium text-ink/55">Show print guides</span>
            <span className="relative inline-flex">
              <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} className="peer sr-only" />
              <span className="h-5 w-9 rounded-full bg-ink/15 transition-colors peer-checked:bg-teal peer-focus-visible:ring-2 peer-focus-visible:ring-teal/40" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </span>
          </label>
        </div>
      )}

      {model && unitPrice != null && (
        <p className="text-center font-body text-sm text-ink/60">
          {caseType?.label} for {model.label} · <span className="font-semibold text-ink">{formatRs(unitPrice)}</span>
        </p>
      )}
    </div>
  )

  return (
    <div data-casecraft-fonts className={`grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10 ${caseFontVariables}`}>
      <div className={`lg:sticky lg:top-24 lg:order-last ${model ? '' : 'hidden lg:block'}`}>{preview}</div>

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

        <StepCard n={3} title="Print style" summary={step > 3 || photoUrl ? getTemplate(template).label : undefined} open={step === 3} done={step > 3 || Boolean(photoUrl)} disabled={!model} onOpen={() => setStep(3)}>
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

        <StepCard n={4} title="Your photo" summary={file ? file.name : undefined} open={step === 4} done={Boolean(photoUrl)} disabled={!model} onOpen={() => setStep(4)}>
          {!user && !loading ? (
            <div className="rounded-2xl border border-dashed border-ink/20 p-5 text-center">
              <p className="font-body text-sm text-ink/70">Sign in first, so your photo stays with your order.</p>
              <button type="button" onClick={login} className={`${btnPrimary} mt-3`}>
                <LogIn size={15} aria-hidden /> Sign in
              </button>
              <p className="mt-2 font-body text-xs text-ink/45">Your case and phone choices are kept.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => choosePhoto(e.target.files?.[0])} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  choosePhoto(e.dataTransfer.files?.[0])
                }}
                className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/20 px-4 py-6 text-center transition-colors hover:border-teal hover:bg-teal/5"
              >
                <ImagePlus size={22} className="text-teal-deep" aria-hidden />
                <span className="font-body text-sm font-semibold text-ink">{photoUrl ? 'Choose a different photo' : 'Upload a photo'}</span>
                <span className="font-body text-xs text-ink/50">A clear, high-quality photo prints best. JPEG or PNG.</span>
              </button>
              {recent.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="font-body text-[11px] font-semibold uppercase tracking-wider text-ink/45">Recent photos</span>
                    <span className="font-body text-[10px] text-ink/40">Saved on this device only</span>
                  </div>
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {recent.map((r) => (
                      <div key={r.id} className="group/recent relative h-20 w-16 flex-none">
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
                            onClick={() => addSticker(recentToFile(r))}
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
              )}
              {photoUrl && (
                <>
                  <p className="font-body text-xs text-ink/55">
                    Tap a layer — on the case or below — then drag it, resize it under the preview, or use the buttons here.
                  </p>

                  {/* Layers: main photo, added images (bottom → top), text */}
                  <div className="rounded-2xl border border-ink/10 p-4">
                    <span className={`${sectionLabel} flex items-center gap-1.5`}>
                      <Layers size={12} aria-hidden /> Layers
                    </span>
                    <input ref={stickerRef} type="file" accept="image/*" className="hidden" onChange={(e) => { addSticker(e.target.files?.[0]); e.target.value = '' }} />
                    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Layer to edit">
                      <LayerChip on={selected === 'photo'} onClick={() => setSelected('photo')} label="Main photo" thumb={photoUrl} />
                      {stickers.map((st, i) => (
                        <LayerChip key={st.id} on={selected === st.id} onClick={() => setSelected(st.id)} label={`Image ${i + 1}`} thumb={st.src} checker />
                      ))}
                      {placement.text?.value.trim() && (
                        <LayerChip on={selected === 'text'} onClick={() => setSelected('text')} label="Text" />
                      )}
                      {stickers.length < MAX_STICKERS && (
                        <button
                          type="button"
                          onClick={() => stickerRef.current?.click()}
                          className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-dashed border-ink/25 px-3 font-body text-xs font-semibold text-teal-deep transition-colors hover:border-teal hover:bg-teal/5"
                        >
                          <Plus size={14} aria-hidden /> Add image
                        </button>
                      )}
                    </div>
                    <p className="mt-2 font-body text-[11px] text-ink/45">
                      Add a logo or a cut-out on top of your photo — a PNG with a see-through background works best.
                    </p>
                    {sticker && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => moveSticker(1)} disabled={stickers[stickers.length - 1]?.id === sticker.id} className={toolBtn}>
                          <BringToFront size={14} aria-hidden /> Forward
                        </button>
                        <button type="button" onClick={() => moveSticker(-1)} disabled={stickers[0]?.id === sticker.id} className={toolBtn}>
                          <SendToBack size={14} aria-hidden /> Back
                        </button>
                        <button type="button" onClick={removeSticker} className={`${toolBtn} text-[#b42318] hover:text-[#b42318]`}>
                          <Trash2 size={14} aria-hidden /> Remove image
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 rounded-2xl border border-ink/10 p-4 sm:grid-cols-2">
                    {/* Move: a small arrow pad */}
                    <div>
                      <span className={sectionLabel}>Move {layerName}</span>
                      <div className="grid w-max grid-cols-3 gap-1.5">
                        <span />
                        <button type="button" onClick={() => nudge(0, -0.02)} aria-label="Move up" className={toolBtn}>
                          <ArrowUp size={15} />
                        </button>
                        <span />
                        <button type="button" onClick={() => nudge(-0.02, 0)} aria-label="Move left" className={toolBtn}>
                          <ArrowLeft size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={centre}
                          aria-label="Centre the photo"
                          title="Centre"
                          className={toolBtn}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        </button>
                        <button type="button" onClick={() => nudge(0.02, 0)} aria-label="Move right" className={toolBtn}>
                          <ArrowRight size={15} />
                        </button>
                        <span />
                        <button type="button" onClick={() => nudge(0, 0.02)} aria-label="Move down" className={toolBtn}>
                          <ArrowDown size={15} />
                        </button>
                        <span />
                      </div>
                    </div>

                    {/* Rotate */}
                    <div>
                      <span className={sectionLabel}>
                        Rotate <span className="ml-1 normal-case tracking-normal text-ink/60 tabular-nums">{selected === 'text' ? '—' : `${currentTurn}°`}</span>
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
                    </div>

                    {/* Background */}
                    <div className="sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-body text-xs font-medium text-ink/55">Background where the photo doesn&rsquo;t reach</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Background behind the photo">
              {PLACEMENT_BACKGROUNDS.map((b) => {
                const on = placementBg(placement) === b.id
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={b.label}
                    title={b.label}
                    onClick={() => commit({ ...placement, bg: b.id })}
                    className={`relative h-7 w-7 overflow-hidden rounded-full ring-offset-2 ring-offset-card transition-shadow ${
                      on ? 'ring-2 ring-teal' : 'ring-1 ring-ink/15 hover:ring-ink/30'
                    } ${b.id === 'black' ? 'bg-black' : b.id === 'transparent' ? TRANSPARENT_CHECKER : 'bg-white'}`}
                  >
                    {b.id === 'blur' && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl} alt="" className="h-full w-full scale-150 object-cover blur-[3px]" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

                    </div>
                  </div>

                  {/* Text */}
                  <div className="rounded-2xl border border-ink/10 p-4">
                    <span className={sectionLabel}>Text</span>
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
                        placeholder="Add a name or a short line"
                        className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-card px-3 py-2 font-body text-sm text-ink outline-none placeholder:text-ink/35 focus:border-teal focus:ring-2 focus:ring-teal/20"
                      />
                      {placement.text?.value && (
                        <button type="button" onClick={() => commit({ ...placement, text: null })} aria-label="Remove text" title="Remove text" className={toolBtn}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {placement.text?.value.trim() && (
                      <div className="mt-3 space-y-3">
                        {/* Font: each tile shows the shopper's own words in that font */}
                        <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3" role="radiogroup" aria-label="Font">
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
                                className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border px-2 pb-1.5 pt-2.5 transition-colors ${
                                  on ? 'border-teal bg-teal/8 ring-1 ring-teal' : 'border-ink/12 hover:border-ink/30'
                                }`}
                              >
                                <span
                                  className="block w-full truncate text-center text-lg leading-tight text-ink"
                                  style={{ fontFamily: textFontFamily(f.id), fontStyle: f.italic ? 'italic' : 'normal', fontWeight: f.weight }}
                                >
                                  {placement.text?.value.trim() || 'Your text'}
                                </span>
                                <span className="font-body text-[10px] font-medium uppercase tracking-wider text-ink/45">{f.label}</span>
                              </button>
                            )
                          })}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="font-body text-xs font-medium text-ink/55">Colour</span>
                          <div className="flex gap-1.5" role="radiogroup" aria-label="Text colour">
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
                                  className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-card transition-shadow ${on ? 'ring-2 ring-teal' : 'ring-1 ring-ink/15 hover:ring-ink/30'}`}
                                  style={{ background: c.id }}
                                />
                              )
                            })}
                            {/* Any other colour */}
                            {(() => {
                              const current = placement.text?.color ?? DEFAULT_TEXT.color
                              const custom = !TEXT_COLORS.some((c) => c.id === current)
                              return (
                                <label
                                  title="Pick any colour"
                                  className={`relative h-7 w-7 cursor-pointer overflow-hidden rounded-full ring-offset-2 ring-offset-card transition-shadow ${
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

                        <label className="flex items-center gap-3">
                          <span className="font-body text-xs font-medium text-ink/55">Size</span>
                          <input
                            type="range"
                            min={TEXT_MIN_SIZE}
                            max={TEXT_MAX_SIZE}
                            step={0.005}
                            value={placement.text?.size ?? DEFAULT_TEXT.size}
                            onPointerDown={snapshot}
                            onKeyDown={snapshot}
                            onChange={(e) => setText({ size: Number(e.target.value) })}
                            className="w-full accent-[var(--color-teal)]"
                          />
                        </label>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex gap-1.5">
                            {([['Top', 0.15], ['Middle', 0.5], ['Bottom', 0.85]] as const).map(([label, y]) => (
                              <button
                                key={label}
                                type="button"
                                onClick={() => commit({ ...placement, text: { ...(placement.text ?? DEFAULT_TEXT), x: 0.5, y } })}
                                className={toolBtn}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <label className="flex cursor-pointer items-center gap-2">
                            <span className="font-body text-xs font-medium text-ink/55">Shadow</span>
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
                        </div>
                      </div>
                    )}
                  </div>
                  {lowResPending && (
                    <div
                      className={`rounded-2xl border p-4 transition-shadow ${lowResNudge ? 'border-gold ring-2 ring-gold/60' : 'border-gold/60'} bg-gold/10`}
                      role="alert"
                    >
                      <p className="flex items-start gap-2 font-body text-sm font-semibold text-ink">
                        <AlertTriangle size={16} className="mt-0.5 flex-none text-gold-deep" aria-hidden />
                        This photo may print blurry
                      </p>
                      <p className="mt-1 pl-6 font-body text-xs text-ink/65">
                        It&rsquo;s {photoPx?.w}×{photoPx?.h} px — small for the size it&rsquo;s shown on your case
                        {quality !== null && quality < 0.33 ? ', so it will look noticeably soft' : ''}. A larger, original photo (not a screenshot or
                        a WhatsApp copy) prints much sharper. Zooming out also helps.
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
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (lowResPending) return setLowResNudge(true)
                      setStep(5)
                    }}
                    className={btnPrimary}
                  >
                    Looks good, continue
                  </button>
                </>
              )}
            </div>
          )}
        </StepCard>

        <StepCard n={5} title="Delivery & payment" open={step === 5} done={false} disabled={!photoUrl || !model} onOpen={() => setStep(5)}>
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
        </StepCard>
      </div>
    </div>
  )
}

function LayerChip({ on, onClick, label, thumb, checker }: { on: boolean; onClick: () => void; label: string; thumb?: string | null; checker?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`inline-flex h-11 items-center gap-2 rounded-xl border pl-1.5 pr-3 font-body text-xs font-semibold transition-colors ${
        on ? 'border-teal bg-teal/8 text-ink ring-1 ring-teal' : 'border-ink/12 text-ink/70 hover:border-ink/30'
      } ${thumb ? '' : 'pl-3'}`}
    >
      {thumb ? (
        <span className={`h-8 w-8 flex-none overflow-hidden rounded-lg ring-1 ring-ink/10 ${checker ? TRANSPARENT_CHECKER : 'bg-ink/5'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt="" className={`h-full w-full ${checker ? 'object-contain' : 'object-cover'}`} />
        </span>
      ) : (
        <span className="grid h-8 w-6 place-items-center font-display text-sm italic text-ink/60">Aa</span>
      )}
      {label}
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
