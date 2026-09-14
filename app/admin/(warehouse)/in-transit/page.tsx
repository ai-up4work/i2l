'use client'

import { useEffect, useState } from 'react'
import { Truck } from 'lucide-react'
import { useAdminData } from '@/contexts/AdminDataContext'
import { fetchOrdersByQueue, setOrderShipping, setWarehouseSubstage, type AdminOrder } from '@/lib/supabase/orders-admin'

// Orders in cross-border transit ('in_transit'). Carrier/tracking are
// updated manually here (real orders.carrier / orders.tracking_number
// columns — the same fields the customer's Track Order page reads),
// unless/until a carrier API is integrated. "Arrived" advances to
// 'shipped' — the Shipped page's "awaiting delivery confirmation" queue.
export default function InTransitPage() {
  const { currentUser, permissions } = useAdminData()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, { carrier: string; tracking: string }>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const siteId = permissions.ordersScopedToOwnSite ? currentUser.siteId : undefined
    const o = await fetchOrdersByQueue('in-transit', siteId)
    setOrders(o)
    setDrafts(Object.fromEntries(o.map((ord) => [ord.id, { carrier: ord.carrier ?? '', tracking: ord.trackingNumber ?? '' }])))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.siteId, permissions.ordersScopedToOwnSite])

  async function handleSaveTracking(order: AdminOrder) {
    setBusyId(order.id)
    const d = drafts[order.id]
    await setOrderShipping(order.id, { carrier: d.carrier || undefined, trackingNumber: d.tracking || undefined })
    setBusyId(null)
  }

  async function handleArrived(order: AdminOrder) {
    setBusyId(order.id)
    await setWarehouseSubstage(order.id, 'arrived', currentUser.id, 'Arrived — awaiting delivery confirmation')
    await load()
    setBusyId(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">In Transit</h1>
        <p className="mt-1 font-body text-sm text-ink/55">
          {loading ? 'Loading…' : `${orders.length} order${orders.length === 1 ? '' : 's'}`} currently in
          cross-border transit.
        </p>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-card px-8 py-16 text-center">
          <Truck className="mx-auto text-ink/20" size={28} />
          <p className="mt-3 font-body text-sm text-ink/50">Nothing in transit right now.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => {
            const d = drafts[order.id] ?? { carrier: '', tracking: '' }
            return (
              <div key={order.id} className="flex flex-col gap-3 rounded-2xl border border-ink/10 bg-card p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-sm font-semibold text-ink">{order.displayId}</span>
                  <p className="mt-1 truncate font-body text-sm text-ink/60">{order.customerName}</p>
                </div>
                <input
                  value={d.carrier}
                  onChange={(e) => setDrafts((s) => ({ ...s, [order.id]: { ...s[order.id], carrier: e.target.value } }))}
                  placeholder="Carrier"
                  className="w-full rounded-lg border border-ink/15 bg-parchment px-2.5 py-1.5 font-body text-xs text-ink outline-none focus:border-teal sm:w-32"
                />
                <input
                  value={d.tracking}
                  onChange={(e) => setDrafts((s) => ({ ...s, [order.id]: { ...s[order.id], tracking: e.target.value } }))}
                  placeholder="Tracking #"
                  className="w-full rounded-lg border border-ink/15 bg-parchment px-2.5 py-1.5 font-body text-xs text-ink outline-none focus:border-teal sm:w-40"
                />
                <div className="flex gap-2">
                  <button
                    disabled={busyId === order.id}
                    onClick={() => handleSaveTracking(order)}
                    className="rounded-full border border-ink/15 px-3 py-1.5 font-body text-xs font-semibold text-ink/60 disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    disabled={busyId === order.id}
                    onClick={() => handleArrived(order)}
                    className="rounded-full bg-ink px-3 py-1.5 font-body text-xs font-semibold text-parchment disabled:opacity-40"
                  >
                    Arrived
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
