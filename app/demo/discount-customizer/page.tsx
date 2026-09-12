// app/demo/discount-customizer/page.tsx
'use client'

import { useMemo, useState } from 'react'
import DealCoupon, {
  type CouponDisplay,
  type PatternType,
  type ProductIconType,
} from '@/components/shared/DealCoupon-flex'
import { Copy, Check, Shuffle, Upload, X } from 'lucide-react'

/* ---------------------------------------------------------------------- */
/* Preset options                                                          */
/* ---------------------------------------------------------------------- */

const BG_PRESETS = [
  { label: 'Indigo', bg: '#EAE8FB', accent: 'text-[#5B57F0]', pattern: '#5B57F0' },
  { label: 'Amber', bg: '#FBEEDC', accent: 'text-[#E0A429]', pattern: '#E0A429' },
  { label: 'Green', bg: '#E4F3EA', accent: 'text-[#2FA36B]', pattern: '#2FA36B' },
  { label: 'Red', bg: '#FBE9E9', accent: 'text-[#E24C5A]', pattern: '#E24C5A' },
]

const PATTERN_OPTIONS: { label: string; value: PatternType }[] = [
  { label: 'None', value: 'none' },
  { label: 'Damask', value: 'damask' },
  { label: 'Vine', value: 'vine' },
  { label: 'Fine dot grid', value: 'fineDotGrid' },
  { label: 'Herringbone', value: 'herringbone' },
  { label: 'Houndstooth', value: 'houndstooth' },
  { label: 'Argyle', value: 'argyle' },
  { label: 'Leaves', value: 'leaves' },
  { label: 'Dots', value: 'dots' },
  { label: 'Diagonal', value: 'diagonal' },
  { label: 'Grid', value: 'grid' },
  { label: 'Waves', value: 'waves' },
  { label: 'Topography', value: 'topography' },
  { label: 'Circuit', value: 'circuit' },
  { label: 'Hexagons', value: 'hexagons' },
]

const PRODUCT_ICON_OPTIONS: { label: string; value: ProductIconType }[] = [
  { label: 'None', value: 'none' },
  { label: 'Percent', value: 'percent' },
  { label: 'Coin', value: 'coin' },
  { label: 'Gift', value: 'gift' },
  { label: 'Tag', value: 'tag' },
]

const BADGE_PRESETS: { label: string; className: string }[] = [
  { label: 'Active', className: 'bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25' },
  { label: 'Scheduled', className: 'bg-indigo/12 text-indigo-deep ring-1 ring-inset ring-indigo/25' },
  { label: 'Draft', className: 'bg-ink/[0.05] text-ink/50 ring-1 ring-inset ring-ink/10' },
  { label: 'Expired', className: 'bg-ink/[0.05] text-ink/40 ring-1 ring-inset ring-ink/10' },
  { label: 'Disabled', className: 'bg-ink/[0.05] text-ink/40 ring-1 ring-inset ring-ink/10' },
]

const DEFAULT_COUPON: CouponDisplay = {
  key: 'preview',
  headline: '15% off',
  eyebrow: 'Percentage off',
  detail: 'Storewide',
  badge: BADGE_PRESETS[0],
  bgColor: BG_PRESETS[0].bg,
  accent: BG_PRESETS[0].accent,
  patternType: 'damask',
  patternColor: BG_PRESETS[0].pattern,
  productIcon: 'percent',
  footerInitials: 'DS',
  footerText: 'Diwali Storewide 15%',
  href: '#',
  dimmed: false,
}

/* ---------------------------------------------------------------------- */
/* Small field wrappers                                                    */
/* ---------------------------------------------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-body text-xs font-semibold uppercase tracking-wide text-ink/50">
        {label}
      </span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-ink/10 bg-card px-3 py-2 font-body text-sm text-ink outline-none focus:border-teal focus:ring-1 focus:ring-teal'

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 // 2MB — data URLs bloat fast, keep the demo snappy

/* ---------------------------------------------------------------------- */
/* Upload field — reads a local image as a data URL. In production this   */
/* should instead upload to real storage (S3/Supabase/etc.) and store the */
/* resulting URL, not the base64 blob — see note near the export panel.   */
/* ---------------------------------------------------------------------- */

