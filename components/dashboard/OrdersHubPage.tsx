'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, CircleX, Gavel, MapPin, Plus, Tag, Truck } from 'lucide-react'

// ---------------------------------------------------------------------------
// Stubs — replace these with your real modules when dropping this back in.
// ---------------------------------------------------------------------------

type View =
  | 'requests'
  | 'biddingRequests'
  | 'shipmentOrders'
  | 'addRequest'
  | 'addShipment'

function pathForView(view: View): string {
  const map: Record<View, string> = {
    requests: '/orders/requests',
    biddingRequests: '/orders/bidding-requests',
    shipmentOrders: '/orders/shipments',
    addRequest: '/orders/requests/new',
    addShipment: '/orders/shipments/new',
  }
  return map[view]
}

// Lightweight stand-ins for your illustration components. Swap these back
// out for GavelIllustration / TagPercentIllustration / TruckIllustration.
function GavelIllustration({ className }: { className?: string }) {
  return (
    <div className={`grid place-items-center rounded-xl bg-gold-soft/40 ${className ?? ''}`}>
      <Gavel className="h-5 w-5 text-rust" />
    </div>
  )
}

function TagPercentIllustration({ className }: { className?: string }) {
  return (
    <div className={`grid place-items-center rounded-xl bg-gold-soft/40 ${className ?? ''}`}>
      <Tag className="h-5 w-5 text-rust" />
    </div>
  )
}

function TruckIllustration({ className }: { className?: string }) {
  return (
    <div className={`grid place-items-center rounded-xl bg-gold-soft/40 ${className ?? ''}`}>
      <Truck className="h-5 w-5 text-rust" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type OrderItem = { label: string; illustration: React.ComponentType<{ className?: string }>; view: View }
type OrderSection = { heading: string; addView: View; items: OrderItem[] }

const orderSections: OrderSection[] = [
  {
    heading: 'Global shopping',
    addView: 'addRequest',
    items: [
      { label: 'Buying requests', illustration: TagPercentIllustration, view: 'requests' },
      { label: 'Bidding requests', illustration: GavelIllustration, view: 'biddingRequests' },
    ],
  },
  {
    heading: 'Parcel forwarding',
    addView: 'addShipment',
    items: [{ label: 'Manage shipments', illustration: TruckIllustration, view: 'shipmentOrders' }],
  },
]

// Informational links use plain small line-icons rather than illustrations
// — those are reserved for the actual features above, so the two visual
// languages stay distinct instead of everything looking equally "special".
const infoLinks = [
  { label: 'Prohibited items', icon: CircleX },
  { label: 'Self-pickup points', icon: MapPin },
]

export default function OrdersHubPage() {
  const router = useRouter()

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16 pt-8 lg:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Orders</h1>

      {orderSections.map((section) => (
        <div key={section.heading} className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-ink">{section.heading}</h2>
            <button
              type="button"
              aria-label={`Add ${section.heading.toLowerCase()}`}
              onClick={() => router.push(pathForView(section.addView))}
              className="grid h-9 w-9 place-items-center rounded-full border-2 border-dashed border-rust/40 text-rust transition-colors hover:bg-gold-soft/40"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {section.items.map(({ label, illustration: Illustration, view }) => (
              <button
                key={label}
                type="button"
                onClick={() => router.push(pathForView(view))}
                className="flex items-center gap-4 rounded-2xl border border-ink/10 bg-card p-4 text-left transition-colors hover:border-ink/20"
              >
                <Illustration className="h-11 w-11 flex-none" />
                <span className="flex-1 font-semibold text-ink">{label}</span>
                <ChevronRight size={18} className="text-ink/30" />
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-10">
        <h2 className="font-display text-xl text-ink">Relevant information</h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-card">
          {infoLinks.map(({ label, icon: Icon }, index) => (
            <a
              key={label}
              href="#"
              className={`flex items-center gap-3 px-4 py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 ${
                index > 0 ? 'border-t border-ink/10' : ''
              }`}
            >
              <Icon size={18} className="flex-none text-ink/70" />
              <span className="flex-1">{label}</span>
              <ChevronRight size={16} className="text-muted" />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}