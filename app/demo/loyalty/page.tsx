// app/demo/loyalty/page.tsx
'use client'

import { useState } from 'react'
import {
  Sparkles,
  Smartphone,
  Share2,
  CalendarCheck,
  PackageCheck,
  Gift,
  RotateCcw,
} from 'lucide-react'

import { useLoyalty, CHECK_IN_POINTS, MILESTONE_POINTS } from '@/contexts/Loyaltycontext'
import { POINTS_PER_CURRENCY_UNIT } from '@/lib/loyaltyPoints'

// ---------------------------------------------------------------------------
// Every trigger here maps 1:1 to a real earning rule from lib/loyaltyPoints.ts.
// The four milestone buttons will only ever pay out ONCE per account, ever —
// click them repeatedly and watch the log show "already claimed" after the
// first hit. That's the point (pun intended): there's no cap to configure,
// because the claimed-flag itself is the cap.
// ---------------------------------------------------------------------------

const MOCK_ORDER_TOTAL = 48 // pretend delivered-order total

type LogEntry = { id: string; label: string; delta: number; at: number; blocked?: boolean }

export default function LoyaltyDemoPage() {
  const loyalty = useLoyalty()
  const [log, setLog] = useState<LogEntry[]>([])
  const [manualAmount, setManualAmount] = useState('100')
  const [deliveredOrderCount, setDeliveredOrderCount] = useState(0)

  const pushLog = (label: string, delta: number, blocked?: boolean) => {
    setLog((prev) =>
      [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label, delta, at: Date.now(), blocked }, ...prev].slice(0, 14),
    )
  }

  // Simulates a delivered order: awards spend-linked points via a fake
  // order id (so repeat clicks are genuinely different orders, not a
  // dedup-triggered no-op), then checks the 5-orders milestone.
  const runDeliveredOrder = () => {
    const fakeOrder = {
      id: `WD-DEMO-${Date.now()}`,
      date: new Date().toLocaleDateString(),
      status: 'Delivered' as const,
      currency: 'INR' as const,
      items: [{ name: 'Demo item', qty: 1, unitPrice: MOCK_ORDER_TOTAL, image: '' }],
    }
    const isFirst = deliveredOrderCount === 0
    const awarded = loyalty.addOrderPoints(fakeOrder)
    pushLog(`Order delivered ($${MOCK_ORDER_TOTAL})`, awarded)

    if (isFirst) {
      const bonus = loyalty.claimMilestone('firstPurchase')
      if (bonus > 0) pushLog('Milestone: first purchase', bonus)
    }

    const nextCount = deliveredOrderCount + 1
    setDeliveredOrderCount(nextCount)
    const milestoneBonus = loyalty.claimFiveOrdersMilestoneIfReached(nextCount)
    if (milestoneBonus > 0) pushLog('Milestone: 5 orders completed', milestoneBonus)
  }

  const runMobileVerified = () => {
    const awarded = loyalty.claimMilestone('mobileVerified')
    pushLog('Mobile number verified', awarded, awarded === 0)
  }

  const runFirstBoardShared = () => {
    const awarded = loyalty.claimMilestone('firstBoardShared')
    pushLog('Shared first board', awarded, awarded === 0)
  }

  const runCheckIn = () => {
    const succeeded = loyalty.checkIn()
    if (succeeded) pushLog('Daily check-in', CHECK_IN_POINTS)
  }

  const runFestivalGift = () => {
    const awarded = loyalty.grantBroadcastPoints('demo-festival-2026', 150)
    pushLog('Festival gift (broadcast)', awarded, awarded === 0)
  }

  const runManual = (sign: 1 | -1) => {
    const amount = Math.round(Number(manualAmount))
    if (!Number.isFinite(amount) || amount === 0) return
    loyalty.addPoints(sign * amount)
    pushLog(sign === 1 ? `+${amount} manual` : `−${amount} manual`, sign * amount)
  }

  const runReset = () => {
    loyalty.resetLoyalty()
    setLog([])
    setDeliveredOrderCount(0)
  }

  if (!loyalty.hydrated) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-8 lg:px-10">
      <div className="rounded-2xl border border-dashed border-ink/20 bg-ink/[0.02] px-5 py-4">
        <p className="text-sm font-semibold text-ink">Loyalty demo</p>
        <p className="mt-1 text-sm text-ink/60">
          Every trigger below maps to a real rule in <code className="rounded bg-ink/8 px-1 py-0.5 text-xs">lib/loyaltyPoints.ts</code>.
          The four milestone buttons only pay out once, ever — click again and the log shows &ldquo;already claimed.&rdquo; The festival
          gift simulates a broadcast/admin grant: also once-only, but via a separate campaign id, not a personal earning cap.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-sm text-ink">Spend-linked (repeatable — costs real money each time)</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={runDeliveredOrder}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-teal/12 text-teal-deep">
              <PackageCheck size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Order delivered (${MOCK_ORDER_TOTAL})</span>
              <span className="block truncate text-xs text-ink/45">
                {POINTS_PER_CURRENCY_UNIT} pt/$1 · triggers first-purchase / 5-orders milestones too
              </span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-teal-deep">
              +{MOCK_ORDER_TOTAL * POINTS_PER_CURRENCY_UNIT}
            </span>
          </button>
        </div>

        <h2 className="mt-6 font-display text-sm text-ink">One-time milestones (claimable once, ever)</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={runMobileVerified}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-indigo-deep/12 text-indigo-deep">
              <Smartphone size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Mobile number verified</span>
              <span className="block truncate text-xs text-ink/45">OTP-verified, not just typed in</span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-indigo-deep">
              +{MILESTONE_POINTS.mobileVerified}
            </span>
          </button>

          <button
            type="button"
            onClick={runFirstBoardShared}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-teal/12 text-teal-deep">
              <Share2 size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Shared first board</span>
              <span className="block truncate text-xs text-ink/45">Account-level — not per board, not per share</span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-teal-deep">
              +{MILESTONE_POINTS.firstBoardShared}
            </span>
          </button>
        </div>

        <h2 className="mt-6 font-display text-sm text-ink">Recurring (capped by &ldquo;once per day&rdquo;)</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={runCheckIn}
            disabled={!loyalty.canCheckInToday}
            className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink/10 disabled:hover:bg-white"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-gold/15 text-gold-deep">
              <CalendarCheck size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Daily check-in</span>
              <span className="block truncate text-xs text-ink/45">
                {loyalty.canCheckInToday ? 'Once per calendar day' : 'Already checked in today'}
              </span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-gold-deep">+{CHECK_IN_POINTS}</span>
          </button>
        </div>

        <h2 className="mt-6 font-display text-sm text-ink">Broadcast grant (admin-issued, not user-earned)</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={runFestivalGift}
            className="flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-left transition-colors hover:border-gold/50"
          >
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-gold/15 text-gold-deep">
              <Gift size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Festival gift (all customers)</span>
              <span className="block truncate text-xs text-ink/45">
                Idempotent per campaign id — no personal earning cap applies
              </span>
            </span>
            <span className="flex-none text-sm font-bold tabular-nums text-gold-deep">+150</span>
          </button>
        </div>

        {/* Manual adjuster, for testing arbitrary tier boundaries. */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
          <span className="text-xs font-semibold text-ink/50">Manual adjust</span>
          <input
            type="number"
            value={manualAmount}
            onChange={(e) => setManualAmount(e.target.value)}
            className="w-24 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink"
          />
          <button
            type="button"
            onClick={() => runManual(1)}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold tracking-wide text-white transition-opacity hover:opacity-90"
          >
            ADD
          </button>
          <button
            type="button"
            onClick={() => runManual(-1)}
            className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-bold tracking-wide text-ink transition-colors hover:bg-ink/5"
          >
            SUBTRACT
          </button>

          <button
            type="button"
            onClick={runReset}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-ink/50 hover:text-ink"
          >
            <RotateCcw size={13} />
            Reset to mock defaults
          </button>
        </div>
      </div>

      {log.length > 0 && (
        <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
          <h2 className="font-display text-sm text-ink">Recent simulated events</h2>
          <ul className="mt-3 flex flex-col gap-1.5">
            {log.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between text-sm">
                <span className="text-ink/70">
                  {entry.label}
                  {entry.blocked && (
                    <span className="ml-2 rounded-full bg-ink/8 px-2 py-0.5 text-[10px] font-semibold text-ink/50">
                      already claimed
                    </span>
                  )}
                </span>
                <span className={`font-semibold tabular-nums ${entry.delta >= 0 ? 'text-teal-deep' : 'text-red-600'}`}>
                  {entry.delta >= 0 ? '+' : ''}
                  {entry.delta}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}