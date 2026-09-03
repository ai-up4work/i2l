import { MapPin, ArrowUpRight } from 'lucide-react'
import { shipmentOrders } from './data'
import type { ShipmentOrderStatus } from './types'

const STATUS_ICON_STYLES: Record<ShipmentOrderStatus, string> = {
  Preparing: 'border-ink/15 text-ink/60 bg-ink/[0.03]',
  'In transit': 'border-teal/30 text-teal bg-teal/5',
  Delivered: 'border-gold-deep/40 text-gold-deep bg-gold/10',
  Delayed: 'border-indigo/40 text-indigo-deep bg-indigo/5',
}

const STATUS_DOT_STYLES: Record<ShipmentOrderStatus, string> = {
  Preparing: 'bg-ink/40',
  'In transit': 'bg-teal',
  Delivered: 'bg-gold-deep',
  Delayed: 'bg-indigo-deep',
}

const STATUS_TEXT_STYLES: Record<ShipmentOrderStatus, string> = {
  Preparing: 'text-ink/60',
  'In transit': 'text-teal',
  Delivered: 'text-gold-deep',
  Delayed: 'text-indigo-deep',
}

// A single isometric parcel drawn once, with a small pinned badge in the
// corner that swaps per status — reads as one designed icon family rather
// than four unrelated stock icons.
function StatusGlyph({ status, className }: { status: ShipmentOrderStatus; className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} fill="none">
      <path
        d="M14 3.5 L22.5 7.75 L14 12 L5.5 7.75 Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 7.75 L5.5 18.75 L14 23 L14 12 Z"
        fill="currentColor"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M22.5 7.75 L22.5 18.75 L14 23 L14 12 Z"
        fill="currentColor"
        fillOpacity="0.24"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M14 3.5 L14 12" stroke="currentColor" strokeWidth="1" strokeOpacity="0.35" />

      <circle cx="21.5" cy="6.5" r="4.6" className="fill-parchment" stroke="currentColor" strokeWidth="1.1" />

      {status === 'Preparing' && (
        <g fill="currentColor">
          <circle cx="19.6" cy="6.5" r="0.7" />
          <circle cx="21.5" cy="6.5" r="0.7" />
          <circle cx="23.4" cy="6.5" r="0.7" />
        </g>
      )}

      {status === 'In transit' && (
        <path
          d="M19.8 4.6 L22.4 6.5 L19.8 8.4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {status === 'Delivered' && (
        <path
          d="M19.3 6.6 L20.9 8.2 L23.7 4.9"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {status === 'Delayed' && (
        <g stroke="currentColor" strokeLinecap="round">
          <line x1="21.5" y1="4.5" x2="21.5" y2="6.9" strokeWidth="1.3" />
          <circle cx="21.5" cy="8.6" r="0.6" fill="currentColor" stroke="none" />
        </g>
      )}
    </svg>
  )
}

const LIFECYCLE_STEPS = ['Preparing', 'In transit', 'Delivered'] as const

function lifecycleIndex(status: ShipmentOrderStatus) {
  if (status === 'Preparing') return 0
  if (status === 'Delivered') return 2
  return 1
}

function LifecycleSteps({ status }: { status: ShipmentOrderStatus }) {
  const currentIndex = lifecycleIndex(status)
  const isDelayed = status === 'Delayed'
  const isDelivered = status === 'Delivered'

  return (
    <div className="flex w-full max-w-[15rem] flex-col gap-1.5 sm:w-56">
      <div className="flex items-center">
        {LIFECYCLE_STEPS.map((label, i) => {
          const flagged = i === currentIndex && isDelayed
          const isComplete = i < currentIndex || isDelivered
          const isCurrent = i === currentIndex && !isDelivered

          return (
            <div key={label} className="contents">
              <span
                className={`relative grid h-2.5 w-2.5 flex-none place-items-center rounded-full ${
                  flagged ? 'bg-indigo-deep' : isComplete ? 'bg-gold-deep' : isCurrent ? 'bg-teal' : 'bg-ink/15'
                }`}
              >
                {isCurrent && !isDelayed && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-teal/60" />
                )}
                {flagged && <span className="absolute inset-0 animate-ping rounded-full bg-indigo/50" />}
              </span>
              {i !== LIFECYCLE_STEPS.length - 1 && (
                <div
                  className={`mx-1.5 h-px flex-1 ${i < currentIndex || isDelivered ? 'bg-gold-deep/50' : 'bg-ink/12'}`}
                />
              )}
            </div>
          )
        })}
      </div>

      <div className="flex justify-between">
        {LIFECYCLE_STEPS.map((label, i) => {
          const flagged = i === currentIndex && isDelayed
          const passed = i <= currentIndex || isDelivered
          return (
            <span
              key={label}
              className={`whitespace-nowrap text-[10px] font-medium uppercase tracking-wide ${
                flagged ? 'text-indigo-deep' : passed ? 'text-ink/55' : 'text-ink/25'
              } ${i === 0 ? 'text-left' : i === LIFECYCLE_STEPS.length - 1 ? 'text-right' : 'text-center'}`}
            >
              {flagged ? 'Delayed' : label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function ShipmentOrdersPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8 lg:px-10">
      <div className="motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Shipment orders</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/60">
          Every parcel forwarded through a warehouse address, tracked from check-in to your door.
        </p>
      </div>

      <div className="mt-9 flex flex-col gap-3">
        {shipmentOrders.map((order, index) => {
          const isDelayed = order.status === 'Delayed'

          return (
            <article
              key={order.id}
              className={`group relative overflow-hidden rounded-2xl border bg-card p-6 shadow-[0_1px_2px_rgba(28,26,23,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(28,26,23,0.08)] motion-safe:[animation:fadeUp_0.4s_ease-out_both] ${
                isDelayed ? 'border-indigo/25' : 'border-ink/10 hover:border-ink/20'
              }`}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              {isDelayed && <span className="absolute inset-y-0 left-0 w-[3px] bg-indigo-deep" />}

              {/* Header row: icon, route, status */}
              <div className="flex items-center gap-4 pl-[10px]">
                <div
                  className={`grid h-13 w-13 flex-none place-items-center rounded-2xl border ${STATUS_ICON_STYLES[order.status]}`}
                  style={{ height: '3.25rem', width: '3.25rem' }}
                >
                  <StatusGlyph status={order.status} className="h-7 w-7" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="rounded-full bg-ink/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-ink/45">
                      {order.id}
                    </span>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 font-display text-lg font-semibold leading-tight text-ink">
                    <MapPin size={15} className="flex-none text-teal-deep" /> {order.origin}
                  </p>
                </div>

                <div className="flex flex-none items-center gap-3">
                  <span
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold ${
                      isDelayed ? 'bg-indigo/10 text-indigo-deep' : `bg-ink/[0.04] ${STATUS_TEXT_STYLES[order.status]}`
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 flex-none rounded-full ${STATUS_DOT_STYLES[order.status]}`} />
                    {order.status}
                  </span>
                  <ArrowUpRight
                    size={16}
                    className="hidden flex-none text-ink/30 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink/60 sm:block"
                  />
                </div>
              </div>

              {/* Detail row: lifecycle steps + metrics */}
              <div className="mt-5 flex flex-col gap-5 border-t border-ink/[0.08] pt-4 pl-[10px] sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <LifecycleSteps status={order.status} />

                <div className="flex flex-wrap items-center gap-x-7 gap-y-2 text-sm sm:flex-none">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-ink/35">Parcels</p>
                    <p className="mt-0.5 font-semibold text-ink">{order.parcelCount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-ink/35">Weight</p>
                    <p className="mt-0.5 whitespace-nowrap font-semibold text-ink">{order.weightKg} kg</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-ink/35">Updated</p>
                    <p className="mt-0.5 whitespace-nowrap font-semibold text-ink">{order.updatedAt}</p>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}