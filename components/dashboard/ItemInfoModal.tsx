'use client'

import { Loader2, Minus, Plus, TriangleAlert, X } from 'lucide-react'
import { calculateQuote } from '@/lib/quote'
import type { Draft } from './types'

type ItemInfoModalProps = {
  draft: Draft
  onChange: (draft: Draft) => void
  onClose: () => void
  onSave: (event: React.FormEvent) => void
  /** True while /api/scrape is fetching product details for the pasted link. */
  loading?: boolean
  /** Set when the scrape failed — the form still works, just unfilled. */
  lookupError?: string | null
  /** True once a scrape has successfully pre-filled the fields below. */
  autoFilled?: boolean
}

export default function ItemInfoModal({
  draft,
  onChange,
  onClose,
  onSave,
  loading = false,
  lookupError = null,
  autoFilled = false,
}: ItemInfoModalProps) {
  const { subtotal } = calculateQuote({ unitPrice: draft.unitPrice, qty: draft.qty })
  const currencyOptions = Array.from(new Set(['US$', 'LKR', 'HK$', draft.currency].filter(Boolean)))

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-5" role="presentation">
      <form
        onSubmit={onSave}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-paper shadow-lift"
      >
        <div className="flex items-center justify-between border-b border-ink/10 p-6">
          <h2 className="font-display text-2xl text-ink">Item information</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-ink/60 hover:text-ink">
            <X />
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-auto p-7">
          <label className="flex flex-col gap-2.5 text-sm font-semibold text-ink">
            Item URL
            <div className="max-h-20 overflow-hidden rounded-xl border border-ink/15 bg-card p-4 text-[13px] font-normal leading-relaxed text-muted">
              {draft.url || 'https://www.store.com/product-link'}
            </div>
          </label>

          {loading && (
            <div className="flex items-center gap-2.5 rounded-xl bg-gold-soft/60 px-4 py-3 text-sm font-semibold text-ink">
              <Loader2 size={16} className="animate-spin text-rust" />
              Reading the product page — name, image, and price will fill in automatically.
            </div>
          )}

          {!loading && lookupError && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rust/10 px-4 py-3 text-sm text-ink">
              <TriangleAlert size={16} className="mt-0.5 flex-none text-rust" />
              <span>
                <b className="font-semibold text-rust">Couldn&apos;t auto-fill this one.</b> {lookupError} You can
                still enter the details by hand below.
              </span>
            </div>
          )}

          {!loading && !lookupError && autoFilled && (
            <div className="rounded-xl bg-gold-soft/60 px-4 py-3 text-sm font-semibold text-ink">
              Filled in from the product page — double-check the price and edit anything that needs it.
            </div>
          )}

          <label className="flex flex-col gap-2.5 text-sm font-semibold text-ink">
            Item name <b className="text-rust">*</b>
            <textarea
              required
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              placeholder="Enter the product name"
              className="min-h-[110px] resize-y rounded-xl border border-ink/15 bg-paper p-4 text-sm font-normal outline-none focus:ring-2 focus:ring-gold/50"
            />
          </label>

          <label className="flex flex-col gap-2.5 text-sm font-semibold text-ink">
            Image <span className="text-xs font-normal text-muted">(for reference only; specifications entered will be used)</span>
            <div className="flex min-h-[125px] items-center justify-center gap-4 rounded-xl border border-dashed border-ink/25 text-sm text-muted">
              <img src={draft.image} alt="Product reference" className="h-[82px] w-[82px] rounded-lg object-cover" />
              <span>Click to upload or drag an image here</span>
            </div>
          </label>

          <div className="flex items-center justify-between font-semibold text-ink">
            <span>Quantity</span>
            <div className="flex items-center gap-3.5 rounded-xl border border-ink/15 px-2.5 py-1.5">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => onChange({ ...draft, qty: Math.max(1, draft.qty - 1) })}
                className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 hover:bg-ink/5"
              >
                <Minus size={15} />
              </button>
              <span className="min-w-[20px] text-center font-bold">{draft.qty}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => onChange({ ...draft, qty: draft.qty + 1 })}
                className="grid h-7 w-7 place-items-center rounded-md border border-ink/15 hover:bg-ink/5"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          <label className="flex flex-col gap-2.5 text-sm font-semibold text-ink">
            Unit price (Discounted) <b className="text-rust">*</b>
            <div className="flex gap-2.5">
              <select
                value={draft.currency}
                onChange={(event) => onChange({ ...draft, currency: event.target.value })}
                className="rounded-xl border border-ink/15 bg-card px-3 font-semibold"
              >
                {currencyOptions.map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                required
                value={draft.unitPrice || ''}
                onChange={(event) => onChange({ ...draft, unitPrice: Number(event.target.value) })}
                placeholder="0"
                className="flex-1 rounded-xl border border-ink/15 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-gold/50"
              />
            </div>
          </label>
        </div>

        <div className="flex items-end gap-5 border-t border-ink/10 p-7">
          <div className="flex-1">
            <span className="block text-sm text-muted">Item Subtotal</span>
            <strong className="mt-1.5 block font-display text-2xl text-rust">
              {draft.currency}
              {subtotal.toFixed(2)}
            </strong>
          </div>
          <button
            type="submit"
            className="min-w-[110px] rounded-xl bg-ink px-6 py-3.5 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
