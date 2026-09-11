// app/seller/catalogue/[catalogueId]/page.tsx
'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check, Clock } from 'lucide-react'

import { getCatalogueEntry, getCurrentSellerId, submitChangeRequest } from '@/data/catalogues/data'
import { panelClass, groupClass, inputClass, Field, SectionHeading } from '@/components/admin/seller/shared'

// ---------------------------------------------------------------------------
// /seller/catalogue/[catalogueId] — Seller Dashboard
//
// Deliberately narrow: cost price + availability only. Never renders
// sellingPrice, markupPercent, or any margin/profit number — those stay
// admin/manager-only. Title/description/images/category are read-only
// here; changing them goes through Sales & Purchase, not this form.
//
// Submitting queues a CatalogueChangeRequest for admin/manager approval
// (§ decision) rather than writing live — the seller sees "Awaiting
// review" until it's actioned, matching the pending badge shown on
// /seller/catalogue's list.
// ---------------------------------------------------------------------------

export default function SellerCatalogueEditPage() {
  const router = useRouter()
  const params = useParams<{ catalogueId: string }>()
  const sellerId = getCurrentSellerId() // TODO(wire-up): real seller session
  const entry = getCatalogueEntry(params.catalogueId)

  const [costPrice, setCostPrice] = useState(entry?.costPrice ?? 0)
  const [inStock, setInStock] = useState(entry?.inStock ?? true)
  const [variants, setVariants] = useState(
    entry?.variants?.map((v) => ({ id: v.id, title: v.title, costPrice: v.costPrice, available: v.available })) ?? []
  )
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (!entry || entry.sellerId !== sellerId) {
    // Structural scoping: a seller can never open another seller's
    // catalogue entry, even by guessing an id in the URL.
    return (
      <div className="min-h-screen bg-parchment font-body text-ink">
        <div className="mx-auto max-w-xl px-6 pb-20 pt-16 text-center lg:px-10">
          <p className="text-sm text-ink/50">This listing isn&rsquo;t available.</p>
          <button
            type="button"
            onClick={() => router.push('/seller/catalogue')}
            className="mt-4 text-sm font-semibold text-teal-deep hover:underline"
          >
            Back to your listings
          </button>
        </div>
      </div>
    )
  }

  const updateVariant = (id: string, patch: Partial<{ costPrice: number; available: boolean }>) =>
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  const hasChanges =
    costPrice !== entry.costPrice ||
    inStock !== entry.inStock ||
    variants.some((v) => {
      const orig = entry.variants?.find((ev) => ev.id === v.id)
      return orig && (orig.costPrice !== v.costPrice || orig.available !== v.available)
    })

  const handleSubmit = () => {
    if (!hasChanges) return
    setSubmitting(true)
    submitChangeRequest(
      entry.id,
      'seller',
      {
        costPrice: costPrice !== entry.costPrice ? costPrice : undefined,
        inStock: inStock !== entry.inStock ? inStock : undefined,
        variants: variants.filter((v) => {
          const orig = entry.variants?.find((ev) => ev.id === v.id)
          return orig && (orig.costPrice !== v.costPrice || orig.available !== v.available)
        }),
      },
      note || undefined,
      entry.sellerId // TODO(wire-up): real seller display name
    )
    window.setTimeout(() => {
      setSubmitting(false)
      setSubmitted(true)
    }, 500)
  }

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-2xl px-6 pb-24 pt-10 lg:px-10">
        <button
          type="button"
          onClick={() => router.push('/seller/catalogue')}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink/50 transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} />
          Your listings
        </button>

        <h1 className="mt-4 font-display text-3xl text-ink">{entry.title}</h1>
        <p className="mt-1.5 text-sm text-ink/60">
          Update your cost price or availability. Changes are reviewed by WishDrop before they go live.
        </p>

        {entry.pendingChange && (
          <div className={`mt-6 flex items-center gap-2 p-4 text-sm font-semibold text-gold-deep border-gold-deep/25 ${groupClass}`}>
            <Clock size={16} />
            A change is already awaiting review — submitting again will replace it.
          </div>
        )}

        {submitted ? (
          <div className={`mt-6 flex items-center gap-2 p-4 text-sm font-semibold text-teal-deep ${groupClass} border-teal-deep/25`}>
            <Check size={16} />
            Submitted for review. WishDrop will approve or follow up with you shortly.
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
              <SectionHeading title="Cost & availability" subtitle="What you charge WishDrop for this product, and whether it's currently in stock." />

              <Field label="Cost price" required>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={costPrice || ''}
                    onChange={(e) => setCostPrice(Number(e.target.value) || 0)}
                    className={inputClass}
                  />
                  <span className="flex-none text-sm font-semibold text-ink/40">{entry.currency}</span>
                </div>
              </Field>

              <label className="flex items-center gap-2.5 text-sm font-semibold text-ink/70">
                <input
                  type="checkbox"
                  checked={inStock}
                  onChange={(e) => setInStock(e.target.checked)}
                  className="h-4 w-4 rounded border-ink/30 text-teal-deep focus:ring-teal/40"
                />
                In stock for Sri Lanka orders
              </label>

              {variants.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-ink/10 pt-4">
                  <p className="text-xs font-semibold text-ink/50">Variants</p>
                  {variants.map((v) => (
                    <div key={v.id} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-ink/10 bg-white p-3 sm:grid-cols-[1.4fr_1fr_auto]">
                      <span className="text-sm font-medium text-ink/70">{v.title}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={v.costPrice || ''}
                          onChange={(e) => updateVariant(v.id, { costPrice: Number(e.target.value) || 0 })}
                          className={inputClass}
                        />
                        <span className="flex-none text-xs font-semibold text-ink/40">{entry.currency}</span>
                      </div>
                      <label className="flex items-center justify-center gap-1.5 text-xs font-semibold text-ink/55">
                        <input
                          type="checkbox"
                          checked={v.available}
                          onChange={(e) => updateVariant(v.id, { available: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-ink/30 text-teal-deep focus:ring-teal/40"
                        />
                        Available
                      </label>
                    </div>
                  ))}
                </div>
              )}

              <Field label="Note to WishDrop (optional)">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Why this change? e.g. supplier price increase, restocked, seasonal item ending..."
                  className={inputClass}
                />
              </Field>
            </section>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!hasChanges || submitting}
                className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none"
              >
                {submitting ? 'Submitting...' : 'Submit for review'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}