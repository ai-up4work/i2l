// components/store-modules/casecraft/parts.tsx
// Building blocks shared by the Case Craft builder and ready-made pages.
'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, ChevronDown, Minus, Move, Plus, Search, Smartphone } from 'lucide-react'
import { BRANDS, type BrandId, type CaseModel, type SizeClass, type TemplateId } from '@/lib/store-modules/casecraft/catalog'
import { formatRs } from '@/lib/store-modules/casecraft/settings'
import { placementBg, printArea, type Placement } from './compose'

// ---- Step card ----------------------------------------------------------------

export function StepCard({
  n,
  title,
  summary,
  open,
  done,
  disabled,
  onOpen,
  children,
}: {
  n: number
  title: string
  summary?: ReactNode
  open: boolean
  done: boolean
  disabled?: boolean
  onOpen: () => void
  children: ReactNode
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border bg-card transition-shadow ${open ? 'border-ink/15 shadow-[0_6px_24px_rgba(32,36,43,0.06)]' : 'border-ink/10'}`}>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-parchment/60 disabled:cursor-not-allowed disabled:opacity-45 sm:px-5"
      >
        <span
          className={`grid h-7 w-7 flex-none place-items-center rounded-full font-body text-xs font-bold ${
            done ? 'bg-teal text-white' : open ? 'bg-indigo text-parchment' : 'bg-ink/8 text-ink/50'
          }`}
        >
          {done ? <Check size={14} strokeWidth={3} /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-body text-sm font-semibold text-ink">{title}</span>
          {summary && <span className="mt-0.5 block truncate font-body text-xs text-ink/55">{summary}</span>}
        </span>
        <ChevronDown size={16} className={`flex-none text-ink/40 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && <div className="border-t border-ink/10 p-4 sm:p-5">{children}</div>}
    </section>
  )
}

// ---- Phone picker ---------------------------------------------------------------

