        'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Check,
  ChevronLeft,
  Copy,
  MapPin,
  MessageCircleWarning,
  Package,
  PackageCheck,
  PackageSearch,
  Truck,
} from 'lucide-react'
import InfoRail from '@/components/dashboard/InfoRail'

// ---------------------------------------------------------------------------
// Stubs — replace these with your real modules when dropping this back in.
// ---------------------------------------------------------------------------

type StepKey = 'placed' | 'processing' | 'shipped' | 'outForDelivery' | 'delivered'

type TrackingStep = { key: StepKey; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }

const steps: TrackingStep[] = [
  { key: 'placed', label: 'Order placed', icon: Package },
  { key: 'processing', label: 'Processing', icon: PackageSearch },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'outForDelivery', label: 'Out for delivery', icon: MapPin },
  { key: 'delivered', label: 'Delivered', icon: PackageCheck },
]

type TrackingEvent = { date: string; time: string; title: string; location?: string }

type ShipmentItem = { label: string; qty: number; variant?: string }

// ---------------------------------------------------------------------------
// Mock data — wire this up to your real order/tracking API.
// ---------------------------------------------------------------------------

const order = {
  number: '#GB-4471209385',
  placedOn: 'Aug 24, 2026',
  carrier: 'DHL Express',
  trackingNumber: '1Z999AA10123456784',
  currentStep: 'shipped' as StepKey,
  estimatedDelivery: 'Sep 4 – Sep 6',
}

const events: TrackingEvent[] = [
  {
    date: 'Sep 1',
    time: '08:12',
    title: 'Departed transit facility',
    location: 'Colombo, LK',
  },
  {
    date: 'Aug 30',
    time: '19:40',
    title: 'Arrived at transit facility',
    location: 'Dubai, AE',
  },
  {
    date: 'Aug 28',
    time: '11:05',
    title: 'Shipment picked up by carrier',
    location: 'Guangzhou, CN',
  },
  {
    date: 'Aug 25',
    time: '14:22',
    title: 'Order processed and packed',
  },
  {
    date: 'Aug 24',
    time: '09:03',
    title: 'Order placed',
  },
]

const items: ShipmentItem[] = [
  { label: "1pc Men's Graphic Tee — Vino Print", qty: 1, variant: 'M / Cream' },
  { label: 'GRDR Men’s Cute Letter Tee', qty: 1, variant: 'L / Beige' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TrackOrderPage() {
  const router = useRouter()
  const currentIndex = steps.findIndex((s) => s.key === order.currentStep)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <div className="grid gap-8 mt-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
        <div className="min-w-0 max-w-3xl">
          {/* Header */}
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1 text-sm font-semibold text-ink/55 transition-colors hover:text-ink"
          >
            <ChevronLeft size={16} />
            Back to orders
          </button>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl text-ink sm:text-4xl">Track your order</h1>
              <p className="mt-1.5 text-sm text-ink/55">
                Order {order.number} · Placed {order.placedOn}
              </p>
            </div>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-xl border border-ink/15 bg-card px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
            >
              <MessageCircleWarning size={15} />
              Report a problem
            </button>
          </div>

          {/* Estimated delivery banner */}
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-ink/10 bg-gold/10 p-4">
            <Truck className="h-9 w-9 flex-none text-teal-deep" />
            <div>
              <p className="text-sm font-semibold text-ink">
                Arriving {order.estimatedDelivery}
              </p>
              <p className="mt-0.5 text-sm text-ink/55">
                {order.carrier} · Tracking {order.trackingNumber}
              </p>
            </div>
            <button
              type="button"
              aria-label="Copy tracking number"
              className="ml-auto grid h-9 w-9 flex-none place-items-center rounded-full transition-colors hover:bg-ink/5"
            >
              <Copy size={16} className="text-ink/50" />
            </button>
          </div>

          {/* Status stepper */}
          <div className="mt-8 flex items-start">
            {steps.map((step, index) => {
              const Icon = step.icon
              const isDone = index < currentIndex
              const isCurrent = index === currentIndex
              const isLast = index === steps.length - 1

              return (
                <div key={step.key} className={`flex ${isLast ? 'flex-none' : 'flex-1'} items-center`}>
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={`grid h-9 w-9 place-items-center rounded-full border-2 transition-colors ${
                        isDone
                          ? 'border-teal-deep bg-teal-deep text-white'
                          : isCurrent
                            ? 'border-teal-deep text-teal-deep'
                            : 'border-ink/15 text-ink/30'
                      }`}
                    >
                      {isDone ? <Check size={16} /> : <Icon size={16} />}
                    </div>
                    <span
                      className={`text-center text-[11px] font-semibold leading-tight ${
                        isDone || isCurrent ? 'text-ink' : 'text-ink/35'
                      }`}
                      style={{ maxWidth: 72 }}
                    >
                      {step.label}
                    </span>
                  </div>
                  {!isLast && (
                    <div
                      className={`-mt-6 h-0.5 flex-1 rounded-full ${
                        isDone ? 'bg-teal-deep' : 'bg-ink/10'
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Tracking timeline */}
          <div className="mt-10">
            <h2 className="font-display text-xl text-ink">Tracking history</h2>
            <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-5">
              <ol className="flex flex-col">
                {events.map((event, index) => {
                  const isLast = index === events.length - 1
                  const isLatest = index === 0
                  return (
                    <li key={`${event.date}-${event.title}`} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span
                          className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${
                            isLatest ? 'bg-teal-deep' : 'bg-ink/20'
                          }`}
                        />
                        {!isLast && <span className="w-px flex-1 bg-ink/10" />}
                      </div>
                      <div className={`min-w-0 ${isLast ? '' : 'pb-6'}`}>
                        <p className={`text-sm font-semibold ${isLatest ? 'text-ink' : 'text-ink/70'}`}>
                          {event.title}
                        </p>
                        <p className="mt-0.5 text-xs text-ink/45">
                          {event.date} · {event.time}
                          {event.location ? ` · ${event.location}` : ''}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>

          {/* Items in this shipment */}
          <div className="mt-10">
            <h2 className="font-display text-xl text-ink">In this shipment</h2>
            <div className="mt-4 flex flex-col gap-3">
              {items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-4 rounded-2xl border border-ink/10 bg-card p-4"
                >
                  <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-gold/10">
                    <Package className="h-5 w-5 text-teal-deep" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{item.label}</p>
                    {item.variant && <p className="mt-0.5 text-sm text-ink/50">{item.variant}</p>}
                  </div>
                  <span className="flex-none text-sm text-ink/55">Qty {item.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <InfoRail />
      </div>
    </div>
  )
}