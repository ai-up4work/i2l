// components/admin/CouponDesigner.tsx
//
// Design a coupon's card — the same controls as the customizer demo
// (app/demo/discount-customizer), with a live preview of the real
// DealCoupon card exactly as customers will see it in My coupons and the
// cart. Images are uploaded to storage (/api/upload) and saved as URLs.
// Used by Admin → Coupons (new coupon, and each coupon's page).
'use client'

import { useState } from 'react'
import { Loader2, Shuffle, Upload, X } from 'lucide-react'
import DealCoupon from '@/components/shared/DealCoupon-flex'
import {
  COUPON_BADGE,
  COUPON_ICONS,
  COUPON_PALETTES,
  COUPON_PATTERNS,
  couponToDisplay,
  type CouponDesign,
  type CouponFacts,
} from '@/lib/coupons/design'

const inputClass =
  'w-full rounded-xl border border-ink/15 bg-card px-3 py-2 text-sm text-ink placeholder:text-ink/35 transition-colors focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20'

function patternLabel(p: string) {
  return p === 'none' ? 'None' : p.replace(/([A-Z])/g, ' $1').replace(/^\w/, (c) => c.toUpperCase())
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink/50">{children}</span>
}

function ImagePicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (url: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Choose an image file.')
    if (file.size > 5 * 1024 * 1024) return setError('Image must be under 5MB.')
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.append('file', file)
    form.append('folder', 'banners')
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !body.url) return setError(body.error ?? 'Upload failed.')
    onChange(body.url as string)
  }

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex h-12 items-center justify-center overflow-hidden rounded-xl border border-ink/10 bg-parchment">
        {busy ? (
          <Loader2 size={15} className="animate-spin text-ink/40" />
        ) : value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-contain p-1" />
        ) : (
          <Upload size={14} className="text-ink/30" />
        )}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <label className="flex-1 cursor-pointer">
          <span className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink/20 px-2 py-1.5 text-[11px] font-semibold text-ink/60 hover:bg-ink/[0.03]">
            <Upload size={11} /> {value ? 'Replace' : 'Upload'}
          </span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={upload} />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Remove ${label.toLowerCase()}`}
            className="rounded-lg bg-ink/5 px-2 text-ink/50 hover:text-ink"
          >
            <X size={12} />
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  )
}

export default function CouponDesigner({
  design,
  onChange,
  facts,
}: {
  design: CouponDesign
  onChange: (d: CouponDesign) => void
  /** Discount + rules, so the preview shows the real amounts. */
  facts: Omit<CouponFacts, 'design'>
}) {
  const set = <K extends keyof CouponDesign>(key: K, value: CouponDesign[K]) => onChange({ ...design, [key]: value })

  const randomize = () => {
    const p = COUPON_PALETTES[Math.floor(Math.random() * COUPON_PALETTES.length)]
    const pattern = COUPON_PATTERNS[1 + Math.floor(Math.random() * (COUPON_PATTERNS.length - 1))]
    const icon = COUPON_ICONS[1 + Math.floor(Math.random() * (COUPON_ICONS.length - 1))]
    onChange({ ...design, bgColor: p.bg, accentColor: p.accent, patternType: pattern, productIcon: icon.value })
  }

  const preview = couponToDisplay({ ...facts, design }, { badge: COUPON_BADGE.available })

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Preview */}
      <div className="flex flex-col rounded-2xl border border-ink/10 bg-parchment/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">Customers see</span>
          <button
            type="button"
            onClick={randomize}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-card px-3 py-1 text-xs font-semibold text-ink/70 hover:text-ink"
          >
            <Shuffle size={12} /> Surprise me
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center py-2">
          <div className="w-full max-w-[400px]">
            <DealCoupon coupon={{ ...preview, actionLabel: 'Use now' }} onSelect={() => {}} notchColor="#f8f3ea" />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4">
        <div>
          <Label>Colours</Label>
          <div className="grid grid-cols-6 gap-1.5">
            {COUPON_PALETTES.map((p) => (
              <button
                key={p.label}
                type="button"
                title={p.label}
                onClick={() => onChange({ ...design, bgColor: p.bg, accentColor: p.accent })}
                className={`flex flex-col items-center gap-1 rounded-xl border p-1.5 ${
                  design.bgColor === p.bg && design.accentColor === p.accent ? 'border-teal ring-2 ring-teal/20' : 'border-ink/10'
                }`}
              >
                <span className="relative h-7 w-7 overflow-hidden rounded-full border border-black/10" style={{ background: p.bg }}>
                  <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-tl-full" style={{ background: p.accent }} />
                </span>
                <span className="text-[10px] text-ink/55">{p.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                ['bgColor', 'Background'],
                ['accentColor', 'Text & pattern'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-xl border border-ink/10 px-2 py-1.5 text-xs text-ink/60">
                <input
                  type="color"
                  value={design[key]}
                  onChange={(e) => set(key, e.target.value)}
                  className="h-7 w-7 cursor-pointer rounded-lg border border-black/10 p-0.5"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>Pattern</Label>
            <select value={design.patternType} onChange={(e) => set('patternType', e.target.value as CouponDesign['patternType'])} className={inputClass}>
              {COUPON_PATTERNS.map((p) => (
                <option key={p} value={p}>
                  {patternLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1">
              {COUPON_ICONS.map((i) => (
                <button
                  key={i.value}
                  type="button"
                  onClick={() => set('productIcon', i.value)}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${
                    design.productIcon === i.value ? 'border-teal bg-teal/[0.08] text-teal-deep' : 'border-ink/10 text-ink/60'
                  }`}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>Line under amount</Label>
            <input value={design.eyebrow} onChange={(e) => set('eyebrow', e.target.value.slice(0, 30))} placeholder="Automatic" className={inputClass} />
          </label>
          <label className="block">
            <Label>Footer text</Label>
            <input value={design.footerText} onChange={(e) => set('footerText', e.target.value.slice(0, 40))} placeholder="Coupon name" className={inputClass} />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <ImagePicker label="Product image" value={design.productImage} onChange={(v) => set('productImage', v)} />
          <ImagePicker label="Logo" value={design.footerLogo} onChange={(v) => set('footerLogo', v)} />
          <label className="block">
            <Label>Initials</Label>
            <input
              value={design.footerInitials}
              onChange={(e) => set('footerInitials', e.target.value.toUpperCase().slice(0, 2))}
              placeholder="Auto"
              disabled={!!design.footerLogo}
              className={`${inputClass} disabled:opacity-40`}
            />
            <span className="mt-1 block text-[10px] text-ink/45">Shown when there’s no logo</span>
          </label>
        </div>
        <p className="text-[11px] text-ink/45">Use a transparent PNG for the product image so the pattern shows behind it.</p>
      </div>
    </div>
  )
}
