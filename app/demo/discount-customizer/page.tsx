"use client"

import { useMemo, useState } from 'react'
import { Copy, Check, Shuffle, Upload, X } from 'lucide-react'
import DealCoupon, { type CouponDisplay, type PatternType, type ProductIconType } from '@/components/shared/DealCoupon-flex'

const PALETTES = [
  { label: 'Indigo', bg: '#EAE8FB', accent: '#5B57F0' },
  { label: 'Amber', bg: '#FBEEDC', accent: '#B9791F' },
  { label: 'Green', bg: '#E4F3EA', accent: '#2FA36B' },
  { label: 'Red', bg: '#FBE9E9', accent: '#D6414F' },
]

// Must match the PatternType union exported by DealCoupon-flex.tsx.
const PATTERNS: PatternType[] = [
  'none', 'damask', 'vine', 'fineDotGrid', 'herringbone', 'houndstooth',
  'argyle', 'leaves', 'dots', 'diagonal', 'grid', 'waves', 'topography',
  'circuit', 'hexagons', 'bubbles', 'zigzag', 'plusSigns', 'moroccan',
  'overlappingCircles', 'jigsaw', 'wiggle', 'confetti', 'heroPolkaDots',
  'heroGraphPaper',
]

const ICONS: { label: string; value: ProductIconType }[] = [
  { label: 'None', value: 'none' },
  { label: 'Percent', value: 'percent' },
  { label: 'Coin', value: 'coin' },
  { label: 'Gift', value: 'gift' },
  { label: 'Tag', value: 'tag' },
]

// tone -> Tailwind arbitrary-value classes, matching the STATUS_STYLE shape
// that DealCoupon's `badge.className` expects.
const BADGES = [
  { label: 'Active', className: 'bg-[#E1F5EE] text-[#085041]' },
  { label: 'Scheduled', className: 'bg-[#EAE8FB] text-[#3C3489]' },
  { label: 'Draft', className: 'bg-[rgba(33,29,26,0.06)] text-[rgba(33,29,26,0.55)]' },
  { label: 'Expired', className: 'bg-[rgba(33,29,26,0.06)] text-[rgba(33,29,26,0.55)]' },
  { label: 'Disabled', className: 'bg-[rgba(33,29,26,0.06)] text-[rgba(33,29,26,0.55)]' },
]

const DEFAULT_STATE = {
  headline: '15% off',
  eyebrow: 'Percentage off',
  detail: 'Storewide',
  badgeLabel: 'Active',
  bgColor: PALETTES[0].bg,
  accentColor: PALETTES[0].accent,
  patternType: 'damask' as PatternType,
  productIcon: 'percent' as ProductIconType,
  footerInitials: 'DS',
  footerText: 'Diwali storewide 15%',
  dimmed: false,
  productImage: '',
  footerLogo: '',
}

type CustomizerState = typeof DEFAULT_STATE

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

/* ------------------------------------------------------------------ */
/* State -> the shape DealCoupon actually consumes                     */
/* ------------------------------------------------------------------ */

function toCouponDisplay(state: CustomizerState): CouponDisplay {
  const badge = BADGES.find((b) => b.label === state.badgeLabel)

  return {
    key: 'preview',
    headline: state.headline,
    eyebrow: state.eyebrow,
    detail: state.detail,
    badge: badge ? { label: badge.label, className: badge.className } : undefined,
    bgColor: state.bgColor,
    accent: `text-[${state.accentColor}]`,
    patternType: state.patternType,
    patternColor: state.accentColor,
    productIcon: state.productIcon,
    productImage: state.productImage || undefined,
    footerLogo: state.footerLogo || undefined,
    footerInitials: state.footerLogo ? undefined : state.footerInitials,
    footerText: state.footerText,
    href: '#',
    dimmed: state.dimmed,
  }
}

/* ------------------------------------------------------------------ */
/* Small field wrappers                                                */
/* ------------------------------------------------------------------ */

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-black/50">
        {label}
      </span>
      {hint && <p className="-mt-0.5 mb-1.5 text-xs text-black/50">{hint}</p>}
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm text-[#211D1A] outline-none'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-black/10 bg-white p-[18px]">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-black/70">{title}</h2>
      {children}
    </section>
  )
}

