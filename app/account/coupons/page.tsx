// app/account/coupons/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  useLoyalty,
  effectiveCouponStatus,
  isCouponExpiringSoon,
  isCouponNew,
  type Coupon,
  type CouponEffectiveStatus,
} from '@/contexts/Loyaltycontext'

type CouponFilter = 'all' | 'expiringSoon' | 'new' | 'shipping' | 'discount'

const TABS: { key: CouponEffectiveStatus; label: string }[] = [
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

function matchesFilter(coupon: Coupon, filter: CouponFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'expiringSoon':
      return isCouponExpiringSoon(coupon)
    case 'new':
      return isCouponNew(coupon)
    case 'shipping':
      return coupon.category === 'shipping'
    case 'discount':
      return coupon.category === 'discount'
    default:
      return true
  }
}

function CouponCard({ coupon }: { coupon: Coupon }) {
  const discountMain = coupon.discountType === 'percent' ? String(coupon.discountValue) : `${coupon.discountValue}€`
  const discountSuffix = coupon.discountType === 'percent' ? '%OFF' : ' OFF'
  const thresholdLabel = `Orders ${coupon.minOrderValue}€+`
  const scopeLabel = coupon.scope === 'all' ? 'For all products' : 'For selected products'
  const usageLabel = coupon.usageLimit === 'one-time' ? 'one-time use only' : 'multi-use'
  const expiresLabel = `Expires ${new Date(coupon.expiresAt).toLocaleString()}`

  return (
    <div className="flex overflow-hidden rounded-xl border border-rose-200 bg-rose-50/60">
      <div className="flex w-40 flex-none flex-col items-center justify-center gap-1 px-4 py-6 text-center">
        <div className="font-display text-3xl font-bold text-rose-600">
          {discountMain}
          <span className="text-lg align-top">{discountSuffix}</span>
        </div>
        <div className="font-body text-xs font-semibold text-ink/70">{thresholdLabel}</div>
      </div>

      <div className="flex flex-1 items-start justify-between gap-4 border-l border-dashed border-rose-200 px-6 py-5">
        <div>
          <div className="font-body text-base font-bold text-ink">{coupon.title}</div>
          {coupon.maxDiscount !== null && (
            <div className="mt-1 font-body text-sm text-ink/70">
              Capped at <span className="font-semibold text-rose-600">{coupon.maxDiscount}€</span>
            </div>
          )}
          <div className="font-body text-sm text-ink/60">{scopeLabel}</div>
          <div className="font-body text-sm text-ink/60">{usageLabel}</div>

          <button
            type="button"
            className="mt-3 flex items-center gap-1 font-body text-xs text-ink/50 transition-colors hover:text-ink/70"
          >
            {expiresLabel}
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

function CouponsSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <div className="h-9 w-48 animate-pulse rounded bg-ink/10" />
      <div className="mt-8 h-10 animate-pulse rounded bg-ink/5" />
      <div className="mt-6 h-40 animate-pulse rounded-xl bg-ink/5" />
    </div>
  )
}

export default function CouponsPage() {
  const loyalty = useLoyalty()
  const [activeTab, setActiveTab] = useState<CouponEffectiveStatus>('unused')
  const [activeFilter, setActiveFilter] = useState<CouponFilter>('all')

  const visibleCoupons = useMemo(() => {
    return loyalty.coupons.filter(
      (c) => effectiveCouponStatus(c) === activeTab && matchesFilter(c, activeFilter),
    )
  }, [loyalty.coupons, activeTab, activeFilter])

  if (!loyalty.hydrated) {
    return <CouponsSkeleton />
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
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