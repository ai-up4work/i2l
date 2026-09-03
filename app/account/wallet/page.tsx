// app/account/wallet/page.tsx
'use client'

import { CreditCard, FileText, Menu, ChevronRight, HelpCircle } from 'lucide-react'

type WalletHistoryRow = {
  id: string
  date: string
  type: string
  orderNo: string
  amount: string
  status: string
}

// TODO: replace with real wallet balances/history once wired to a data source.
const WALLET_TOTALS = {
  total: '0.00',
  unavailable: '0.00',
  availableWithdraw: '0.00',
}

const WALLET_HISTORY: WalletHistoryRow[] = []

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

export default function WalletPage() {
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
        <StatCell label="Total" value={WALLET_TOTALS.total} />
        <StatCell
          label="Unavailable SHEIN Credit"
          value={WALLET_TOTALS.unavailable}
          helper="Only Applicable for SHEIN Purchases"
          hint
        />
        <StatCell label="Available Withdraw SHEIN Credit" value={WALLET_TOTALS.availableWithdraw} hint />
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

        {WALLET_HISTORY.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <p className="font-body text-sm text-ink/40">- No transactions yet -</p>
          </div>
        ) : (
          <div>
            {WALLET_HISTORY.map((row) => (
              <div key={row.id} className="grid grid-cols-5 border-t border-ink/10">
                <div className="px-4 py-3 font-body text-sm text-ink/80">{row.date}</div>
                <div className="px-4 py-3 font-body text-sm text-ink/80">{row.type}</div>
                <div className="px-4 py-3 font-body text-sm text-ink/80">{row.orderNo}</div>
                <div className="px-4 py-3 font-body text-sm text-ink/80">{row.amount}</div>
                <div className="px-4 py-3 font-body text-sm text-ink/80">{row.status}</div>
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