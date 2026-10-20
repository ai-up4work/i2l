// app/admin/(protected)/super-admin/settings/pricing-engine/page.tsx
//
// Pricing engine: every rate and fee the site's prices are built from,
// editable in one place. Replaces the constants that used to be
// hardcoded in lib/quote.ts and lib/currency-config.ts.
//
// - Edits are a draft until "Save". Each changed field shows what it was.
// - The preview on the right prices a sample product with the SAVED and
//   the DRAFT numbers side by side, through the same lib/pricing.ts
//   functions the storefront uses, so you see the effect before saving.
// - Saving goes through /api/admin/pricing-settings (Super Admin only),
//   which validates, keeps a history and refreshes every page's prices.
// - "Recent changes" can load any earlier version back into the draft.
//
// Settings shape and defaults: lib/pricing-settings.ts.
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ToggleSwitch } from '@/components/admin/Toggleswitch'
import { Calculator, ChevronDown, History, Plus, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react'
import {
  BackLink,
  btnLink,
  btnPrimary,
  btnSecondary,
  btnSmall,
  card,
  FullPageLoading,
  IconTile,
  input,
  Notice,
  PageHeader,
  PageShell,
  Section,
  StatStrip,
  StatusPill,
} from '@/components/admin/catalogue/ui'
import { getDualDeliveryPricing, formatLKR } from '@/lib/pricing'
import {
  normalizePricingSettings,
  type HsCodeRates,
  type PricingSettings,
  type QuoteRates,
} from '@/lib/pricing-settings'

type HistoryEntry = {
  id: number
  changedAt: string
  changedBy: string | null
  note: string | null
  settings: PricingSettings
  previous: PricingSettings | null
}

type ApiResponse = {
  settings: PricingSettings
  defaults: PricingSettings
  saved: boolean
  updatedAt: string | null
  updatedBy: string | null
  history: HistoryEntry[]
  needsMigration: boolean
  canEdit: boolean
}

const RATE_FIELDS: { key: keyof QuoteRates; label: string }[] = [
  { key: 'dutyPercent', label: 'Duty' },
  { key: 'palPercent', label: 'PAL' },
  { key: 'cessPercent', label: 'Cess' },
  { key: 'surchargePercent', label: 'Surcharge' },
  { key: 'sscLPercent', label: 'SSCL' },
  { key: 'vatPercent', label: 'VAT' },
]

// ---- Helpers -------------------------------------------------------------------

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** Flattens settings to "path" -> value, for diffs. */
function flatten(obj: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out)
  } else {
    out[prefix] = obj
  }
  return out
}

function diffCount(a: PricingSettings, b: PricingSettings): number {
  const fa = flatten(a)
  const fb = flatten(b)
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)])
  let n = 0
  for (const k of keys) if (fa[k] !== fb[k]) n++
  return n
}

function isBad(n: number): boolean {
  return !Number.isFinite(n) || n < 0
}

function draftProblems(s: PricingSettings): string[] {
  const problems: string[] = []
  const check = (label: string, v: number) => isBad(v) && problems.push(label)
  for (const [k, v] of Object.entries(s.storefront)) if (typeof v === 'number') check(`Storefront: ${k}`, v)
  for (const [k, v] of Object.entries(s.local)) check(`Local stores: ${k}`, v)
  check('Wishdrop Mall delivery fee', s.mall.deliveryFeeLKR)
  check('Customs freight rate', s.customs.freightRatePerKgLKR)
  check('Customs default weight', s.customs.defaultWeightKg)
  if (!(s.storefront.weightBlockKg > 0)) problems.push('Weight block must be more than 0 kg')
  for (const [c, r] of Object.entries(s.currencyRatesToLKR)) if (!(r > 0)) problems.push(`Exchange rate for ${c}`)
  for (const [c, r] of Object.entries(s.customs.hsCodes)) for (const f of RATE_FIELDS) check(`HS ${c} ${f.label}`, r[f.key])
  return problems
}

function when(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' })
}

// ---- Fields ------------------------------------------------------------------------

