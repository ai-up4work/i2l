'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'

const RATE_PER_KG = 1450 // LKR, flat estimate for the standard lane
const BASE_FEE = 900

export default function SignupCard() {
  const [weight, setWeight] = useState(1)
  const [speed, setSpeed] = useState<'standard' | 'express'>('standard')

  const multiplier = speed === 'express' ? 1.6 : 1
  const estimate = Math.round((BASE_FEE + weight * RATE_PER_KG) * multiplier)

  return (
    <div className="rounded-[2rem] border border-ink/10 bg-paper p-6 shadow-lift">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-rust">
        Quick estimate
      </p>
      <h2 className="mt-2 font-display text-xl text-ink">What will it cost?</h2>

      <label className="mt-5 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Parcel weight — {weight} kg
        </span>
        <input
          type="range"
          min={0.5}
          max={20}
          step={0.5}
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
          className="mt-2 w-full accent-rust"
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(['standard', 'express'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSpeed(option)}
            className={`rounded-full border px-4 py-2 text-xs font-semibold capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust ${
              speed === option
                ? 'border-ink bg-ink text-paper'
                : 'border-ink/15 text-ink/70 hover:border-ink/40'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-end justify-between border-t border-ink/10 pt-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Estimated cost</p>
          <p className="font-display text-3xl text-ink">
            LKR {estimate.toLocaleString('en-LK')}
          </p>
        </div>
        <a
          href="/account"
          className="flex items-center gap-1.5 rounded-full bg-blue px-4 py-2.5 text-xs font-semibold text-paper transition-colors hover:bg-blue-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
        >
          Get started
          <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>
    </div>
  )
}