// app/account/points/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { HelpCircle } from 'lucide-react'

type PointsFilter = 'all' | 'earned' | 'used' | 'expired'

type PointsTransaction = {
  id: string
  filter: Exclude<PointsFilter, 'all'>
  label: string
  date: string
  amount: number // positive for earned, negative for used/expired
}

const FILTERS: { key: PointsFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'earned', label: 'Earned' },
  { key: 'used', label: 'Used' },
  { key: 'expired', label: 'Expired' },
]

// TODO: replace with real points data/context once available.
const MOCK_TRANSACTIONS: PointsTransaction[] = []

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <svg
        width="72"
        height="72"
        viewBox="0 0 72 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-ink/25"
        aria-hidden="true"
      >
        <rect x="18" y="10" width="36" height="46" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M26 22h20M26 30h20M26 38h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="50" cy="52" r="12" fill="white" stroke="currentColor" strokeWidth="1.5" />
        <path d="M50 46v6l4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 20l2 2M60 16l-2 2M16 44l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="font-body text-sm text-ink/40">It is empty here :-(</p>
    </div>
  )
}

function TransactionRow({ tx }: { tx: PointsTransaction }) {
  const isPositive = tx.amount > 0
  return (
    <div className="flex items-center justify-between border-b border-ink/10 py-4 last:border-0">
      <div>
        <div className="font-body text-sm font-bold text-ink">{tx.label}</div>
        <div className="mt-0.5 font-body text-xs text-ink/50">{tx.date}</div>
      </div>
      <div
        className={`font-body text-sm font-bold ${isPositive ? 'text-teal-deep' : 'text-ink/60'}`}
      >
        {isPositive ? '+' : ''}
        {tx.amount}
      </div>
    </div>
  )
}

export default function PointsPage() {
  const [activeFilter, setActiveFilter] = useState<PointsFilter>('all')

  // TODO: derive from real balances once wired to a data source.
  const totalPoints = 0
  const expiringSoon = 0

  const visibleTransactions = useMemo(() => {
    if (activeFilter === 'all') return MOCK_TRANSACTIONS
    return MOCK_TRANSACTIONS.filter((tx) => tx.filter === activeFilter)
  }, [activeFilter])

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-10">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-ink">
          My Points
        </h1>
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1 font-body text-sm text-ink/60 transition-colors hover:text-ink"
        >
          Learn about SHEIN points
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-8 grid grid-cols-2 divide-x divide-ink/10 rounded-xl bg-ink/[0.04] py-10">
        <div className="flex flex-col items-center gap-1">
          <div className="font-display text-4xl font-bold text-rose-600">{totalPoints}</div>
          <div className="font-body text-sm text-ink/70">Total Points</div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="font-display text-4xl font-bold text-rose-600">{expiringSoon}</div>
          <div className="flex items-center gap-1 font-body text-sm text-ink/70">
            Points expiring soon
            <HelpCircle className="h-3.5 w-3.5 text-ink/40" />
          </div>
        </div>
      </div>

      <h2 className="mt-10 font-body text-sm font-bold uppercase tracking-wide text-ink">
        Points Details
      </h2>

      <div className="mt-4 flex items-center gap-8 border-b border-ink/10">
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              className={`relative pb-3 font-body text-sm transition-colors ${
                isActive ? 'font-bold text-ink' : 'text-ink/50 hover:text-ink/80'
              }`}
            >
              {filter.label}
              {isActive && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>

      {visibleTransactions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-2">
          {visibleTransactions.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))}
        </div>
      )}
    </div>
  )
}