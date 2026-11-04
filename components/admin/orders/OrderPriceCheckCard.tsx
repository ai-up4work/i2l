// components/admin/orders/OrderPriceCheckCard.tsx
//
// Admin order page, right column: "Price check".
//
// Pasted links are priced at the store's weight when it gives one, or the
// shopper's weight category / typed weight otherwise (lib/weight-estimate.ts).
// Checkout flags those orders. Here staff:
//   - see each item's weight (and where it came from) and price,
//   - type the real weight → the item is re-priced with the pricing engine,
//     or type a price by hand,
//   - preview the new total, then save. The customer is told in the app,
//     by push and in their order chat (unless "Tell the customer" is off).
// Only while the order is unpaid. Data: /api/admin/orders/[orderId]/price-check.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Scale } from 'lucide-react'
import { formatKg } from '@/lib/weight-estimate'

type WeightSource = 'store' | 'category' | 'custom' | 'default' | 'staff'

type Item = {
  id: string
  title: string
  variant: string | null
  qty: number
  unitPriceLKR: number
  link: string | null
  weightKg: number | null
  weightSource: WeightSource | null
  weightEstimated: boolean
  priceVerified: boolean
  priceSource: string | null
  sourcePrice: number | null
  sourceCurrency: string | null
  canRepriceByWeight: boolean
}

type Check = {
  orderId: string
  displayId: string
  priceReview: boolean
  checkedAt: string | null
  delivery: 'express' | 'economy'
  totalLKR: number
  discountLKR: number
  pickupLKR: number
  paymentStatus: string
  fromCheckout: boolean
  lockedReason: string | null
  items: Item[]
}

type Preview = { items: { itemId: string; unitPriceLKR: number; changed: boolean }[]; totalLKR: number; previousTotalLKR: number }