export function PhonePicker({
  models,
  selected,
  onSelect,
  prices,
}: {
  models: CaseModel[]
  selected: string | null
  onSelect: (m: CaseModel) => void
  /** Shopper price per size band, to show on each model. */
  prices?: Record<SizeClass, number>
}) {
  const brands = useMemo(() => BRANDS.filter((b) => models.some((m) => m.brand === b.id)), [models])
  const initial = models.find((m) => m.label === selected)?.brand ?? brands[0]?.id ?? 'iphone'
  const [brand, setBrand] = useState<BrandId>(initial)
  const [q, setQ] = useState('')
  const shown = models.filter((m) => m.brand === brand && m.label.toLowerCase().includes(q.trim().toLowerCase()))

  if (!models.length) return <p className="font-body text-sm text-ink/55">No phone models are available for this case right now.</p>

  return (
    <div>
      {brands.length > 1 && (
        <div className="mb-3 flex gap-1 rounded-full bg-parchment p-1 ring-1 ring-ink/10">
          {brands.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setBrand(b.id)
                setQ('')
              }}
              className={`flex-1 rounded-full px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
                brand === b.id ? 'bg-card text-ink shadow-sm' : 'text-ink/55 hover:text-ink'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
      <label className="mb-3 flex items-center gap-2 rounded-xl border border-ink/10 bg-parchment/50 px-3 py-2">
        <Search size={14} className="text-ink/40" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find your phone"
          className="w-full bg-transparent font-body text-sm text-ink outline-none placeholder:text-ink/40"
        />
      </label>
      <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-3">
        {shown.map((m) => {
          const on = m.label === selected
          return (
            <button
              key={m.label}
              type="button"
              onClick={() => onSelect(m)}
              className={`flex min-w-0 flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors ${
                on ? 'border-teal bg-teal/8 ring-1 ring-teal' : 'border-ink/10 hover:border-ink/25'
              }`}
            >
              <span className="flex w-full items-center gap-1.5">
                <Smartphone size={13} className={on ? 'text-teal-deep' : 'text-ink/35'} aria-hidden />
                <span className="truncate font-body text-[13px] font-semibold text-ink">{m.label}</span>
              </span>
              {prices && <span className="mt-0.5 font-body text-[11px] text-ink/55">{formatRs(prices[m.size])}</span>}
            </button>
          )
        })}
        {shown.length === 0 && <p className="col-span-full py-6 text-center font-body text-sm text-ink/50">No match.</p>}
      </div>
    </div>
  )
}

// ---- Case preview -----------------------------------------------------------------

/**
 * Fallback for the clean look when a model's clean layers (cut from its real
 * template) can't load: a camera module drawn for the brand, plus a little
 * gloss. Approximate — the real layers are used whenever they're there.
 */
function CaseMockup({ brand, size }: { brand: BrandId; size?: SizeClass }) {
  const lens = (cx: number, cy: number, r = 6.2) => (
    <g key={`${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r={r} fill="#2a2a2e" stroke="#4a4a50" strokeWidth={0.9} />
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#0d0d10" />
      <circle cx={cx - r * 0.22} cy={cy - r * 0.25} r={r * 0.16} fill="#ffffff" opacity={0.35} />
    </g>
  )
  const threeLens = size === 'pro' || size === 'promax'
  return (
    <svg viewBox="0 0 90 160" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="cc-gloss" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.38" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      {brand === 'iphone' && (
        <g>
          <rect x={4.5} y={4.5} width={34} height={34} rx={8} fill="#1d1d20" fillOpacity={0.94} stroke="#ffffff" strokeOpacity={0.18} strokeWidth={0.6} />
          {threeLens ? [lens(13.5, 13.5), lens(13.5, 29.5), lens(28.5, 21.5)] : [lens(14, 14), lens(28.5, 28.5)]}
          <circle cx={30} cy={11} r={1.8} fill="#f5e9c8" opacity={0.85} />
        </g>
      )}
      {brand === 'samsung' && <g>{[lens(13, 13, 5.6), lens(13, 27, 5.6), lens(13, 41, 5.6)]}</g>}
      {brand === 'google' && (
        <g>
          <rect x={0} y={20} width={90} height={15} rx={7.5} fill="#1d1d20" fillOpacity={0.94} />
          {lens(18, 27.5, 5.2)}
          {lens(31, 27.5, 5.2)}
          <circle cx={44} cy={27.5} r={1.8} fill="#f5e9c8" opacity={0.85} />
        </g>
      )}
      <rect x={0} y={0} width={90} height={160} fill="url(#cc-gloss)" />
    </svg>
  )
}

export function CasePreview({
  photoUrl,
  placement,
  template,
  overlaySrc,
  maskSrc,
  cameraSrc,
  brand,
  size,
  guides = true,
  onPlacementChange,
  empty,
  className = '',
}: {
  photoUrl: string | null
  placement: Placement
  template: TemplateId
  /** The factory print template (cut-outs, safe area, spec text). */
  overlaySrc: string | null
  /** Clean layers cut from that template (catalog.ts cleanTemplateSrc):
   *  the photo is clipped to the case shape and the camera laid on top. */
  maskSrc?: string | null
  cameraSrc?: string | null
  /** Fallback when the clean layers can't load: a drawn camera for the brand. */
  brand?: BrandId
  size?: SizeClass
  /** Show the factory print template instead of the clean look. */
  guides?: boolean
  onPlacementChange?: (p: Placement) => void
  empty?: ReactNode
  className?: string
}) {
  const areaRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const [overlayFailed, setOverlayFailed] = useState<string | null>(null)
  const a = printArea(template)
  const bg = placementBg(placement)

  // The photo is laid out whole, at its own shape — never cropped to the
  // case first — then sized exactly like the print file (compose.ts):
  // zoom 1 just covers the print area, below 1 shows the edges (a round
  // logo stays round). Until its size is known it's treated as the print
  // area's own shape.
  const [photoSize, setPhotoSize] = useState<{ src: string; w: number; h: number } | null>(null)
  const areaAspect = (a.width * 9) / (a.height * 16)
  const photoAspect = photoSize && photoSize.src === photoUrl && photoSize.h > 0 ? photoSize.w / photoSize.h : areaAspect
  const coverW = photoAspect > areaAspect ? photoAspect / areaAspect : 1
  const coverH = photoAspect > areaAspect ? 1 : areaAspect / photoAspect
  const canDrag = Boolean(photoUrl && onPlacementChange)

  // The clean look only switches on once its mask has actually loaded — a
  // CSS mask pointing at a missing file would hide the whole case.
  const [maskLoaded, setMaskLoaded] = useState<string | null>(null)
  useEffect(() => {
    if (!maskSrc) return
    let alive = true
    const img = new window.Image()
    img.onload = () => alive && setMaskLoaded(maskSrc)
    img.onerror = () => alive && setMaskLoaded(null)
    img.src = maskSrc
    return () => {
      alive = false
    }
  }, [maskSrc])
  const clean = !guides && Boolean(maskSrc) && maskLoaded === maskSrc

  const maskStyle: CSSProperties | undefined = clean
    ? {
        maskImage: `url("${maskSrc}")`,
        WebkitMaskImage: `url("${maskSrc}")`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
      }
    : undefined

  return (
    <div
      className={`relative aspect-[9/16] w-full select-none ${
        clean ? '' : 'overflow-hidden rounded-[28px] bg-white shadow-[0_24px_48px_-20px_rgba(8,39,79,0.45)] ring-1 ring-ink/10'
      } ${canDrag ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${className}`}
      onPointerDown={(e) => {
        if (!canDrag) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { px: e.clientX, py: e.clientY, x: placement.x, y: placement.y }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        const box = areaRef.current?.getBoundingClientRect()
        if (!d || !box || !onPlacementChange) return
        const clamp = (v: number) => Math.max(-1.5, Math.min(1.5, v))
        onPlacementChange({ ...placement, x: clamp(d.x + (e.clientX - d.px) / box.width), y: clamp(d.y + (e.clientY - d.py) / box.height) })
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      {/* The case: shadow on the outer layer, the shape (mask) inside it. */}
      <div className="absolute inset-0" style={clean ? { filter: 'drop-shadow(0 16px 18px rgba(8,39,79,0.32))' } : undefined}>
        <div className="absolute inset-0" style={maskStyle}>
          {clean && <div className="absolute inset-0 bg-white" />}
          <div
            ref={areaRef}
            className={`absolute overflow-hidden ${
              !photoUrl
                ? clean ? 'bg-[#efeae1]' : 'bg-parchment'
                : bg === 'black' ? 'bg-black' : bg === 'white' ? 'bg-white' : bg === 'transparent' ? TRANSPARENT_CHECKER : 'bg-ink/10'
            }`}
            style={{ left: `${a.left * 100}%`, top: `${a.top * 100}%`, width: `${a.width * 100}%`, height: `${a.height * 100}%` }}
          >
            {/* Background where the photo doesn't reach (zoomed out / dragged
                off an edge) — matches what's printed (compose.ts). */}
            {photoUrl && bg === 'blur' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-xl" />
            )}
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="Your photo"
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget
                  setPhotoSize({ src: photoUrl, w: img.naturalWidth, h: img.naturalHeight })
                }}
                className="pointer-events-none absolute max-w-none"
                style={{
                  left: `${(0.5 + placement.x) * 100}%`,
                  top: `${(0.5 + placement.y) * 100}%`,
                  width: `${coverW * placement.zoom * 100}%`,
                  height: `${coverH * placement.zoom * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )}
          </div>
          {/* A little gloss, so it reads as a case rather than a flat picture. */}
          {clean && <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-white/0 to-white/10" />}
        </div>
        {clean && cameraSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cameraSrc} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
        )}
      </div>

      {!clean && !guides && brand && <CaseMockup brand={brand} size={size} />}
      {(guides || (!clean && !brand)) && overlaySrc && overlayFailed !== overlaySrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={overlaySrc}
          alt=""
          draggable={false}
          onError={() => setOverlayFailed(overlaySrc)}
          className="pointer-events-none absolute inset-0 z-10 h-full w-full object-contain"
        />
      )}
      {!photoUrl && empty && <div className="absolute inset-0 z-20 grid place-items-center p-6 text-center">{empty}</div>}
      {canDrag && (
        <span className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 font-body text-[10px] text-white backdrop-blur-sm">
          <Move size={10} aria-hidden /> Drag to move
        </span>
      )}
    </div>
  )
}

// ---- Quantity ---------------------------------------------------------------------

export function QuantityStepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-ink/15 bg-card">
      <button type="button" aria-label="One less" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} className="grid h-9 w-9 place-items-center text-ink/70 disabled:opacity-30">
        <Minus size={14} />
      </button>
      <span className="w-6 text-center font-body text-sm font-semibold tabular-nums text-ink">{value}</span>
      <button type="button" aria-label="One more" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="grid h-9 w-9 place-items-center text-ink/70 disabled:opacity-30">
        <Plus size={14} />
      </button>
    </div>
  )
}

/** Soft checkerboard: the usual sign for "see-through, nothing printed here". */
export const TRANSPARENT_CHECKER =
  'bg-white [background-image:repeating-conic-gradient(rgba(32,36,43,0.08)_0_25%,transparent_0_50%)] [background-size:14px_14px]'

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-full bg-indigo px-5 py-3 font-body text-sm font-semibold text-parchment transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-45'
export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-full border border-ink/15 bg-card px-4 py-2 font-body text-sm font-semibold text-ink transition-colors hover:border-ink/30 disabled:opacity-45'