function ImageUploadField({
  label,
  hint,
  value,
  previewClassName,
  compact = false,
  onChange,
  onClear,
}: {
  label: string
  hint?: string
  value?: string
  previewClassName: string
  compact?: boolean
  onChange: (dataUrl: string) => void
  onClear: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same filename later
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Image is too large — try one under 2MB.')
      return
    }

    setError(null)
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result as string)
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsDataURL(file)
  }

  return (
    <Field label={label}>
      {hint && <p className="mb-1.5 -mt-1 font-body text-xs text-ink/50">{hint}</p>}
      <div className={`flex items-center ${compact ? 'flex-col gap-2' : 'gap-3'}`}>
        <div
          className={`grid shrink-0 place-items-center overflow-hidden rounded-lg bg-ink/5 ring-1 ring-inset ring-ink/10 ${
            compact ? 'self-start' : ''
          } ${previewClassName}`}
        >
          {value ? (
            <img src={value} alt="" className="h-full w-full object-contain p-1" />
          ) : (
            <Upload size={14} className="text-ink/30" />
          )}
        </div>

        <label className={`cursor-pointer ${compact ? 'w-full' : 'flex-1'}`}>
          <span
            className={`flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink/20 font-body font-semibold text-ink/60 transition-colors hover:border-teal hover:text-teal-deep ${
              compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
            }`}
          >
            <Upload size={compact ? 11 : 13} />
            {value ? 'Replace' : 'Upload'}
          </span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>

        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Remove ${label.toLowerCase()}`}
            className={`shrink-0 rounded-full text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink/70 ${
              compact ? 'p-1' : 'p-1.5'
            }`}
          >
            <X size={compact ? 12 : 14} />
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 font-body text-xs text-red-500">{error}</p>}
    </Field>
  )
}

/* ---------------------------------------------------------------------- */
/* Page                                                                    */
/* ---------------------------------------------------------------------- */

export default function DiscountCustomizerPage() {
  const [coupon, setCoupon] = useState<CouponDisplay>(DEFAULT_COUPON)
  const [copied, setCopied] = useState(false)

  function update<K extends keyof CouponDisplay>(key: K, value: CouponDisplay[K]) {
    setCoupon((prev: any) => ({ ...prev, [key]: value }))
  }

  function applyPalette(preset: (typeof BG_PRESETS)[number]) {
    setCoupon((prev: any) => ({ ...prev, bgColor: preset.bg, accent: preset.accent, patternColor: preset.pattern }))
  }

  function randomize() {
    const palette = BG_PRESETS[Math.floor(Math.random() * BG_PRESETS.length)]
    const pattern = PATTERN_OPTIONS[Math.floor(Math.random() * PATTERN_OPTIONS.length)]
    const icon = PRODUCT_ICON_OPTIONS[Math.floor(Math.random() * PRODUCT_ICON_OPTIONS.length)]
    const badge = BADGE_PRESETS[Math.floor(Math.random() * BADGE_PRESETS.length)]
    setCoupon((prev) => ({
      ...prev,
      bgColor: palette.bg,
      accent: palette.accent,
      patternType: pattern.value,
      patternColor: palette.pattern,
      productIcon: icon.value,
      badge,
      dimmed: badge.label === 'Expired' || badge.label === 'Disabled',
    }))
  }

  // Uploaded images make the export blob huge and unreadable, so the
  // copy-as-code panel swaps them for a short placeholder comment instead
  // of dumping raw base64 into the snippet.
  const exportCode = useMemo(() => {
    const entries = Object.entries(coupon).filter(([, v]) => v !== undefined && v !== '')
    const body = entries
      .map(([k, v]) => {
        if (k === 'badge' && v) {
          const badge = v as { label: string; className: string }
          return `  badge: { label: ${JSON.stringify(badge.label)}, className: ${JSON.stringify(badge.className)} },`
        }
        if ((k === 'footerLogo' || k === 'productImage') && typeof v === 'string' && v.startsWith('data:')) {
          return `  ${k}: '/* uploaded image — replace with a hosted URL after saving */',`
        }
        return `  ${k}: ${JSON.stringify(v)},`
      })
      .join('\n')
    return `const coupon: CouponDisplay = {\n${body}\n}`
  }, [coupon])

  async function copyExport() {
    await navigator.clipboard.writeText(exportCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="min-h-screen bg-parchment px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">Component demo</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-indigo sm:text-3xl">
              Coupon card customizer
            </h1>
            <p className="mt-1 font-body text-sm text-ink/60">
              Tune every token the shared <code className="rounded bg-ink/5 px-1.5 py-0.5">DealCoupon</code> component
              accepts, live. Pattern and product are independent layers — no raster assets required unless you
              upload one.
            </p>
          </div>
          <button
            onClick={randomize}
            className="flex items-center gap-2 rounded-full border border-gold/60 px-4 py-2 font-body text-sm font-semibold text-ink transition-colors hover:bg-gold/10"
          >
            <Shuffle size={14} /> Randomize
          </button>
        </div>

        {/* Top row: live preview on the left, Copy-as-code on the right,
            same height. items-stretch so the preview grows to match. */}
        <div className="mb-8 grid gap-8 lg:grid-cols-2 lg:items-stretch">
          <div className="flex w-full flex-col rounded-2xl border border-ink/10 bg-card p-3">
            <p className="mb-2 px-1 font-body text-xs font-semibold uppercase tracking-wide text-ink/40">
              Live preview
            </p>
            {/* Centered in the remaining height so the card fills the
                column instead of leaving dead space below it. */}
            <div className="flex flex-1 items-center justify-center p-4">
              <div className="w-full max-w-md">
                <DealCoupon coupon={coupon} />
              </div>
            </div>
          </div>

          <div className="flex flex-col rounded-2xl border border-ink/10 bg-indigo-deep p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-body text-xs font-semibold uppercase tracking-wide text-parchment/50">
                Copy as code
              </p>
              <button
                onClick={copyExport}
                className="flex items-center gap-1.5 rounded-full bg-parchment/10 px-3 py-1.5 font-body text-xs font-semibold text-parchment transition-colors hover:bg-parchment/20"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="flex-1 overflow-auto rounded-lg bg-ink/40 p-4 font-mono text-xs leading-relaxed text-parchment/90">
              {exportCode}
            </pre>
            {(coupon.footerLogo?.startsWith('data:') || coupon.productImage?.startsWith('data:')) && (
              <p className="mt-3 font-body text-xs text-parchment/60">
                Uploaded images are shown live in the preview but aren't inlined in the snippet above — upload the
                file to real storage (S3, Supabase, etc.) and paste the resulting URL into{' '}
                <code className="rounded bg-parchment/10 px-1 py-0.5">footerLogo</code> /{' '}
                <code className="rounded bg-parchment/10 px-1 py-0.5">productImage</code> instead.
              </p>
            )}
          </div>
        </div>

        {/* Bottom row: main controls on the left, Palette + Badge on the
            right — moved down here now that Copy-as-code sits up top. */}
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          {/* CONTROLS */}
          <div className="space-y-6">
            <section className="space-y-4 rounded-2xl border border-ink/10 bg-card p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink/70">Content</h2>

              <Field label="Headline">
                <input
                  className={inputClass}
                  value={coupon.headline}
                  onChange={(e) => update('headline', e.target.value)}
                />
              </Field>
              <Field label="Eyebrow">
                <input
                  className={inputClass}
                  value={coupon.eyebrow ?? ''}
                  onChange={(e) => update('eyebrow', e.target.value)}
                />
              </Field>
              <Field label="Detail">
                <input
                  className={inputClass}
                  value={coupon.detail ?? ''}
                  onChange={(e) => update('detail', e.target.value)}
                />
              </Field>
              <Field label="Footer text">
                <input
                  className={inputClass}
                  value={coupon.footerText}
                  onChange={(e) => update('footerText', e.target.value)}
                />
              </Field>
              <Field label="Footer initials (used when no logo)">
                <input
                  className={inputClass}
                  maxLength={2}
                  value={coupon.footerInitials ?? ''}
                  onChange={(e) => update('footerInitials', e.target.value.toUpperCase())}
                />
              </Field>
            </section>

            <section className="space-y-4 rounded-2xl border border-ink/10 bg-card p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink/70">Pattern</h2>
              <p className="font-body text-xs text-ink/50">
                Programmatic texture layer — independent of the product visual below. Damask / vine / argyle read
                as an ornate repeating textile; fine dot grid and herringbone are subtler.
              </p>

              <Field label="Pattern type">
                <select
                  className={inputClass}
                  value={coupon.patternType ?? 'none'}
                  onChange={(e) => update('patternType', e.target.value as PatternType)}
                >
                  {PATTERN_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Pattern color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={coupon.patternColor ?? '#08274F'}
                    onChange={(e) => update('patternColor', e.target.value)}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-ink/10 bg-transparent p-1"
                  />
                  <input
                    className={inputClass}
                    value={coupon.patternColor ?? ''}
                    onChange={(e) => update('patternColor', e.target.value)}
                  />
                </div>
              </Field>
            </section>

            <section className="space-y-4 rounded-2xl border border-ink/10 bg-card p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink/70">Product</h2>
              <p className="font-body text-xs text-ink/50">
                Pick a generated icon, tinted from the pattern color — or upload a real cutout in the Images card on
                the right, which always takes priority over the generated icon.
              </p>

              <Field label="Product icon (used when no image is uploaded)">
                <select
                  className={inputClass}
                  value={coupon.productIcon ?? 'none'}
                  onChange={(e) => update('productIcon', e.target.value as ProductIconType)}
                >
                  {PRODUCT_ICON_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
            </section>
          </div>

          {/* PALETTE + BADGE — sticky so they stay in view while the
              controls column scrolls, instead of ending early. */}
          <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
            <section className="space-y-4 rounded-2xl border border-ink/10 bg-card p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink/70">Palette</h2>
              <div className="grid grid-cols-4 gap-2">
                {BG_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => applyPalette(preset)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors ${
                      coupon.bgColor === preset.bg ? 'border-teal ring-1 ring-teal' : 'border-ink/10 hover:border-ink/25'
                    }`}
                  >
                    <span
                      className="h-8 w-8 rounded-full border border-black/5"
                      style={{ backgroundColor: preset.bg }}
                    />
                    <span className="font-body text-[10px] font-medium text-ink/60">{preset.label}</span>
                  </button>
                ))}
              </div>

              <Field label="Custom background color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={coupon.bgColor ?? '#F0EFEC'}
                    onChange={(e) => update('bgColor', e.target.value)}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-ink/10 bg-transparent p-1"
                  />
                  <input
                    className={inputClass}
                    value={coupon.bgColor ?? ''}
                    onChange={(e) => update('bgColor', e.target.value)}
                  />
                </div>
              </Field>

              <Field label="Accent text class (Tailwind)">
                <input
                  className={inputClass}
                  value={coupon.accent ?? ''}
                  onChange={(e) => update('accent', e.target.value)}
                  placeholder="text-[#5B57F0]"
                />
              </Field>
            </section>

            <section className="space-y-4 rounded-2xl border border-ink/10 bg-card p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink/70">Badge</h2>

              <Field label="Status badge">
                <select
                  className={inputClass}
                  value={coupon.badge?.label ?? ''}
                  onChange={(e) => {
                    const preset = BADGE_PRESETS.find((b) => b.label === e.target.value)
                    update('badge', preset)
                    update('dimmed', preset?.label === 'Expired' || preset?.label === 'Disabled')
                  }}
                >
                  <option value="">None</option>
                  {BADGE_PRESETS.map((b) => (
                    <option key={b.label} value={b.label}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </Field>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={coupon.dimmed ?? false}
                  onChange={(e) => update('dimmed', e.target.checked)}
                />
                <span className="font-body text-sm text-ink/70">Dimmed (expired/disabled look)</span>
              </label>
            </section>

            {/* IMAGES — compact, both uploads side by side. Moved here (out
                of Product/Store above) so this column's total height lands
                closer to the controls column instead of finishing short. */}
            <section className="space-y-3 rounded-2xl border border-ink/10 bg-card p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink/70">Images</h2>
              <div className="grid grid-cols-2 gap-3">
                <ImageUploadField
                  label="Product image"
                  value={coupon.productImage}
                  previewClassName="h-9 w-9"
                  compact
                  onChange={(dataUrl) => update('productImage', dataUrl)}
                  onClear={() => update('productImage', undefined)}
                />
                <ImageUploadField
                  label="Store logo"
                  value={coupon.footerLogo}
                  previewClassName="h-9 w-9"
                  compact
                  onChange={(dataUrl) => update('footerLogo', dataUrl)}
                  onClear={() => update('footerLogo', undefined)}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}