function NumberField({
  label,
  value,
  saved,
  onChange,
  suffix,
  hint,
  step = 'any',
  disabled,
}: {
  label: string
  value: number
  saved?: number
  onChange: (v: number) => void
  suffix?: string
  hint?: string
  step?: string
  disabled?: boolean
}) {
  const changed = saved !== undefined && saved !== value && !(Number.isNaN(saved) && Number.isNaN(value))
  const bad = isBad(value)
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink/55">
        {label}
        {changed && <span className="h-1.5 w-1.5 rounded-full bg-gold-deep" aria-label="changed" />}
      </span>
      <div className={`flex items-center overflow-hidden rounded-xl border bg-white transition-colors focus-within:ring-2 focus-within:ring-teal/10 ${bad ? 'border-red-400' : changed ? 'border-gold/60' : 'border-ink/15 focus-within:border-teal/60'}`}>
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={0}
          disabled={disabled}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
          className="w-full min-w-0 bg-transparent px-3.5 py-2.5 text-sm tabular-nums text-ink outline-none disabled:text-ink/50"
        />
        {suffix && <span className="flex-none border-l border-ink/10 bg-parchment/60 px-3 py-2.5 text-xs font-semibold text-ink/50">{suffix}</span>}
      </div>
      {changed ? (
        <span className="mt-1 block text-xs text-gold-deep">Was {saved}{suffix && !suffix.startsWith('/') ? ` ${suffix}` : ''}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink/45">{hint}</span>
      ) : null}
    </label>
  )
}

function SmallNumber({ value, saved, onChange, disabled, ariaLabel }: { value: number; saved?: number; onChange: (v: number) => void; disabled?: boolean; ariaLabel: string }) {
  const changed = saved !== undefined && saved !== value
  return (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      min={0}
      aria-label={ariaLabel}
      disabled={disabled}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      title={changed ? `Was ${saved}` : undefined}
      className={`w-full min-w-0 rounded-lg border bg-white px-2.5 py-1.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-teal/10 disabled:text-ink/50 ${
        isBad(value) ? 'border-red-400' : changed ? 'border-gold/60 bg-gold/[0.06]' : 'border-ink/15 focus:border-teal/60'
      }`}
    />
  )
}

// ---- Page --------------------------------------------------------------------------

