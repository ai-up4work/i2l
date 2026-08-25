'use client'

import { useEffect, useState } from 'react'
import { CircleCheck, Clock3, Sparkles, Wallet, ArrowDownRight } from 'lucide-react'
import { creditBalance, creditTransactions, earnMethods } from './data'

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setValue(target)
      return
    }

    let start: number | null = null
    let raf: number

    const step = (timestamp: number) => {
      if (start === null) start = timestamp
      const progress = Math.min((timestamp - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

export default function CreditsPage() {
  const animatedBalance = useCountUp(creditBalance)

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-8 lg:px-10">
      <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">My credits</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/60">
        Credits apply automatically at checkout on your next Request Preview or shipment payment.
      </p>

      <div className="mt-8 flex flex-col gap-6 rounded-2xl bg-gold-soft px-8 py-9 sm:flex-row sm:items-center sm:justify-between motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
        <div>
          <span className="flex items-center gap-2 text-sm font-semibold text-ink/70">
            <Wallet size={16} className="text-rust" /> Available balance
          </span>
          <p className="mt-2 font-display text-5xl tabular-nums text-ink">{animatedBalance} credits</p>
          <p className="mt-1 text-sm text-ink/60">1 credit &asymp; LKR 1 off your next order</p>
        </div>
        <a
          href="#earn"
          className="group flex items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-paper transition-all duration-200 hover:bg-blue-deep hover:shadow-md active:scale-95"
        >
          <Sparkles size={16} className="transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
          Ways to earn more
        </a>
      </div>

      <h2 id="earn" className="mt-11 font-display text-2xl text-ink">
        Ways to earn credits
      </h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        {earnMethods.map((method, i) => (
          <div
            key={method.title}
            className="flex flex-col rounded-2xl border border-dashed border-ink/20 bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-rust/40 hover:shadow-md hover:shadow-ink/5 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span className="w-max rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-rust">{method.reward}</span>
            <h3 className="mt-4 font-display text-lg text-ink">{method.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">{method.description}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-11 font-display text-2xl text-ink">Transaction history</h2>
      <div className="mt-5">
        {creditTransactions.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink/25 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink/5 motion-safe:[animation:scaleIn_0.4s_ease-out_both]">
              <Clock3 size={22} className="text-muted" />
            </div>
            <h3 className="mt-4 font-display text-lg text-ink">No credit activity yet</h3>
            <p className="mt-2 text-sm text-ink/60">
              Refer a friend or leave a review to start earning — every credit shows up here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-card">
            {creditTransactions.map((transaction, i) => {
              const isEarned = transaction.amount >= 0
              return (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between gap-4 px-6 py-4 transition-colors duration-200 hover:bg-ink/[0.02] motion-safe:[animation:fadeUp_0.35s_ease-out_both]"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-9 w-9 flex-none place-items-center rounded-full border-2 border-dashed ${
                        isEarned ? 'border-rust/40 text-rust' : 'border-ink/25 text-ink/50'
                      }`}
                    >
                      {isEarned ? <CircleCheck size={16} /> : <ArrowDownRight size={16} />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{transaction.label}</p>
                      <span className="text-xs text-muted">{transaction.date}</span>
                    </div>
                  </div>
                  <b className={`font-display text-lg tabular-nums ${isEarned ? 'text-rust' : 'text-ink/60'}`}>
                    {isEarned ? '+' : ''}
                    {transaction.amount}
                  </b>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}