function ImageUpload({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Choose an image file.')
    if (file.size > MAX_UPLOAD_BYTES) return setError('Image is too large — try one under 2MB.')
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onChange(reader.result)
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsDataURL(file)
  }

  return (
    <Field label={label}>
      <div className="flex flex-col gap-2">
        <div className="flex h-11 items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-black/5">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-contain p-1" />
          ) : (
            <Upload size={14} className="text-black/30" />
          )}
        </div>
        <div className="flex gap-1.5">
          <label className="flex-1 cursor-pointer">
            <span className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-black/20 px-2.5 py-1.5 text-[11px] font-semibold text-black/60">
              <Upload size={11} /> {value ? 'Replace' : 'Upload'}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
          {value && (
            <button
              type="button"
              onClick={onClear}
              aria-label={`Remove ${label.toLowerCase()}`}
              className="rounded-lg bg-black/5 px-2 text-black/50"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-[#D6414F]">{error}</p>}
    </Field>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function DiscountCustomizer() {
  const [state, setState] = useState<CustomizerState>(DEFAULT_STATE)
  const [copied, setCopied] = useState(false)

  function update<K extends keyof CustomizerState>(key: K, value: CustomizerState[K]) {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  function applyPalette(p: (typeof PALETTES)[number]) {
    setState((prev) => ({ ...prev, bgColor: p.bg, accentColor: p.accent }))
  }

  function randomize() {
    const p = PALETTES[Math.floor(Math.random() * PALETTES.length)]
    const pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)]
    const icon = ICONS[Math.floor(Math.random() * ICONS.length)]
    const badge = BADGES[Math.floor(Math.random() * BADGES.length)]
    setState((prev) => ({
      ...prev,
      bgColor: p.bg,
      accentColor: p.accent,
      patternType: pattern,
      productIcon: icon.value,
      badgeLabel: badge.label,
      dimmed: badge.label === 'Expired' || badge.label === 'Disabled',
    }))
  }

  const coupon = useMemo(() => toCouponDisplay(state), [state])

  const exportCode = useMemo(() => {
    const lines = Object.entries(state).map(([k, v]) => {
      if ((k === 'productImage' || k === 'footerLogo') && typeof v === 'string' && v.startsWith('data:')) {
        return `  ${k}: '/* uploaded image — replace with a hosted URL after saving */',`
      }
      return `  ${k}: ${JSON.stringify(v)},`
    })
    return `const coupon = {\n${lines.join('\n')}\n}`
  }, [state])

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(exportCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard access can fail silently in sandboxed contexts — no-op
    }
  }

  const hasUpload = state.productImage?.startsWith('data:') || state.footerLogo?.startsWith('data:')

  return (
    <div className="min-h-full bg-[#F6F1E7] px-6 py-8 font-sans">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#B9791F]">
              Component demo
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-[#3C3489]">Coupon card customizer</h1>
            <p className="mt-1.5 max-w-[520px] text-[13px] text-black/60">
              Tune every token the real <code>DealCoupon</code> component accepts, live — the preview below renders that exact shared component, not a lookalike.
            </p>
          </div>
          <button
            onClick={randomize}
            className="flex items-center gap-2 rounded-full border border-[#B9791F]/50 bg-transparent px-4 py-2.5 text-sm font-semibold text-[#211D1A]"
          >
            <Shuffle size={14} /> Randomize
          </button>
        </div>

        <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-6">
          <div className="flex flex-col rounded-2xl border border-black/10 bg-white p-4">
            <p className="mb-2.5 ml-1 text-[11px] font-semibold uppercase tracking-wide text-black/40">
              Live preview — actual DealCoupon component
            </p>
            <div className="flex flex-1 items-center justify-center p-4">
              <div className="w-full max-w-[420px]">
                <DealCoupon coupon={coupon} />
              </div>
            </div>
          </div>

          <div className="flex flex-col rounded-2xl border border-black/10 bg-[#221B5B] p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#F6F1E7]/50">
                Copy as code
              </p>
              <button
                onClick={copyExport}
                className="flex items-center gap-1.5 rounded-full bg-[#F6F1E7]/10 px-3 py-1.5 text-[11px] font-semibold text-[#F6F1E7]"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="flex-1 overflow-auto rounded-lg bg-black/25 p-3.5 font-mono text-[11.5px] leading-relaxed text-[#F6F1E7]/90">
              {exportCode}
            </pre>
            {hasUpload && (
              <p className="mt-2.5 text-[11px] text-[#F6F1E7]/60">
                Uploaded images show live in the preview but aren't inlined in the snippet — upload to real storage and paste the resulting URL in instead.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-6">
          <div className="flex flex-col gap-5">
            <Section title="Content">
              <Field label="Headline">
                <input className={inputClass} value={state.headline} onChange={(e) => update('headline', e.target.value)} />
              </Field>
              <Field label="Eyebrow">
                <input className={inputClass} value={state.eyebrow} onChange={(e) => update('eyebrow', e.target.value)} />
              </Field>
              <Field label="Detail">
                <input className={inputClass} value={state.detail} onChange={(e) => update('detail', e.target.value)} />
              </Field>
              <Field label="Footer text">
                <input className={inputClass} value={state.footerText} onChange={(e) => update('footerText', e.target.value)} />
              </Field>
              <Field label="Footer initials (used when no logo)">
                <input className={inputClass} maxLength={2} value={state.footerInitials} onChange={(e) => update('footerInitials', e.target.value.toUpperCase())} />
              </Field>
            </Section>

            <Section title="Pattern">
              <Field label="Pattern type" hint="Programmatic texture layer baked into DealCoupon, independent of the product visual below.">
                <select className={inputClass} value={state.patternType} onChange={(e) => update('patternType', e.target.value as PatternType)}>
                  {PATTERNS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
            </Section>

            <Section title="Product">
              <Field label="Product icon (used when no image is uploaded)" hint="Tinted from the accent color, or upload a real cutout on the right — it always takes priority.">
                <select className={inputClass} value={state.productIcon} onChange={(e) => update('productIcon', e.target.value as ProductIconType)}>
                  {ICONS.map((i) => (
                    <option key={i.value} value={i.value}>{i.label}</option>
                  ))}
                </select>
              </Field>
            </Section>
          </div>

          <div className="flex flex-col gap-5">
            <Section title="Palette">
              <div className="grid grid-cols-4 gap-2">
                {PALETTES.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPalette(p)}
                    className={`flex flex-col items-center gap-1.5 rounded-[10px] border bg-transparent p-2 ${
                      state.bgColor === p.bg ? 'border-[#0F8B8D]' : 'border-black/10'
                    }`}
                  >
                    <span
                      className="h-7 w-7 rounded-full border border-black/10"
                      style={{ background: p.bg }}
                    />
                    <span className="text-[10px] font-medium text-black/60">{p.label}</span>
                  </button>
                ))}
              </div>

              <Field label="Custom background color">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={state.bgColor}
                    onChange={(e) => update('bgColor', e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded-lg border border-black/10 p-0.5"
                  />
                  <input className={inputClass} value={state.bgColor} onChange={(e) => update('bgColor', e.target.value)} />
                </div>
              </Field>

              <Field label="Accent color">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={state.accentColor}
                    onChange={(e) => update('accentColor', e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded-lg border border-black/10 p-0.5"
                  />
                  <input className={inputClass} value={state.accentColor} onChange={(e) => update('accentColor', e.target.value)} />
                </div>
              </Field>
            </Section>

            <Section title="Badge">
              <Field label="Status badge">
                <select
                  className={inputClass}
                  value={state.badgeLabel}
                  onChange={(e) => {
                    update('badgeLabel', e.target.value)
                    update('dimmed', e.target.value === 'Expired' || e.target.value === 'Disabled')
                  }}
                >
                  <option value="">None</option>
                  {BADGES.map((b) => (
                    <option key={b.label} value={b.label}>{b.label}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-black/70">
                <input type="checkbox" checked={state.dimmed} onChange={(e) => update('dimmed', e.target.checked)} />
                Dimmed (expired / disabled look)
              </label>
            </Section>

            <Section title="Images">
              <div className="grid grid-cols-2 gap-3">
                <ImageUpload label="Product image" value={state.productImage} onChange={(v) => update('productImage', v)} onClear={() => update('productImage', '')} />
                <ImageUpload label="Store logo" value={state.footerLogo} onChange={(v) => update('footerLogo', v)} onClear={() => update('footerLogo', '')} />
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}