const lkr = (v: number) => `Rs. ${v.toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const SOURCE_LABEL: Record<WeightSource, string> = {
  store: 'From the store (+ packaging)',
  category: 'Customer’s category',
  custom: 'Customer typed it',
  default: 'Standard estimate',
  staff: 'Checked by staff',
}

function storePrice(item: Item): string | null {
  if (item.sourcePrice == null) return null
  const code = item.sourceCurrency || 'INR'
  try {
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(item.sourcePrice)
  } catch {
    return `${code} ${item.sourcePrice}`
  }
}

type Draft = Record<string, { weight: string; price: string }>

export default function OrderPriceCheckCard({ orderId, onSaved }: { orderId: string; onSaved?: () => void }) {
  const [check, setCheck] = useState<Check | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<{ text: string } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/admin/orders/${orderId}/price-check`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Could not load the price check')
        setCheck(body.check as Check)
        setDraft({})
        setPreview(null)
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [orderId])
  useEffect(load, [load])

  const changes = useMemo(
    () =>
      Object.entries(draft)
        .map(([itemId, d]) => ({
          itemId,
          weightKg: d.price.trim() === '' && d.weight.trim() !== '' ? Number(d.weight) : null,
          unitPriceLKR: d.price.trim() !== '' ? Number(d.price) : null,
        }))
        .filter((c) => c.weightKg != null || c.unitPriceLKR != null),
    [draft],
  )

  // Live preview of the new prices, a moment after typing stops.
  useEffect(() => {
    if (!check || check.lockedReason || changes.length === 0) {
      setPreview(null)
      setPreviewError(null)
      return
    }
    const t = setTimeout(() => {
      setPreviewing(true)
      fetch(`/api/admin/orders/${orderId}/price-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', changes }),
      })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(body.error ?? 'Could not work out the new price')
          setPreview(body.preview as Preview)
          setPreviewError(null)
        })
        .catch((e: Error) => {
          setPreview(null)
          setPreviewError(e.message)
        })
        .finally(() => setPreviewing(false))
    }, 400)
    return () => clearTimeout(t)
  }, [changes, check, orderId])

  async function save() {
    if (!check) return
    setSaving(true)
    setSaveError(null)
    setSaved(null)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/price-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', changes, note }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not save')
      const moved = body.totalLKR !== body.previousTotalLKR
      setSaved({
        text: `${moved ? `Total is now ${lkr(body.totalLKR)} (was ${lkr(body.previousTotalLKR)}).` : `Prices confirmed at ${lkr(body.totalLKR)}.`}${
          body.notified ? ' The customer has been told. You can now send the payment request.' : ''
        }`,
      })
      setCheck(body.check as Check)
      setDraft({})
      setPreview(null)
      setNote('')
      onSaved?.()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const shell = (children: React.ReactNode, tone: 'gold' | 'plain' = 'plain') => (
    <section className={`mb-4 rounded-2xl border p-5 ${tone === 'gold' ? 'border-gold/40 bg-gold/[0.06]' : 'border-ink/10 bg-card'}`}>
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <Scale size={16} className="text-teal-deep" /> Price check
      </h2>
      {children}
    </section>
  )

  if (loadError) return shell(<p className="mt-2 text-sm text-rose-700">{loadError}</p>)
  if (!check) return shell(<p className="mt-3 flex items-center gap-2 text-sm text-ink/50"><Loader2 size={14} className="animate-spin" /> Loading…</p>)
  // Request orders are priced on the request page.
  if (!check.fromCheckout || !check.items.length) return null

  const editable = !check.lockedReason
  const previewById = new Map((preview?.items ?? []).map((p) => [p.itemId, p]))
  const hasChanges = changes.length > 0
  const anyEstimated = check.items.some((i) => i.weightEstimated || !i.priceVerified)

  return shell(
    <>
      <p className="mt-1 text-xs leading-relaxed text-ink/55">
        {check.priceReview ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-gold-deep">
            <AlertTriangle size={12} /> Confirm the final price first — no payment can be requested or recorded until you do.
          </span>
        ) : check.checkedAt ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-teal-deep">
            <CheckCircle2 size={12} /> Checked {new Date(check.checkedAt).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' })}.
          </span>
        ) : (
          'Prices came from the store.'
        )}{' '}
        {anyEstimated && 'Weights marked “estimated” were picked by the customer or guessed — enter the real weight to re-price.'}
      </p>

      {check.lockedReason && <p className="mt-3 rounded-xl bg-ink/[0.04] px-3 py-2 text-xs text-ink/60">{check.lockedReason}</p>}

      <ul className="mt-4 space-y-3">
        {check.items.map((item) => {
          const d = draft[item.id] ?? { weight: '', price: '' }
          const p = previewById.get(item.id)
          const sp = storePrice(item)
          return (
            <li key={item.id} className="rounded-xl border border-ink/10 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-semibold text-ink">{item.title}</p>
                <span className="flex-none text-xs tabular-nums text-ink/50">×{item.qty}</span>
              </div>
              {item.variant && <p className="text-xs text-ink/50">{item.variant}</p>}

              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-ink/45">Weight</dt>
                <dd className="text-right text-ink/75">
                  {item.weightKg != null ? <span className="font-semibold tabular-nums">{formatKg(item.weightKg)}</span> : '—'}
                  {item.weightSource && (
                    <span className={`ml-1 ${item.weightEstimated ? 'text-gold-deep' : 'text-ink/45'}`}>
                      · {SOURCE_LABEL[item.weightSource]}
                      {item.weightEstimated ? ' (estimated)' : ''}
                    </span>
                  )}
                </dd>
                {sp && (
                  <>
                    <dt className="text-ink/45">Store price</dt>
                    <dd className="text-right tabular-nums text-ink/75">{sp}</dd>
                  </>
                )}
                <dt className="text-ink/45">Price each</dt>
                <dd className="text-right tabular-nums text-ink">
                  {p?.changed ? (
                    <>
                      <span className="text-ink/40 line-through">{lkr(item.unitPriceLKR)}</span>{' '}
                      <span className="font-semibold text-teal-deep">{lkr(p.unitPriceLKR)}</span>
                    </>
                  ) : (
                    <span className="font-semibold">{lkr(item.unitPriceLKR)}</span>
                  )}
                </dd>
                {!item.priceVerified && (
                  <dd className="col-span-2 text-[11px] font-medium text-gold-deep">Store price couldn’t be confirmed at checkout — check it on the store.</dd>
                )}
              </dl>

              {editable && (
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-ink/50">Real weight (kg)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0.01}
                      disabled={!item.canRepriceByWeight || d.price.trim() !== ''}
                      value={d.weight}
                      placeholder={item.canRepriceByWeight ? (item.weightKg != null ? String(item.weightKg) : 'e.g. 0.8') : 'n/a'}
                      title={item.canRepriceByWeight ? undefined : 'No store price saved for this item — set the price instead.'}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [item.id]: { ...d, weight: e.target.value } }))}
                      className="w-full rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15 disabled:bg-ink/[0.03] disabled:text-ink/40"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-ink/50">Or price each (LKR)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="1"
                      min={1}
                      value={d.price}
                      placeholder={String(Math.round(item.unitPriceLKR))}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [item.id]: { ...d, price: e.target.value } }))}
                      className="w-full rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
                    />
                  </label>
                </div>
              )}

              {item.link && /^https?:\/\//i.test(item.link) && (
                <a href={item.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-deep hover:underline">
                  Open on the store <ExternalLink size={11} />
                </a>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-4 rounded-xl bg-parchment px-3 py-2.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-ink/60">Order total</span>
          <span className="tabular-nums">
            {preview && preview.totalLKR !== preview.previousTotalLKR ? (
              <>
                <span className="text-ink/40 line-through">{lkr(preview.previousTotalLKR)}</span>{' '}
                <span className="font-bold text-ink">{lkr(preview.totalLKR)}</span>
              </>
            ) : (
              <span className="font-bold text-ink">{lkr(check.totalLKR)}</span>
            )}
          </span>
        </div>
        {(check.discountLKR > 0 || check.pickupLKR > 0) && (
          <p className="mt-0.5 text-[11px] text-ink/45">
            Includes {check.pickupLKR > 0 ? `${lkr(check.pickupLKR)} handling` : ''}
            {check.pickupLKR > 0 && check.discountLKR > 0 ? ' and ' : ''}
            {check.discountLKR > 0 ? `−${lkr(check.discountLKR)} coupon (unchanged)` : ''}.
          </p>
        )}
        {previewing && <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink/45"><Loader2 size={11} className="animate-spin" /> Working out the new price…</p>}
        {previewError && <p className="mt-1 text-[11px] font-medium text-rose-700">{previewError}</p>}
      </div>

      {editable && (
        <div className="mt-3 space-y-2.5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={2}
            placeholder="Note for the customer (optional), e.g. “Weighed with the box: 1.1 kg.”"
            className="w-full resize-none rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none placeholder:text-ink/35 focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
          />
          <p className="text-[11px] leading-snug text-ink/50">
            The customer is told the final total in the app, by push and in their order chat. Then send the payment request below.
          </p>
          {saveError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{saveError}</p>}
          <button
            type="button"
            onClick={save}
            disabled={saving || (hasChanges && (!preview || !!previewError || previewing))}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {hasChanges ? 'Save final price & tell the customer' : 'Confirm price & tell the customer'}
          </button>
        </div>
      )}

      {saved && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-teal/[0.07] px-3 py-2 text-xs font-medium text-teal-deep ring-1 ring-teal/20">
          <CheckCircle2 size={13} className="mt-px flex-none" /> {saved.text}
        </p>
      )}
    </>,
    check.priceReview ? 'gold' : 'plain',
  )
}
