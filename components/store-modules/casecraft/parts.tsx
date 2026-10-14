// components/store-modules/casecraft/parts.tsx
// Building blocks shared by the Case Craft builder and ready-made pages.
'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Minus, Move, Plus, Search, Smartphone } from 'lucide-react'
import { BRANDS, type BrandId, type CaseModel, type SizeClass, type TemplateId } from '@/lib/store-modules/casecraft/catalog'
import { formatRs } from '@/lib/store-modules/casecraft/settings'
import { printArea, type Placement } from './compose'

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

export function CasePreview({
  photoUrl,
  placement,
  template,
  overlaySrc,
  onPlacementChange,
  empty,
  className = '',
}: {
  photoUrl: string | null
  placement: Placement
  template: TemplateId
  overlaySrc: string | null
  onPlacementChange?: (p: Placement) => void
  empty?: ReactNode
  className?: string
}) {
  const areaRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const [overlayFailed, setOverlayFailed] = useState<string | null>(null)
  const a = printArea(template)
  const canDrag = Boolean(photoUrl && onPlacementChange)

  return (
    <div
      className={`relative aspect-[9/16] w-full select-none overflow-hidden rounded-[28px] bg-white shadow-xl ring-1 ring-ink/10 ${canDrag ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${className}`}
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
      <div
        ref={areaRef}
        className="absolute overflow-hidden bg-parchment"
        style={{ left: `${a.left * 100}%`, top: `${a.top * 100}%`, width: `${a.width * 100}%`, height: `${a.height * 100}%` }}
      >
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Your photo"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{
              transform: `translate(${placement.x * 100}%, ${placement.y * 100}%) scale(${placement.zoom})`,
              transformOrigin: 'center center',
            }}
          />
        )}
      </div>
      {overlaySrc && overlayFailed !== overlaySrc && (
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
        <span className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 font-body text-[10px] text-white">
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

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-full bg-indigo px-5 py-3 font-body text-sm font-semibold text-parchment transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-45'
export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-full border border-ink/15 bg-card px-4 py-2 font-body text-sm font-semibold text-ink transition-colors hover:border-ink/30 disabled:opacity-45'
