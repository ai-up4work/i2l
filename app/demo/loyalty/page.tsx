// app/demo/loyalty/page.tsx
'use client'

import { useState } from 'react'
import {
  ShoppingBagIcon,
  LayoutGrid,
  Share2,
  CalendarCheck,
  RotateCcw,
  Sparkles,
} from 'lucide-react'

import { useLoyalty, CHECK_IN_POINTS } from '@/contexts/Loyaltycontext'

// ---------------------------------------------------------------------------
// One simulated trigger — mirrors a real action elsewhere in the app that
// isn't wired to award points yet (add to cart, create a board, share a
// board, place an order). Clicking it calls addPoints directly, exactly
// like the real call site would once wired in.
// ---------------------------------------------------------------------------

type TriggerAction = {
  id: string
  label: string
  detail: string
  points: number
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
}

const TRIGGERS: TriggerAction[] = [
  { id: 'add-to-cart', label: 'Add to cart', detail: 'Simulates Cartcontext.addItem', points: 5, icon: ShoppingBagIcon },
  { id: 'create-board', label: 'Create a board', detail: 'Simulates Wishlistcontext.createBoard', points: 20, icon: LayoutGrid },
  { id: 'share-board', label: 'Share a board', detail: 'Simulates Wishlistcontext.generateShareLink', points: 15, icon: Share2 },
  { id: 'place-order', label: 'Place a $48 order', detail: '1 point per $1 spent (placeholder rule)', points: 48, icon: Sparkles },
]

// ---------------------------------------------------------------------------
// Log of simulated events, newest first — makes it visible *why* the
// balance is what it is, rather than just watching a number jump.
// ---------------------------------------------------------------------------

type LogEntry = { id: string; label: string; delta: number; at: number }

export default function LoyaltyDemoPage() {
  const loyalty = useLoyalty()
  const [log, setLog] = useState<LogEntry[]>([])
  const [manualAmount, setManualAmount] = useState('100')

  const pushLog = (label: string, delta: number) => {
    setLog((prev) => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label, delta, at: Date.now() }, ...prev].slice(0, 12))
  }

  const runTrigger = (trigger: TriggerAction) => {
    loyalty.addPoints(trigger.points)
    pushLog(trigger.label, trigger.points)
  }

  const runCheckIn = () => {
    const succeeded = loyalty.checkIn()
    if (succeeded) pushLog('Daily check-in', CHECK_IN_POINTS)
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
          No real earning flow is wired into checkout, boards, or cart yet. This page simulates each
          trigger by calling <code className="rounded bg-ink/8 px-1 py-0.5 text-xs">useLoyalty().addPoints()</code> directly,
          so you can preview tier changes without building the real integrations first. Open the actual
          VIP page in another tab to see it update live.
        </p>
      </div>

      {/* Simulated triggers */}
      <div className="mt-6 rounded-2xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-sm text-ink">Simulate an action</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TRIGGERS.map((trigger) => {
            const Icon = trigger.icon
            return (
              <button
                key={trigger.id}
                type="button"
                onClick={() => runTrigger(trigger)}
                className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/5"
              >
                <span className="grid size-9 flex-none place-items-center rounded-lg bg-teal/12 text-teal-deep">
                  <Icon size={16} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{trigger.label}</span>
                  <span className="block truncate text-xs text-ink/45">{trigger.detail}</span>
                </span>
                <span className="flex-none text-sm font-bold tabular-nums text-teal-deep">+{trigger.points}</span>
              </button>
            )
          })}

          {/* Check-in is its own case: once-per-day, so the button disables itself. */}
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

        {/* Manual adjuster, for testing arbitrary tier boundaries. */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
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

      {/* Event log */}
      {log.length > 0 && (
        <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
          <h2 className="font-display text-sm text-ink">Recent simulated events</h2>
          <ul className="mt-3 flex flex-col gap-1.5">
            {log.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between text-sm">
                <span className="text-ink/70">{entry.label}</span>
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