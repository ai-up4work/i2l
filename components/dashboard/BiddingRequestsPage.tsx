import { Gavel, Timer } from 'lucide-react'
import { biddingRequests } from './data'
import type { BiddingStatus } from './types'

const statusStyles: Record<BiddingStatus, string> = {
  'Bidding open': 'bg-ink/5 text-ink/70',
  'You are winning': 'bg-gold-soft text-rust',
  Outbid: 'bg-rust/10 text-rust',
  Won: 'bg-blue/10 text-blue',
}

export default function BiddingRequestsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8 lg:px-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Bidding requests</h1>
        <span className="hidden items-center gap-2 rounded-full bg-gold-soft px-4 py-2 text-xs font-semibold text-rust sm:flex">
          <Gavel size={14} /> {biddingRequests.length} active
        </span>
      </div>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/60">
        We bid on your behalf up to the max you set, and only charge you the winning amount.
      </p>

      <div className="mt-9 flex flex-col gap-4">
        {biddingRequests.map((item) => (
          <article key={item.id} className="flex flex-col gap-5 rounded-2xl border border-ink/10 bg-card p-6 sm:flex-row">
            <img src={item.image} alt={item.name} className="h-20 w-20 flex-none rounded-xl object-cover" />

            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs uppercase tracking-widest text-muted">{item.id}</p>
              <h3 className="mt-1 line-clamp-2 font-display text-lg leading-snug text-ink">{item.name}</h3>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm sm:gap-8">
              <span>
                <span className="block text-muted">Current bid</span>
                <b className="font-semibold text-ink">US${item.currentBid.toFixed(2)}</b>
              </span>
              <span>
                <span className="block text-muted">Your max</span>
                <b className="font-semibold text-ink">US${item.yourMaxBid.toFixed(2)}</b>
              </span>
              <span className="flex items-center gap-1.5">
                <Timer size={14} className="text-muted" />
                <b className="font-semibold text-ink">{item.endsIn}</b>
              </span>
            </div>

            <span className={`flex-none self-start rounded-full px-4 py-1.5 text-xs font-semibold sm:self-center ${statusStyles[item.status]}`}>
              {item.status}
            </span>
          </article>
        ))}
      </div>
    </div>
  )
}
