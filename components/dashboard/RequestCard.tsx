import { Store } from 'lucide-react'
import type { ItemRequest } from './types'

export default function RequestCard({ request }: { request: ItemRequest }) {
  const price = `US$${request.unitPrice.toFixed(2)}`

  return (
    <article className="overflow-hidden rounded-2xl border border-ink/10 bg-card">
      <div className="flex items-center gap-2 px-6 pb-2 pt-6 text-sm font-semibold text-ink/60">
        <Store size={16} /> eBay
      </div>

      <div className="flex gap-4 px-6 py-5">
        <img src={request.image} alt="Product" className="h-[100px] w-[100px] flex-none rounded-xl object-cover" />
        <div className="min-w-0">
          <h2 className="line-clamp-2 font-medium leading-relaxed text-ink">{request.name}</h2>
          <span className="mt-3 block text-sm text-muted">x{request.qty}</span>
          <strong className="text-rust">{price}</strong>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 pb-6">
        <Meta label="Status">
          <span className="rounded-full bg-gold-soft px-3.5 py-1.5 text-xs font-semibold text-rust">
            {request.status}
          </span>
        </Meta>
        <Meta label="Request No.">
          <b className="font-semibold text-ink">{request.id}</b>
        </Meta>
      </div>

      {request.status === 'Awaiting payment' && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 px-6 py-5">
          <div>
            <strong className="block font-display text-xl text-ink">Total HK$2,509</strong>
            <span className="mt-1 block text-sm text-rust">Time remaining: 1day(s) 21h</span>
          </div>
          <button className="rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep">
            Pay now
          </button>
        </div>
      )}
    </article>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </div>
  )
}
