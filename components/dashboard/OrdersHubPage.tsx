'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ChevronRight,
  CircleX,
  Gavel,
  MapPin,
  PackageSearch,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  Truck,
} from 'lucide-react'
import InfoRail from './InfoRail'

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
    addRequest: '/accoount/requests/new',
    addShipment: '/orders/shipments/new',
  }
  return map[view]
}

function GavelIllustration({ className }: { className?: string }) {
  return (
    <div className={`grid place-items-center rounded-xl bg-gold/10 ${className ?? ''}`}>
      <Gavel className="h-5 w-5 text-teal-deep" />
    </div>
  )
}

function TagPercentIllustration({ className }: { className?: string }) {
  return (
    <div className={`grid place-items-center rounded-xl bg-gold/10 ${className ?? ''}`}>
      <Tag className="h-5 w-5 text-teal-deep" />
    </div>
  )
}

function TruckIllustration({ className }: { className?: string }) {
  return (
    <div className={`grid place-items-center rounded-xl bg-gold/10 ${className ?? ''}`}>
      <Truck className="h-5 w-5 text-teal-deep" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data
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

const infoLinks = [
  { label: 'Prohibited items', icon: CircleX },
  { label: 'Self-pickup points', icon: MapPin },
]

// Order-status tabs, SHEIN-style. Wire `count` up to real data when available —
// omit it (or leave 0) to render the tab without a badge.
type StatusTab = { key: string; label: string; count?: number }

const statusTabs: StatusTab[] = [
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped', count: 2 },
  { key: 'review', label: 'Review' },
  { key: 'returns', label: 'Return/Refund' },
  { key: 'deleted', label: 'Deleted Orders History' },
]

// Placeholder "you may also like" rail — swap for a real recommendations feed.
const recommended = [
  { label: 'Vintage crest tee', price: '$18.90', illustration: TagPercentIllustration },
  { label: 'Live auction: sneakers', price: 'Bid now', illustration: GavelIllustration },
  { label: 'Express parcel plan', price: 'From $6.50', illustration: TruckIllustration },
  { label: 'Weekend flash requests', price: '$12.40', illustration: TagPercentIllustration },
  { label: 'Live auction: watches', price: 'Bid now', illustration: GavelIllustration },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrdersHubPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<string>('unpaid')
  const [query, setQuery] = useState('')

  // Wire this up to real order data. Left empty here to reproduce the
  // reference "it's empty here" state on the active tab.
  const activeOrders: OrderItem[] = []

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="grid gap-8 mt-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:-mt-20 lg:items-start">
        <div className="min-w-0 max-w-3xl">
          {/* Hero */}
          <div className="relative -mt-24 flex min-h-[220px] flex-col justify-end overflow-hidden pt-8 sm:min-h-[260px]">
            <div
              className="absolute inset-0 z-0"
              style={{
                maskImage:
                  'radial-gradient(ellipse 75% 85% at 60% 35%, black 55%, transparent 100%)',
                WebkitMaskImage:
                  'radial-gradient(ellipse 75% 85% at 60% 35%, black 55%, transparent 100%)',
              }}
            >
              <Image
                src="/Refs/top-main-bg.png"
                alt=""
                fill
                sizes="(min-width: 1024px) 70vw, 100vw"
                className="object-cover object-top"
              />
            </div>

            <div className="relative z-10">
              <h1 className="font-display text-4xl text-ink sm:text-5xl motion-safe:[animation:fadeUp_0.35s_ease-out_both]">
                Orders
              </h1>
              <p className="mt-2 text-sm text-ink/55 motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
                Everything you&apos;re buying, bidding on, and shipping — all in one place.
              </p>
            </div>
          </div>

          {/* Status tabs — mirrors the reference page's order-status strip */}
          <div className="mt-8 flex items-center gap-6 overflow-x-auto border-b border-ink/10 pb-px">
            {statusTabs.map((tab) => {
              const isActive = tab.key === activeTab
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative flex-none whitespace-nowrap pb-3 text-sm font-semibold transition-colors ${
                    isActive ? 'text-ink' : 'text-ink/45 hover:text-ink/70'
                  }`}
                >
                  {tab.label}
                  {!!tab.count && (
                    <span className="ml-1.5 rounded-full bg-teal-deep px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {tab.count}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-ink" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Search + filter row */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink/15 bg-card px-3 py-2.5">
              <Search size={16} className="flex-none text-ink/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Product name / order no."
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink/40 focus:outline-none"
              />
            </div>
            <button
              type="button"
              className="flex flex-none items-center gap-1.5 rounded-xl border border-ink/15 bg-card px-3.5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
            >
              <SlidersHorizontal size={15} />
              Filters
            </button>
          </div>

          {/* Active tab content */}
          {activeOrders.length === 0 ? (
            <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink/15 py-16 text-center">
              <PackageSearch size={32} className="text-ink/25" />
              <p className="mt-3 text-sm text-ink/50">Nothing here yet.</p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-3">
              {activeOrders.map(({ label, illustration: Illustration, view }) => (
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
          )}

          {/* Can't find your order */}
          <div className="mt-8">
            <p className="text-sm font-semibold text-ink">Can&apos;t find your order?</p>
            <button
              type="button"
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-ink/15 bg-card px-4 py-3.5 text-left text-sm font-semibold text-ink transition-colors hover:border-ink/30"
            >
              Self-service to find order
              <ChevronRight size={16} className="text-ink/45" />
            </button>
          </div>
        </div>

        <InfoRail />
      </div>
    </div>
  )
}