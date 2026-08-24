import { Box, MapPin } from 'lucide-react'
import { shipmentOrders } from './data'
import type { ShipmentOrderStatus } from './types'

const statusStyles: Record<ShipmentOrderStatus, string> = {
  Preparing: 'bg-ink/5 text-ink/70',
  'In transit': 'bg-blue/10 text-blue',
  Delivered: 'bg-gold-soft text-rust',
  Delayed: 'bg-rust/10 text-rust',
}

export default function ShipmentOrdersPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8 lg:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Shipment orders</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/60">
        Every parcel forwarded through a warehouse address, tracked from check-in to your door.
      </p>

      <div className="mt-9 flex flex-col gap-4">
        {shipmentOrders.map((order) => (
          <article
            key={order.id}
            className="flex flex-col gap-4 rounded-2xl border border-ink/10 bg-card p-6 sm:flex-row sm:items-center"
          >
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl border-2 border-dashed border-rust/40 text-rust">
              <Box size={20} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs uppercase tracking-widest text-muted">{order.id}</p>
              <p className="mt-1 flex items-center gap-1.5 font-display text-lg text-ink">
                <MapPin size={15} className="text-rust" /> {order.origin}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm text-ink/70 sm:gap-8">
              <span>
                <span className="text-muted">Parcels</span>{' '}
                <b className="font-semibold text-ink">{order.parcelCount}</b>
              </span>
              <span>
                <span className="text-muted">Weight</span>{' '}
                <b className="font-semibold text-ink">{order.weightKg} kg</b>
              </span>
              <span>
                <span className="text-muted">Updated</span> <b className="font-semibold text-ink">{order.updatedAt}</b>
              </span>
            </div>

            <span
              className={`flex-none rounded-full px-4 py-1.5 text-xs font-semibold ${statusStyles[order.status]}`}
            >
              {order.status}
            </span>
          </article>
        ))}
      </div>
    </div>
  )
}
