import { Clock3 } from 'lucide-react'
import type { ItemRequest, RequestStatus } from './types'

const STATUS_LABEL: Record<RequestStatus, string> = {
  Requested: 'In review',
  'Awaiting payment': 'Awaiting payment',
}

const STATUS_PILL: Record<RequestStatus, string> = {
  Requested: 'bg-ink/5 text-ink/60',
  'Awaiting payment': 'bg-gold/15 text-gold',
}

const STATUS_DOT: Record<RequestStatus, string> = {
  Requested: 'bg-ink/40',
  'Awaiting payment': 'bg-gold',
}

// Extra, optional payment-countdown fields. These aren't on ItemRequest yet —
// wire them up from real data when available; sensible defaults keep the
// current mock behavior working in the meantime.
type PaymentMeta = {
  totalDue?: string
  hoursRemaining?: number
  totalHours?: number
}

const RING_RADIUS = 18
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export default function RequestCard({ request }: { request: ItemRequest & PaymentMeta }) {
  const price = `US$${request.unitPrice.toFixed(2)}`
  const isAwaitingPayment = request.status === 'Awaiting payment'

  const totalDue = request.totalDue ?? 'HK$2,509'
  const totalHours = request.totalHours ?? 72
  const hoursRemaining = request.hoursRemaining ?? 45
  const percentElapsed = Math.min(100, Math.max(0, ((totalHours - hoursRemaining) / totalHours) * 100))
  const dashOffset = RING_CIRCUMFERENCE * (1 - percentElapsed / 100)
  const days = Math.floor(hoursRemaining / 24)
  const hours = Math.round(hoursRemaining % 24)
  const isUrgent = hoursRemaining <= 24

  return (
    <article className="group overflow-hidden rounded-2xl border border-ink/10 bg-card font-body transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/5">
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm text-ink/50">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue/10 text-[10px] font-bold text-blue">
            eB
          </span>
          eBay
        </div>

        <div className="mt-4 flex gap-4">
          <img
            src={request.image}
            alt={request.name}
            className="h-24 w-24 flex-none rounded-lg border border-ink/10 object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <div className="flex min-w-0 flex-col justify-center gap-1.5">
            <h2 className="line-clamp-2 font-semibold leading-snug text-ink">{request.name}</h2>
            <span className="text-sm text-ink/50">x{request.qty}</span>
            <strong className="font-display text-lg font-semibold text-rust">{price}</strong>
          </div>
        </div>

        <div className="mt-5 border-t border-ink/10 pt-4">
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-ink/50">Status</span>
            <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_PILL[request.status]}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[request.status]} ${isAwaitingPayment ? 'motion-safe:animate-pulse' : ''}`} />
              {STATUS_LABEL[request.status]}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-ink/50">Request No.</span>
            <span className="font-label text-xs tracking-tight text-ink">{request.id}</span>
          </div>
        </div>
      </div>

      {isAwaitingPayment && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 bg-gold/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90" aria-hidden>
              <circle cx="22" cy="22" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="3" className="text-gold/20" />
              <circle
                cx="22"
                cy="22"
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                className={`transition-[stroke-dashoffset] duration-700 ease-out ${isUrgent ? 'text-rust' : 'text-gold'}`}
              />
            </svg>
            <div>
              <strong className="font-display block text-lg font-semibold text-ink">Total {totalDue}</strong>
              <span className={`mt-0.5 flex items-center gap-1.5 text-sm font-medium ${isUrgent ? 'text-rust' : 'text-gold'}`}>
                <Clock3 size={14} strokeWidth={2.5} />
                {days > 0 ? `${days} day${days === 1 ? '' : 's'} ${hours}h` : `${hours}h`} remaining
              </span>
            </div>
          </div>
          <button className="rounded-lg bg-rust px-6 py-3 text-sm font-semibold text-paper transition-all duration-200 hover:opacity-90 active:scale-95">
            Pay now
          </button>
        </div>
      )}
    </article>
  )
}