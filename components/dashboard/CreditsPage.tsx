import { CircleCheck, Clock3, Sparkles, Wallet } from 'lucide-react'
import { creditBalance, creditTransactions, earnMethods } from './data'

export default function CreditsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-8 lg:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">My credits</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/60">
        Credits apply automatically at checkout on your next Request Preview or shipment payment.
      </p>

      <div className="mt-8 flex flex-col gap-6 rounded-2xl bg-gold-soft px-8 py-9 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="flex items-center gap-2 text-sm font-semibold text-ink/70">
            <Wallet size={16} className="text-rust" /> Available balance
          </span>
          <p className="mt-2 font-display text-5xl text-ink">{creditBalance} credits</p>
          <p className="mt-1 text-sm text-ink/60">1 credit &asymp; LKR 1 off your next order</p>
        </div>
        <a
          href="#earn"
          className="flex items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
        >
          <Sparkles size={16} /> Ways to earn more
        </a>
      </div>

      <h2 id="earn" className="mt-11 font-display text-2xl text-ink">
        Ways to earn credits
      </h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        {earnMethods.map((method) => (
          <div key={method.title} className="flex flex-col rounded-2xl border border-dashed border-ink/20 bg-card p-6">
            <span className="w-max rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-rust">{method.reward}</span>
            <h3 className="mt-4 font-display text-lg text-ink">{method.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">{method.description}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-11 font-display text-2xl text-ink">Transaction history</h2>
      <div className="mt-5">
        {creditTransactions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink/25 px-6 py-14 text-center">
            <Clock3 size={26} className="mx-auto text-muted" />
            <h3 className="mt-4 font-display text-lg text-ink">No credit activity yet</h3>
            <p className="mt-2 text-sm text-ink/60">
              Refer a friend or leave a review to start earning — every credit shows up here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-card">
            {creditTransactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-full border-2 border-dashed border-rust/40 text-rust">
                    <CircleCheck size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{transaction.label}</p>
                    <span className="text-xs text-muted">{transaction.date}</span>
                  </div>
                </div>
                <b className={`font-display text-lg ${transaction.amount >= 0 ? 'text-rust' : 'text-ink/60'}`}>
                  {transaction.amount >= 0 ? '+' : ''}
                  {transaction.amount}
                </b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
