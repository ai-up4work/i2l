'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, PackageCheck } from 'lucide-react'
import { useAdminData } from '@/contexts/AdminDataContext'
import { StatusPill } from '@/components/admin/warehouse/status-pill'
import { fetchOrdersByQueue, confirmDelivery, type AdminOrder } from '@/lib/supabase/orders-admin'

// Orders marked 'shipped' — arrived/cleared, awaiting delivery
// confirmation. `delivered_confirmed_by` records whether Warehouse or the
// customer confirmed it (the customer can also self-confirm from their
// own account page) — either source moves the SAME real order to
// 'delivered', so the two never end up disagreeing about final state.
export default function ShippedPage() {
  const { currentUser, permissions } = useAdminData()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const siteId = permissions.ordersScopedToOwnSite ? currentUser.siteId : undefined
    const o = await fetchOrdersByQueue('shipped', siteId)
    setOrders(o)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.siteId, permissions.ordersScopedToOwnSite])

  async function handleMarkDelivered(order: AdminOrder) {
    setBusyId(order.id)
    await confirmDelivery(order.id, 'warehouse', currentUser.id)
    await load()
    setBusyId(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Shipped</h1>
        <p className="mt-1 font-body text-sm text-ink/55">
          {loading ? 'Loading…' : `${orders.length} order${orders.length === 1 ? '' : 's'}`} awaiting delivery
          confirmation.
        </p>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-card px-8 py-16 text-center">
          <PackageCheck className="mx-auto text-ink/20" size={28} />
          <p className="mt-3 font-body text-sm text-ink/50">Nothing awaiting delivery confirmation.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <div key={order.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink/10 bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-ink">{order.displayId}</span>
                  {order.carrier && <StatusPill label={order.carrier} tone="teal" />}
                </div>
                <p className="mt-1 truncate font-body text-sm text-ink/60">
                  {order.customerName}
                  {order.trackingNumber && ` · ${order.trackingNumber}`}
                </p>
              </div>
              <button
                disabled={busyId === order.id}
                onClick={() => handleMarkDelivered(order)}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 font-body text-xs font-semibold text-parchment disabled:opacity-40"
              >
                <CheckCircle2 size={13} /> Mark delivered
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
