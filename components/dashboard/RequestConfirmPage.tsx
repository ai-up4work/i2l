// RequestConfirmPage.tsx
'use client'

import { useState } from 'react'
import { CircleHelp, Info } from 'lucide-react'
import HelpRail from './HelpRail'
import { calculateQuote } from '@/lib/quote'
import type { Draft } from './types'

const LABEL_TO_SYMBOL: Record<string, string> = {
  'US$': '$',
  'HK$': '$',
  LKR: 'Rs',
  INR: '₹',
}

type RequestConfirmPageProps = {
  draft: Draft
  warehouseLabel?: string
  onCancel: () => void
  onNext: () => void
}

export default function RequestConfirmPage({
  draft,
  warehouseLabel = 'Portland, U.S. (Tax-free)',
  onCancel,
  onNext,
}: RequestConfirmPageProps) {
  const [confirmsRestrictions, setConfirmsRestrictions] = useState(false)
  const [confirmsPreowned, setConfirmsPreowned] = useState(false)
  const canProceed = confirmsRestrictions && confirmsPreowned

  const { subtotal } = calculateQuote({ unitPrice: draft.unitPrice, qty: draft.qty })
  const symbol = LABEL_TO_SYMBOL[draft.currency] ?? draft.currency

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-8 lg:px-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Add a new item request</h1>
        <a href="#faq" className="flex flex-none items-center gap-2 text-sm font-semibold text-ink">
          <CircleHelp size={18} /> FAQ
        </a>
      </div>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 max-w-2xl flex-1 flex-col gap-6">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink/45">
              Overseas warehouse
              <Info size={13} className="text-ink/30" />
            </div>
            <p className="mt-1 text-lg font-semibold text-ink">{warehouseLabel}</p>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-card p-6">
            <h2 className="mb-1 font-display text-xl text-ink">1 item(s) added</h2>

            <div className="mt-3 flex flex-col">
              <div className="flex items-start justify-between gap-5 border-b border-ink/10 py-4">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                    No additional details
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-ink">{draft.name || 'Untitled item'}</p>
                </div>
                <div className="flex-none text-sm font-semibold text-ink">
                  {symbol} {subtotal.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-ink/15 pt-4">
              <span className="flex items-center gap-1.5 font-display text-lg text-ink">
                Subtotal <Info size={13} className="text-ink/30" />
              </span>
              <strong className="font-display text-lg text-ink">
                {symbol} {subtotal.toFixed(2)}
              </strong>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <ConfirmCheckbox checked={confirmsRestrictions} onChange={setConfirmsRestrictions}>
              I confirm the products requested do not violate Buy&amp;Ship&apos;s parcel restrictions or contain any{' '}
              <a href="#prohibited-items" className="font-semibold text-teal-deep hover:underline">
                prohibited items
              </a>
              . I acknowledge the criteria for refunds and returns under Buy&amp;Ship&apos;s{' '}
              <a href="#purchase-protection" className="font-semibold text-teal-deep hover:underline">
                Purchase Protection plan
              </a>
              .
            </ConfirmCheckbox>

            <ConfirmCheckbox checked={confirmsPreowned} onChange={setConfirmsPreowned}>
              I confirm and agree that, as it is not possible to guarantee or verify whether the condition of
              pre-owned items matches the seller&apos;s description, all pre-owned items are not eligible for
              refunds or returns. Fragile items and products sent via standard mail without tracking services are
              also not eligible for refunds or returns.
            </ConfirmCheckbox>
          </div>

          <div className="flex items-center justify-end gap-6 px-1 py-2">
            <button type="button" onClick={onCancel} className="text-sm font-semibold text-ink hover:text-ink/70">
              Cancel
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canProceed}
              className="rounded-xl bg-ink px-7 py-3 text-sm font-semibold text-parchment transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:bg-ink/25"
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

function ConfirmCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 text-[15px] leading-relaxed text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md border-2 border-teal/70 bg-transparent transition-colors duration-150 peer-checked:border-teal peer-checked:bg-teal"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3 scale-0 text-parchment transition-transform duration-150 peer-checked:scale-100" fill="none">
          <path
            d="M3 8.5L6.2 11.5L13 4.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  )
}