export default function PricingEnginePage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<PricingSettings | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [newCurrency, setNewCurrency] = useState({ code: '', rate: '' })
  const [newHs, setNewHs] = useState({ code: '', label: '' })

  const [preview, setPreview] = useState({ price: 2500, currency: 'INR', weight: 0.5 })

  // Customs calculator is collapsed by default — it's rarely edited and
  // isn't used for storefront prices.
  const [customsOpen, setCustomsOpen] = useState(false)

  function load() {
    fetch('/api/admin/pricing-settings')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Could not load the pricing settings')
        const d = body as ApiResponse
        setData(d)
        setDraft(clone(d.settings))
      })
      .catch((e: Error) => setLoadError(e.message))
  }
  useEffect(load, [])

  const saved = data?.settings ?? null
  const changes = useMemo(() => (draft && saved ? diffCount(draft, saved) : 0), [draft, saved])
  const problems = useMemo(() => (draft ? draftProblems(draft) : []), [draft])
  const canEdit = Boolean(data?.canEdit)

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!changes) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [changes])

  if (loadError) {
    return (
      <PageShell narrow>
        <div className="mt-10">
          <Notice tone="red">{loadError}</Notice>
        </div>
      </PageShell>
    )
  }
  if (!data || !draft || !saved) return <FullPageLoading label="Loading pricing engine…" />

  const update = (fn: (s: PricingSettings) => void) =>
    setDraft((prev) => {
      if (!prev) return prev
      const next = clone(prev)
      fn(next)
      return next
    })

  async function save() {
    if (!draft || problems.length) return
    if (!window.confirm(`Save ${changes} change${changes === 1 ? '' : 's'}? Every price on the site will use the new numbers straight away.`)) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/pricing-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: draft, note }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not save')
      setNote('')
      setMessage({ ok: true, text: 'Saved. The whole site is using the new prices.' })
      load()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save' })
    } finally {
      setSaving(false)
    }
  }

  const sf = draft.storefront
  const sfSaved = saved.storefront
  const disabled = !canEdit

  // Unsaved edits inside the collapsed Customs section — shown on its
  // toggle so a hidden change can't be missed before saving.
  const customsDraftFlat = flatten(draft.customs)
  const customsSavedFlat = flatten(saved.customs)
  const customsChanges = Array.from(new Set([...Object.keys(customsDraftFlat), ...Object.keys(customsSavedFlat)])).filter(
    (k) => customsDraftFlat[k] !== customsSavedFlat[k],
  ).length

  return (
    <PageShell>
      <BackLink href="/admin/super-admin" label="Super Admin" />
      <PageHeader
        leading={
          <IconTile>
            <SlidersHorizontal size={22} strokeWidth={1.75} />
          </IconTile>
        }
        title="Pricing engine"
        badges={data.saved ? <StatusPill tone="live">Live</StatusPill> : <StatusPill tone="draft">Using built-in defaults</StatusPill>}
        meta="Every rate and fee the site’s prices are built from. Changes are a draft until you save; then every product page, card, cart and quote uses them straight away."
        actions={
          <StatStrip
            stats={[
              { label: 'Last saved', value: <span className="text-base">{when(data.updatedAt)}</span> },
              { label: 'By', value: <span className="text-base">{data.updatedBy ?? '—'}</span> },
              { label: 'Unsaved changes', value: changes, tone: changes ? 'gold' : undefined },
            ]}
          />
        }
      />

      <div className="mt-5 flex flex-col gap-2">
        {data.needsMigration && (
          <Notice>
            Saving needs a database update: run <code className="font-mono text-xs">data/wishdrop-pricing-settings.sql</code> in Supabase. Until then the
            site uses the built-in defaults shown here.
          </Notice>
        )}
        {!canEdit && <Notice>Only a Super Admin can change these. You can look, and try numbers in the preview.</Notice>}
        {message && <Notice tone={message.ok ? 'teal' : 'red'}>{message.text}</Notice>}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ── Settings ── */}
        <div className="flex min-w-0 flex-col gap-4">
          <Section
            title="Storefront prices"
            description="What every product from an Indian store costs a shopper. Express is the default; Economy replaces freight, clearance and delivery with one postal charge."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField label="Profit" suffix="%" value={sf.profitPercent} saved={sfSaved.profitPercent} onChange={(v) => update((s) => (s.storefront.profitPercent = v))} hint="On the product cost" disabled={disabled} />
              <NumberField label="Service charge" suffix="LKR" value={sf.extraMarginLKR} saved={sfSaved.extraMarginLKR} onChange={(v) => update((s) => (s.storefront.extraMarginLKR = v))} hint="Flat, per item, both methods" disabled={disabled} />
              <NumberField label="Weight block" suffix="kg" value={sf.weightBlockKg} saved={sfSaved.weightBlockKg} onChange={(v) => update((s) => (s.storefront.weightBlockKg = v))} hint="Also the weight used when a product has none" disabled={disabled} />
            </div>
            <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-ink/40">Express</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField label="Freight" suffix="LKR / kg" value={sf.freightRatePerKgLKR} saved={sfSaved.freightRatePerKgLKR} onChange={(v) => update((s) => (s.storefront.freightRatePerKgLKR = v))} hint="Billed in weight blocks" disabled={disabled} />
              <NumberField label="Customs clearance" suffix="LKR / kg" value={sf.customsClearanceRatePerKgLKR} saved={sfSaved.customsClearanceRatePerKgLKR} onChange={(v) => update((s) => (s.storefront.customsClearanceRatePerKgLKR = v))} hint="Billed in weight blocks" disabled={disabled} />
              <NumberField label="Delivery fee" suffix="LKR" value={sf.deliveryFeeLKR} saved={sfSaved.deliveryFeeLKR} onChange={(v) => update((s) => (s.storefront.deliveryFeeLKR = v))} hint="Flat, per item" disabled={disabled} />
            </div>
            <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-ink/40">Economy</p>
            <div
              className={`mb-4 flex items-start justify-between gap-4 rounded-xl border p-4 ${
                sf.economyEnabled ? 'border-teal-deep/30 bg-teal/[0.05]' : 'border-ink/10 bg-parchment/60'
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  Offer Economy delivery
                  {sf.economyEnabled !== sfSaved.economyEnabled && (
                    <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-semibold text-gold-deep">
                      Was {sfSaved.economyEnabled ? 'on' : 'off'}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink/55">
                  {sf.economyEnabled
                    ? 'On: shoppers can choose Economy on product pages, in the cart and at checkout, and see its price in the estimator.'
                    : 'Off: Economy shows as “Coming soon” everywhere and can’t be chosen. Checkout always uses Express.'}
                </p>
              </div>
              <ToggleSwitch
                checked={sf.economyEnabled}
                onChange={() => update((s) => (s.storefront.economyEnabled = !s.storefront.economyEnabled))}
                disabled={disabled}
                label="Offer Economy delivery"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField label="Postal charge" suffix="LKR / kg" value={sf.economyPostalRatePerKgLKR} saved={sfSaved.economyPostalRatePerKgLKR} onChange={(v) => update((s) => (s.storefront.economyPostalRatePerKgLKR = v))} hint="No separate delivery fee" disabled={disabled} />
            </div>
          </Section>

          <Section title="Exchange rates" description="How many rupees one unit of each currency is worth. Used to convert every store’s prices. LKR is always 1.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(draft.currencyRatesToLKR).map(([code, rate]) => (
                <div key={code} className="flex items-center gap-2 rounded-xl border border-ink/10 bg-parchment/40 px-3 py-2">
                  <span className="w-10 flex-none font-mono text-sm font-semibold text-ink">{code}</span>
                  <span className="flex-none text-xs text-ink/45">1 =</span>
                  <SmallNumber
                    ariaLabel={`${code} rate`}
                    value={rate}
                    saved={saved.currencyRatesToLKR[code]}
                    disabled={disabled || code === 'LKR'}
                    onChange={(v) => update((s) => (s.currencyRatesToLKR[code] = v))}
                  />
                  <span className="flex-none text-xs text-ink/45">LKR</span>
                  {code !== 'LKR' && canEdit && (
                    <button
                      type="button"
                      aria-label={`Remove ${code}`}
                      onClick={() => update((s) => delete s.currencyRatesToLKR[code])}
                      className="flex-none rounded-full p-1 text-ink/35 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={newCurrency.code}
                  maxLength={3}
                  onChange={(e) => setNewCurrency((c) => ({ ...c, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))}
                  placeholder="Code, e.g. AED"
                  className={`${input} !w-auto`} style={{ width: 144 }}
                />
                <input
                  type="number"
                  value={newCurrency.rate}
                  onChange={(e) => setNewCurrency((c) => ({ ...c, rate: e.target.value }))}
                  placeholder="LKR per 1"
                  className={`${input} !w-auto`} style={{ width: 144 }}
                />
                <button
                  type="button"
                  disabled={newCurrency.code.length !== 3 || !(Number(newCurrency.rate) > 0) || newCurrency.code in draft.currencyRatesToLKR}
                  onClick={() => {
                    update((s) => (s.currencyRatesToLKR[newCurrency.code] = Number(newCurrency.rate)))
                    setNewCurrency({ code: '', rate: '' })
                  }}
                  className={btnSmall}
                >
                  <Plus size={12} /> Add currency
                </button>
              </div>
            )}
          </Section>

          <Section title="Local stores and Wishdrop Mall" description="Local Sri Lankan shops skip import costs. The handling fee is charged once per local shop per order.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField label="Local margin" suffix="%" value={draft.local.marginPercent} saved={saved.local.marginPercent} onChange={(v) => update((s) => (s.local.marginPercent = v))} hint="Feed & extractor stores" disabled={disabled} />
              <NumberField label="Local delivery" suffix="LKR" value={draft.local.deliveryFeeLKR} saved={saved.local.deliveryFeeLKR} onChange={(v) => update((s) => (s.local.deliveryFeeLKR = v))} hint="Per item" disabled={disabled} />
              <NumberField label="Handling (pickup)" suffix="LKR" value={draft.local.pickupFeeLKR} saved={saved.local.pickupFeeLKR} onChange={(v) => update((s) => (s.local.pickupFeeLKR = v))} hint="Per local shop, per order" disabled={disabled} />
              <NumberField label="Mall delivery" suffix="LKR" value={draft.mall.deliveryFeeLKR} saved={saved.mall.deliveryFeeLKR} onChange={(v) => update((s) => (s.mall.deliveryFeeLKR = v))} hint="Per item" disabled={disabled} />
            </div>
          </Section>

          <Section title="Customs calculator" description="Used by the quote calculator’s full customs mode (duty, PAL, cess, surcharge, SSCL and VAT by HS code). Not used for storefront prices.">
            <button
              type="button"
              onClick={() => setCustomsOpen((o) => !o)}
              aria-expanded={customsOpen}
              className="flex w-full items-center justify-between rounded-xl border border-ink/10 bg-parchment/60 px-4 py-3 text-left text-sm font-semibold text-ink transition-colors hover:bg-parchment"
            >
              <span className="flex items-center gap-2">
                {customsOpen ? 'Hide' : 'Show'} customs settings
                {!customsOpen && customsChanges > 0 && (
                  <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-semibold text-gold-deep">
                    {customsChanges} unsaved change{customsChanges === 1 ? '' : 's'}
                  </span>
                )}
              </span>
              <ChevronDown size={16} className={`text-ink/40 transition-transform ${customsOpen ? 'rotate-180' : ''}`} />
            </button>

            {customsOpen && (
              <div className="mt-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <NumberField label="Freight" suffix="LKR / kg" value={draft.customs.freightRatePerKgLKR} saved={saved.customs.freightRatePerKgLKR} onChange={(v) => update((s) => (s.customs.freightRatePerKgLKR = v))} disabled={disabled} />
                  <NumberField label="Default weight" suffix="kg" value={draft.customs.defaultWeightKg} saved={saved.customs.defaultWeightKg} onChange={(v) => update((s) => (s.customs.defaultWeightKg = v))} hint="When none is entered" disabled={disabled} />
                </div>

                <div className="mt-5 overflow-x-auto rounded-xl border border-ink/10">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-parchment/70 text-xs font-medium text-ink/50">
                      <tr>
                        <th className="px-3 py-2.5">HS code</th>
                        <th className="px-3 py-2.5">Label</th>
                        {RATE_FIELDS.map((f) => (
                          <th key={f.key} className="px-2 py-2.5">
                            {f.label} %
                          </th>
                        ))}
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(draft.customs.hsCodes).map(([code, r]) => {
                        const savedRow: HsCodeRates | undefined = saved.customs.hsCodes[code]
                        return (
                          <tr key={code} className="border-t border-ink/[0.06]">
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-ink">{code === 'DEFAULT' ? 'Default' : code}</td>
                            <td className="px-3 py-2">
                              <input
                                aria-label={`${code} label`}
                                value={r.label}
                                disabled={disabled}
                                onChange={(e) => update((s) => (s.customs.hsCodes[code].label = e.target.value))}
                                className="w-full min-w-[120px] rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal/60"
                              />
                            </td>
                            {RATE_FIELDS.map((f) => (
                              <td key={f.key} className="w-[86px] px-2 py-2">
                                <SmallNumber
                                  ariaLabel={`${code} ${f.label}`}
                                  value={r[f.key]}
                                  saved={savedRow?.[f.key]}
                                  disabled={disabled}
                                  onChange={(v) => update((s) => (s.customs.hsCodes[code][f.key] = v))}
                                />
                              </td>
                            ))}
                            <td className="px-2">
                              {code !== 'DEFAULT' && canEdit && (
                                <button
                                  type="button"
                                  aria-label={`Remove ${code}`}
                                  onClick={() => update((s) => delete s.customs.hsCodes[code])}
                                  className="rounded-full p-1 text-ink/35 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {canEdit && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input value={newHs.code} maxLength={20} onChange={(e) => setNewHs((h) => ({ ...h, code: e.target.value.trim() }))} placeholder="HS code, e.g. 6204.42" className={`${input} !w-auto`} style={{ width: 176 }} />
                    <input value={newHs.label} maxLength={80} onChange={(e) => setNewHs((h) => ({ ...h, label: e.target.value }))} placeholder="Label, e.g. Cotton dresses" className={`${input} !w-auto`} style={{ width: 240 }} />
                    <button
                      type="button"
                      disabled={!newHs.code || newHs.code in draft.customs.hsCodes}
                      onClick={() => {
                        // Starts from the default rates; adjust in the table.
                        update((s) => (s.customs.hsCodes[newHs.code] = { ...s.customs.hsCodes.DEFAULT, label: newHs.label.trim() }))
                        setNewHs({ code: '', label: '' })
                      }}
                      className={btnSmall}
                    >
                      <Plus size={12} /> Add HS code
                    </button>
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Save bar */}
          {canEdit && (
            <div className={`sticky bottom-4 z-10 flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center ${card} ${changes ? 'shadow-[0_18px_40px_-20px_rgba(32,36,43,0.45)]' : ''}`}>
              <div className="min-w-0 flex-1">
                {problems.length > 0 ? (
                  <p className="text-xs font-semibold text-red-700">Fix {problems.length} field{problems.length === 1 ? '' : 's'} before saving: {problems.slice(0, 3).join(', ')}{problems.length > 3 ? '…' : ''}</p>
                ) : changes ? (
                  <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={`What changed and why (optional) — ${changes} unsaved change${changes === 1 ? '' : 's'}`} className={input} />
                ) : (
                  <p className="text-xs text-ink/50">No unsaved changes.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => window.confirm('Fill the form with the original built-in values? Nothing changes until you save.') && setDraft(clone(data.defaults))}
                  className={btnSecondary}
                  title="Load the values that used to be hardcoded"
                >
                  <RotateCcw size={14} /> Built-in defaults
                </button>
                {changes > 0 && (
                  <button type="button" onClick={() => setDraft(clone(saved))} className={btnSecondary}>
                    Discard
                  </button>
                )}
                <button type="button" onClick={() => void save()} disabled={saving || !changes || problems.length > 0} className={btnPrimary}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Preview + history ── */}
        <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          <PreviewCard saved={saved} draft={draft} preview={preview} setPreview={setPreview} />

          <section className={`p-5 ${card}`}>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <History size={16} className="text-ink/40" /> Recent changes
            </h2>
            {data.history.length === 0 ? (
              <p className="mt-2 text-xs text-ink/50">Nothing saved yet. The site is using the built-in defaults.</p>
            ) : (
              <ol className="mt-3 flex flex-col divide-y divide-ink/[0.06]">
                {data.history.map((h) => {
                  const n = h.previous ? diffCount(h.settings, h.previous) : null
                  return (
                    <li key={h.id} className="py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-ink">{h.changedBy ?? 'Someone'}</p>
                          <p className="text-[11px] text-ink/45">
                            {when(h.changedAt)}
                            {n != null ? ` · ${n} change${n === 1 ? '' : 's'}` : ' · first save'}
                          </p>
                        </div>
                        {canEdit && (
                          <button type="button" onClick={() => setDraft(clone(h.settings))} className={btnLink} title="Load these values into the form (nothing changes until you save)">
                            Load
                          </button>
                        )}
                      </div>
                      {h.note && <p className="mt-1 text-xs text-ink/60">“{h.note}”</p>}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <Link href="/admin/quote" className={`${btnSecondary} w-full`}>
            <Calculator size={14} /> Open the quote calculator
          </Link>
        </aside>
      </div>
    </PageShell>
  )
}

// ---- Preview ---------------------------------------------------------------------

function PreviewCard({
  saved,
  draft,
  preview,
  setPreview,
}: {
  saved: PricingSettings
  draft: PricingSettings
  preview: { price: number; currency: string; weight: number }
  setPreview: (p: { price: number; currency: string; weight: number }) => void
}) {
  // Normalised so a half-typed field can't break the preview.
  const draftSafe = useMemo(() => normalizePricingSettings(draft), [draft])
  const currencies = Object.keys(draft.currencyRatesToLKR)

  const item = { price: preview.price || 0, currency: preview.currency, weightKg: preview.weight || undefined }
  const rows = [
    {
      label: 'Express',
      hint: 'Indian store',
      a: getDualDeliveryPricing(item, saved).express.actualTotalLKR,
      b: getDualDeliveryPricing(item, draftSafe).express.actualTotalLKR,
    },
    {
      label: 'Economy',
      hint: 'Indian store',
      a: getDualDeliveryPricing(item, saved).economy.actualTotalLKR,
      b: getDualDeliveryPricing(item, draftSafe).economy.actualTotalLKR,
    },
    {
      label: 'Local shop',
      hint: `+ ${formatLKR(draftSafe.local.pickupFeeLKR)} handling per order`,
      a: getDualDeliveryPricing({ ...item, origin: 'LK' }, saved).express.actualTotalLKR,
      b: getDualDeliveryPricing({ ...item, origin: 'LK' }, draftSafe).express.actualTotalLKR,
    },
    {
      label: 'Wishdrop Mall',
      hint: 'Price as set + delivery',
      a: getDualDeliveryPricing({ ...item, storeSlug: 'wishdrop-mall' }, saved).express.actualTotalLKR,
      b: getDualDeliveryPricing({ ...item, storeSlug: 'wishdrop-mall' }, draftSafe).express.actualTotalLKR,
    },
  ]

  return (
    <section className={`p-5 ${card}`}>
      <h2 className="font-display text-lg font-semibold text-ink">Preview</h2>
      <p className="mt-0.5 text-xs text-ink/50">What a shopper pays for one item, with the saved numbers and with your changes.</p>
      <div className="mt-4 grid grid-cols-[1fr_88px_80px] gap-2">
        <input
          type="number"
          aria-label="Sample price"
          value={preview.price}
          onChange={(e) => setPreview({ ...preview, price: Number(e.target.value) })}
          className={input}
        />
        <select aria-label="Currency" value={preview.currency} onChange={(e) => setPreview({ ...preview, currency: e.target.value })} className={input}>
          {currencies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <div className="relative">
          <input
            type="number"
            step="0.1"
            aria-label="Weight in kg"
            value={preview.weight}
            onChange={(e) => setPreview({ ...preview, weight: Number(e.target.value) })}
            className={`${input} pr-7`}
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink/40">kg</span>
        </div>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead className="text-[11px] font-medium text-ink/45">
          <tr>
            <th className="pb-2 text-left font-medium" />
            <th className="pb-2 text-right font-medium">Saved</th>
            <th className="pb-2 text-right font-medium">With changes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const delta = Math.round((r.b - r.a) * 100) / 100
            return (
              <tr key={r.label} className="border-t border-ink/[0.06]">
                <td className="py-2.5 pr-2">
                  <p className="font-semibold text-ink">{r.label}</p>
                  <p className="text-[11px] text-ink/45">{r.hint}</p>
                </td>
                <td className="py-2.5 text-right tabular-nums text-ink/55">{formatLKR(r.a)}</td>
                <td className="py-2.5 text-right">
                  <p className="font-semibold tabular-nums text-ink">{formatLKR(r.b)}</p>
                  {delta !== 0 && (
                    <p className={`text-[11px] font-semibold tabular-nums ${delta > 0 ? 'text-gold-deep' : 'text-teal-deep'}`}>
                      {delta > 0 ? '+' : '−'}
                      {formatLKR(Math.abs(delta))}
                    </p>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}