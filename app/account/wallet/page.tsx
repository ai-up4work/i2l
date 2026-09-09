// app/account/wallet/page.tsx
'use client'

import { CreditCard, FileText, Menu, ChevronRight, HelpCircle } from 'lucide-react'
import { useLoyalty, type CreditTransaction } from '@/contexts/Loyaltycontext'

const HISTORY_COLUMNS = ['Date', 'Type', 'Order No.', 'Amount', 'Status']

function StatCell({
  label,
  value,
  helper,
  hint,
}: {
  label: string
  value: string
  helper?: string
  hint?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <div className="flex items-center gap-1 font-body text-sm text-ink/70">
        {label}
        {hint && <HelpCircle className="h-3.5 w-3.5 text-ink/40" />}
      </div>
      <div className="font-display text-3xl font-bold text-ink">{value}</div>
      {helper && <div className="font-body text-xs text-ink/40">{helper}</div>}
    </div>
  )
}

function formatAmount(amount: number): string {
  const sign = amount >= 0 ? '+' : '−'
  return `${sign}$${Math.abs(amount).toFixed(2)}`
}

function typeLabel(kind: CreditTransaction['kind']): string {
  switch (kind) {
    case 'refund':
      return 'Refund'
    case 'referral':
      return 'Referral bonus'
    case 'used':
      return 'Order payment'
    case 'adjustment':
      return 'Adjustment'
    default:
      return 'Credit'
  }
}

// Pulls an order number out of labels like "Refund: order #WD-1234" —
// falls back to a dash when the label doesn't reference one (referral
// bonuses, manual adjustments).
function orderNoFromLabel(label: string): string {
  const match = label.match(/#(\S+)/)
  return match ? match[1] : '—'
}

function WalletSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
      <div className="h-9 w-48 animate-pulse rounded bg-ink/10" />
      <div className="mt-8 h-6 w-40 animate-pulse rounded bg-ink/10" />
      <div className="mt-4 h-32 animate-pulse rounded-xl bg-ink/[0.04]" />
      <div className="mt-10 h-6 w-40 animate-pulse rounded bg-ink/10" />
      <div className="mt-4 h-48 animate-pulse rounded-xl bg-ink/[0.04]" />
    </div>
  )
}

export default function WalletPage() {
  const loyalty = useLoyalty()

  if (!loyalty.hydrated) {
    return <WalletSkeleton />
  }

  const total = loyalty.credits
  const history = loyalty.creditTransactions

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-ink">
        My Wallet
      </h1>

      {/* Wallet Credit */}
      <div className="mt-8 flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-ink" />
        <h2 className="font-body text-lg font-semibold text-ink">Wallet Credit</h2>
        <button type="button" className="font-body text-sm text-teal-deep hover:underline">
          What&apos;s This?
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 divide-y divide-ink/10 rounded-xl bg-ink/[0.04] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <StatCell label="Total" value={`$${total.toFixed(2)}`} />
        <StatCell
          label="Wallet Credit"
          value={`$${total.toFixed(2)}`}
          helper="Only applicable for future purchases"
          hint
        />
        <StatCell
          label="Available Withdraw"
          value="$0.00"
          helper="Wallet credit can't be withdrawn to a bank"
          hint
        />
      </div>

      {/* Wallet History */}
      <div className="mt-10 flex items-center gap-2">
        <FileText className="h-5 w-5 text-ink" />
        <h2 className="font-body text-lg font-semibold text-ink">Wallet History</h2>
        <button type="button" className="font-body text-sm text-teal-deep hover:underline">
          Contact Us
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-ink/10">
        <div className="grid grid-cols-5 bg-ink/[0.04]">
          {HISTORY_COLUMNS.map((col) => (
            <div
              key={col}
              className="px-4 py-3 font-body text-xs font-bold uppercase tracking-wide text-ink/60"
            >
              {col}
            </div>
          ))}
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <p className="font-body text-sm text-ink/40">- No transactions yet -</p>
          </div>
        ) : (
          <div>
            {history.map((row) => (
              <div key={row.id} className="grid grid-cols-5 border-t border-ink/10">
                <div className="px-4 py-3 font-body text-sm text-ink/80">
                  {new Date(row.timestamp).toLocaleDateString()}
                </div>
                <div className="px-4 py-3 font-body text-sm text-ink/80">{typeLabel(row.kind)}</div>
                <div className="px-4 py-3 font-body text-sm text-ink/80">{orderNoFromLabel(row.label)}</div>
                <div
                  className={`px-4 py-3 font-body text-sm tabular-nums ${
                    row.amount >= 0 ? 'text-teal-deep' : 'text-ink/80'
                  }`}
                >
                  {formatAmount(row.amount)}
                </div>
                <div className="px-4 py-3 font-body text-sm text-ink/80">Completed</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manage */}
      <div className="mt-10 flex items-center gap-2">
        <Menu className="h-5 w-5 text-ink" />
        <h2 className="font-body text-lg font-semibold text-ink">Manage</h2>
      </div>

      <button
        type="button"
        className="mt-4 flex w-full items-center justify-between rounded-xl bg-ink/[0.04] px-5 py-4 text-left transition-colors hover:bg-ink/[0.07]"
      >
        <span className="flex items-center gap-3 font-body text-sm text-ink">
          <CreditCard className="h-4 w-4 text-ink/60" />
          Modify Withdrawl/Refund Account
        </span>
        <ChevronRight className="h-4 w-4 text-ink/40" />
      </button>
    </div>
  )
}