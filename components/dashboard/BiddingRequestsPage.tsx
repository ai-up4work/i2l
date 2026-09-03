import { Gavel, Timer, TrendingUp, TrendingDown, Trophy } from 'lucide-react'
import { biddingRequests } from './data'
import type { BiddingStatus } from './types'

const STATUS_STYLES: Record<BiddingStatus, string> = {
  'Bidding open': 'bg-ink/5 text-ink/70',
  'You are winning': 'bg-gold-soft text-rust',
  Outbid: 'bg-rust/10 text-rust',
  Won: 'bg-blue/10 text-blue',
}

const STATUS_ICON: Record<BiddingStatus, typeof Gavel> = {
  'Bidding open': Gavel,
  'You are winning': TrendingUp,
  Outbid: TrendingDown,
  Won: Trophy,
}

const STATUS_ICON_STYLES: Record<BiddingStatus, string> = {
  'Bidding open': 'border-ink/15 text-ink/60 bg-ink/[0.03]',
  'You are winning': 'border-rust/30 text-rust bg-gold-soft',
  Outbid: 'border-rust/40 text-rust bg-rust/5',
  Won: 'border-blue/30 text-blue bg-blue/5',
}

export default function BiddingRequestsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8 lg:px-10">
      <div className="flex items-center justify-between gap-4 motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Bidding requests</h1>
        <span className="hidden items-center gap-2 rounded-full bg-gold-soft px-4 py-2 text-xs font-semibold text-rust sm:flex">
          <Gavel size={14} /> {biddingRequests.length} active
        </span>
      </div>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/60 motion-safe:[animation:fadeUp_0.4s_ease-out_0.05s_both]">
        We bid on your behalf up to the max you set, and only charge you the winning amount.
      </p>

      <div className="mt-9 flex flex-col gap-4">
        {biddingRequests.map((item, index) => {
          const StatusIcon = STATUS_ICON[item.status]
          const isEnded = item.status === 'Won'
          const bidPercent = Math.min(100, Math.max(0, (item.currentBid / item.yourMaxBid) * 100))
          const isOutbid = item.status === 'Outbid'

          return (
            <article
              key={item.id}
              className="group overflow-hidden rounded-2xl border border-ink/10 bg-card transition-colors duration-200 hover:border-ink/20 hover:bg-ink/[0.015] motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
                <div className="relative flex-none">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-20 w-20 rounded-xl object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <span
                    className={`absolute -bottom-2 -right-2 grid h-8 w-8 place-items-center rounded-full border-2 border-card ${STATUS_ICON_STYLES[item.status]}`}
                  >
                    <StatusIcon size={14} strokeWidth={2.5} />
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs uppercase tracking-widest text-ink/40">{item.id}</p>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold sm:hidden ${STATUS_STYLES[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  <h3 className="mt-1 line-clamp-2 font-display text-lg leading-snug text-ink">{item.name}</h3>

                  {/* Bid progress: how close current bid is to your max */}
                  <div className="mt-3 max-w-xs">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
                      <div
                        className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                          isEnded ? 'bg-blue' : isOutbid ? 'bg-rust' : 'bg-gold-deep'
                        }`}
                        style={{ width: `${bidPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 text-sm sm:gap-8">
                  <span>
                    <span className="block text-[11px] font-medium uppercase tracking-wide text-ink/40">Current bid</span>
                    <b className="font-semibold text-ink">US${item.currentBid.toFixed(2)}</b>
                  </span>
                  <span>
                    <span className="block text-[11px] font-medium uppercase tracking-wide text-ink/40">Your max</span>
                    <b className="font-semibold text-ink">US${item.yourMaxBid.toFixed(2)}</b>
                  </span>
                  <span>
                    <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink/40">
                      <Timer size={11} /> Ends in
                    </span>
                    <b className={`font-semibold ${item.endsIn === 'Ended' ? 'text-ink/50' : 'text-ink'}`}>{item.endsIn}</b>
                  </span>
                </div>

                <span
                  className={`hidden flex-none self-start rounded-full px-4 py-1.5 text-xs font-semibold sm:flex sm:self-center ${STATUS_STYLES[item.status]}`}
                >
                  {item.status}
                </span>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}