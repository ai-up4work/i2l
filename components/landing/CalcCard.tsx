'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, Package, Zap } from 'lucide-react'

const RATE_PER_KG = 1450 // LKR, flat estimate for the standard lane
const BASE_FEE = 900
const MIN_WEIGHT = 0.5
const MAX_WEIGHT = 20

const SPEED_OPTIONS = [
  { id: 'standard' as const, label: 'Standard', eta: '10–14 days', icon: Package, multiplier: 1 },
  { id: 'express' as const, label: 'Express', eta: '3–5 days', icon: Zap, multiplier: 1.6 },
]

export default function CalcCard() {
  const [weight, setWeight] = useState(1)
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]['id']>('standard')

  const activeOption = SPEED_OPTIONS.find((o) => o.id === speed)!
  const estimate = Math.round((BASE_FEE + weight * RATE_PER_KG) * activeOption.multiplier)
  const pct = useMemo(
    () => ((weight - MIN_WEIGHT) / (MAX_WEIGHT - MIN_WEIGHT)) * 100,
    [weight],
  )

  return (
    <div className="rounded-[1.75rem] border border-ink/10 bg-card shadow-lift">
      <div className="px-6 pt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-rust">
          Quick estimate
        </p>
        <h2 className="mt-2 font-display text-xl text-ink">What will it cost?</h2>

        {/* Weight */}
        <label htmlFor="weight" className="mt-6 block">
          <span className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-muted">
            <span>Parcel weight</span>
            <span className="font-display text-base normal-case tracking-normal text-ink">
              {weight} kg
            </span>
          </span>

          <div className="relative mt-4 pb-2">
            <input
              id="weight"
              type="range"
              min={MIN_WEIGHT}
              max={MAX_WEIGHT}
              step={0.5}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="peer absolute inset-x-0 top-1/2 z-10 h-6 w-full -translate-y-1/2 cursor-pointer opacity-0"
            />
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-rust transition-[width] duration-150 motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rust bg-paper shadow-sm transition-[left] duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-rust peer-focus-visible:ring-offset-2 motion-reduce:transition-none"
              style={{ left: `${pct}%` }}
              aria-hidden="true"
            />
          </div>
        </label>

        {/* Speed */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {SPEED_OPTIONS.map(({ id, label, eta, icon: Icon }) => {
            const active = speed === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSpeed(id)}
                aria-pressed={active}
                className={`flex flex-col items-start gap-1 rounded-xl border px-3.5 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust ${
                  active
                    ? 'border-ink bg-ink text-paper'
                    : 'border-ink/15 text-ink/70 hover:border-ink/40'
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <Icon size={13} aria-hidden="true" />
                  {label}
                </span>
                <span className={active ? 'text-[11px] text-paper/70' : 'text-[11px] text-muted'}>
                  {eta}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Perforated seam with ticket-stub notches — the tag's tear line. */}
      <div className="relative mt-6 border-t border-dashed border-ink/20">
        <span
          className="absolute -left-2.5 top-0 h-5 w-5 -translate-y-1/2 rounded-full bg-paper"
          aria-hidden="true"
        />
        <span
          className="absolute -right-2.5 top-0 h-5 w-5 -translate-y-1/2 rounded-full bg-paper"
          aria-hidden="true"
        />

        <div className="px-6 py-5">
          <p className="text-xs uppercase tracking-wide text-muted">Estimated cost</p>
          <p className="mt-0.5 font-display text-3xl text-ink">
            LKR {estimate.toLocaleString('en-LK')}
          </p>
          <a
            href="/account"
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-blue px-4 py-3 text-xs font-semibold text-paper transition-colors hover:bg-blue-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
          >
            Ship this parcel
            <ArrowRight size={14} aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  )
}