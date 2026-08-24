'use client'

import { CircleHelp, ClipboardList, ChevronRight, FileText, Pencil, Ticket, Truck, Wallet } from 'lucide-react'
import HelpRail from './HelpRail'
import { EXCHANGE_RATE, calculateQuote } from '@/lib/quote'
import type { Draft } from './types'

type RequestPreviewPageProps = {
  draft: Draft
  promoCode: string
  setPromoCode: (value: string) => void
  onCancel: () => void
  onNext: () => void
}

export default function RequestPreviewPage({ draft, promoCode, setPromoCode, onCancel, onNext }: RequestPreviewPageProps) {
  const { subtotal, localShippingFee, serviceFee, estimatedFeeUsd, estimatedTotalLkr } = calculateQuote({
    unitPrice: draft.unitPrice,
    qty: draft.qty,
  })

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-8 lg:px-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Request Preview</h1>
        <a href="#faq" className="flex flex-none items-center gap-2 text-sm font-semibold text-ink">
          <CircleHelp size={18} /> FAQ
        </a>
      </div>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 max-w-2xl flex-1 flex-col gap-5">
          <div className="grid place-items-center rounded-2xl border border-ink/10 bg-card p-6">
            <img src={draft.image} alt={draft.name || 'Item preview'} className="max-h-[150px] object-contain" />
          </div>

          <Card
            icon={ClipboardList}
            title="Item Details"
            onEdit={onCancel}
            editLabel="Edit item details"
          >
            <Row label="Item name" icon={FileText}>
              <div className="text-right">
                {draft.name || 'Untitled item'}
                <a href="#product" className="mt-2 flex items-center justify-end gap-1 text-xs font-bold uppercase tracking-wide text-rust">
                  View product page <ChevronRight size={13} />
                </a>
              </div>
            </Row>
            <PlainRow label="Quantity" value={String(draft.qty)} />
            <PlainRow label="Unit price (discounted)" value={`${draft.currency} ${draft.unitPrice.toFixed(2)}`} />
            <TotalRow label="Subtotal" value={`${draft.currency} ${subtotal.toFixed(2)}`} />
          </Card>

          <Card icon={Ticket} title="Promo Code">
            <div className="flex gap-2.5 pt-3">
              <input
                value={promoCode}
                onChange={(event) => setPromoCode(event.target.value)}
                placeholder="Enter a promo code"
                className="flex-1 rounded-xl border border-ink/15 px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-gold/50"
              />
              <button
                type="button"
                disabled={!promoCode.trim()}
                className="rounded-xl bg-ink px-6 font-semibold text-paper transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:bg-ink/25"
              >
                Use
              </button>
            </div>
          </Card>

          <Card icon={Wallet} title="Fee Details" onEdit={() => {}} editLabel="Edit fee details">
            <PlainRow label={`Subtotal (${draft.qty} pcs)`} value={`${draft.currency} ${subtotal.toFixed(2)}`} muted />
            <PlainRow label="Local Shipping Fee (Estimated)" value={`${draft.currency} ${localShippingFee.toFixed(2)}`} muted />
            <PlainRow label="Service fee" value={`${draft.currency} ${serviceFee.toFixed(2)}`} muted />
            <TotalRow label="Estimated Fee (USD)" value={`${draft.currency} ${estimatedFeeUsd.toFixed(2)}`} />

            <div className="mt-1.5 rounded-xl bg-gold-soft/60 p-4">
              <div className="flex items-center justify-between font-display text-lg text-ink">
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  Estimated Total <CircleHelp size={13} className="text-muted" />
                </span>
                <strong>LKR {estimatedTotalLkr.toLocaleString()}</strong>
              </div>
              <small className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                Exchange rate <CircleHelp size={12} /> {draft.currency} 1 &asymp; LKR {EXCHANGE_RATE}
              </small>
            </div>

            <div className="mt-4 rounded-xl bg-gold-soft/40 p-4">
              <b className="mb-2 block text-sm text-ink">Notes for other fees</b>
              <p className="text-[13px] leading-relaxed text-ink/70">
                There may be a local shipping fee (charged by the seller) or an additional fee for hot /
                difficult-to-buy items. If any, the fees charged will be listed in the Fee Details when the item
                request is ready to pay.
              </p>
            </div>
          </Card>

          <Card icon={Truck} title="Shipping Details" onEdit={() => {}} editLabel="Edit shipping details">
            <PlainRow label="Overseas warehouse" value="Colombo, Sri Lanka (Tax-free)" />
            <PlainRow label="Shipment type" value="Flexible" />
          </Card>

          <div className="flex items-center justify-end gap-6 px-1 py-2">
            <button type="button" onClick={onCancel} className="text-sm font-semibold text-ink hover:text-ink/70">
              Cancel
            </button>
            <button
              type="button"
              onClick={onNext}
              className="rounded-xl bg-ink px-7 py-3 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
            >
              Next
            </button>
          </div>
        </div>

        <HelpRail />
      </div>
    </div>
  )
}

function Card({
  icon: Icon,
  title,
  onEdit,
  editLabel,
  children,
}: {
  icon: typeof ClipboardList
  title: string
  onEdit?: () => void
  editLabel?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-card p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <Icon size={18} className="text-rust" />
        <h3 className="flex-1 font-display text-lg text-ink">{title}</h3>
        {onEdit && (
          <button type="button" aria-label={editLabel} onClick={onEdit} className="text-ink/50 hover:text-ink">
            <Pencil size={15} />
          </button>
        )}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  )
}

function Row({ label, icon: Icon, children }: { label: string; icon: typeof FileText; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-5 border-b border-ink/10 py-3">
      <span className="flex flex-none items-center gap-1.5 text-sm text-muted">
        <Icon size={14} /> {label}
      </span>
      <div className="text-sm font-semibold text-ink">{children}</div>
    </div>
  )
}

function PlainRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-ink/10 py-3 last:border-0">
      <span className={`text-sm ${muted ? 'text-muted' : 'text-ink/70'}`}>{label}</span>
      <b className={`text-sm ${muted ? 'font-medium text-muted' : 'font-semibold text-ink'}`}>{value}</b>
    </div>
  )
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1 flex items-center justify-between border-t border-ink/15 pt-4 text-[15px] font-bold text-ink">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}
