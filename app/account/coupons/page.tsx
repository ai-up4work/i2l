// app/account/coupons/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'

type CouponTab = 'unused' | 'used' | 'expired'
type CouponFilter = 'all' | 'expiringSoon' | 'new' | 'shipping' | 'discount'

type Coupon = {
  id: string
  tabs: CouponTab[]
  filters: CouponFilter[]
  discountLabel: string // e.g. "10%" or "5€"
  discountSuffix: string // "OFF"
  thresholdLabel: string // "Orders 29€+"
  title: string // "Product Coupon"
  capLabel?: string // "Capped at 30€"
  scopeLabel: string // "For selected products"
  usageLabel: string // "one-time use only"
  expiresLabel: string // "Expires in 09/29/2026 20:46"
}

// TODO: replace with real coupon data once the coupons API/context lands.
// Shape mirrors sidebar-data/types.ts conventions (plain data + a thin
// render layer) rather than wiring to DashboardContext yet.
const MOCK_COUPONS: Coupon[] = [
  {
    id: 'coupon-1',
    tabs: ['unused'],
    filters: ['all', 'expiringSoon', 'discount'],
    discountLabel: '10',
    discountSuffix: '%OFF',
    thresholdLabel: 'Orders 29€+',
    title: 'Product Coupon',
    capLabel: 'Capped at 30€',
    scopeLabel: 'For selected products',
    usageLabel: 'one-time use only',
    expiresLabel: 'Expires in 09/29/2026 20:46',
  },
]

const TABS: { key: CouponTab; label: string }[] = [
  { key: 'unused', label: 'Unused Coupons' },
  { key: 'used', label: 'Used' },
  { key: 'expired', label: 'Expired Coupons' },
]

const FILTERS: { key: CouponFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expiringSoon', label: 'Expiring Soon' },
  { key: 'new', label: 'New' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'discount', label: 'Discount' },
]

function CouponCard({ coupon }: { coupon: Coupon }) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-rose-200 bg-rose-50/60">
      <div className="flex w-40 flex-none flex-col items-center justify-center gap-1 px-4 py-6 text-center">
        <div className="font-display text-3xl font-bold text-rose-600">
          {coupon.discountLabel}
          <span className="text-lg align-top">{coupon.discountSuffix}</span>
        </div>
        <div className="font-body text-xs font-semibold text-ink/70">{coupon.thresholdLabel}</div>
      </div>

      <div className="flex flex-1 items-start justify-between gap-4 border-l border-dashed border-rose-200 px-6 py-5">
        <div>
          <div className="font-body text-base font-bold text-ink">{coupon.title}</div>
          {coupon.capLabel && (
            <div className="mt-1 font-body text-sm text-ink/70">
              Capped at <span className="font-semibold text-rose-600">{coupon.capLabel.replace('Capped at ', '')}</span>
            </div>
          )}
          <div className="font-body text-sm text-ink/60">{coupon.scopeLabel}</div>
          <div className="font-body text-sm text-ink/60">{coupon.usageLabel}</div>

          <button
            type="button"
            className="mt-3 flex items-center gap-1 font-body text-xs text-ink/50 transition-colors hover:text-ink/70"
          >
            {coupon.expiresLabel}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          className="flex-none rounded-lg bg-ink px-6 py-2.5 font-body text-sm font-bold text-parchment transition-colors hover:bg-ink/85"
        >
          Shop
        </button>
      </div>
    </div>
  )
}

export default function CouponsPage() {
  const [activeTab, setActiveTab] = useState<CouponTab>('unused')
  const [activeFilter, setActiveFilter] = useState<CouponFilter>('all')

  const visibleCoupons = useMemo(() => {
    return MOCK_COUPONS.filter(
      (c) => c.tabs.includes(activeTab) && (activeFilter === 'all' || c.filters.includes(activeFilter))
    )
  }, [activeTab, activeFilter])

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-ink">
        My Coupons
      </h1>

      {/* Tabs */}
      <div className="mt-8 flex items-center gap-8 border-b border-ink/10">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative pb-3 font-body text-base transition-colors ${
                isActive ? 'font-bold text-ink' : 'text-ink/50 hover:text-ink/80'
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>

      {/* Filter pills */}
      <div className="mt-6 flex flex-wrap gap-3">
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              className={`rounded-full border px-4 py-1.5 font-body text-sm transition-colors ${
                isActive
                  ? 'border-ink bg-ink text-parchment'
                  : 'border-ink/20 text-ink/70 hover:border-ink/40 hover:text-ink'
              }`}
            >
              {filter.label}
            </button>
          )
        })}
      </div>

      <h2 className="mt-8 font-body text-base font-bold text-ink">My Coupons</h2>

      <div className="mt-4 flex flex-col gap-4">
        {visibleCoupons.map((coupon) => (
          <CouponCard key={coupon.id} coupon={coupon} />
        ))}
      </div>

      {visibleCoupons.length === 0 && (
        <p className="mt-10 text-center font-body text-sm text-ink/40">- No more content -</p>
      )}
    </div>
  )
}