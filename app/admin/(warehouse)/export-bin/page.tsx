'use client'

import { useEffect, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import { useAdminData } from '@/contexts/AdminDataContext'
import { StatusPill } from '@/components/admin/warehouse/status-pill'
import { fetchOrdersByQueue, setWarehouseSubstage, exportOrderToTransit, type AdminOrder } from '@/lib/supabase/orders-admin'

// Staging view of packed orders ('packed') queued for the next outbound
// export batch. "Pull one back" rolls it to 'qc_passed' (re-open for
// re-pack) rather than deleting anything — matches the route spec's note
// on handling an order that needs pulling before export.
export default function ExportBinPage() {
  const { currentUser, permissions } = useAdminData()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const siteId = permissions.ordersScopedToOwnSite ? currentUser.siteId : undefined
    const o = await fetchOrdersByQueue('export-bin', siteId)
    setOrders(o)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.siteId, permissions.ordersScopedToOwnSite])

  async function handlePull(order: AdminOrder) {
    setBusyId(order.id)
    await setWarehouseSubstage(order.id, 'qc_passed', currentUser.id, 'Pulled from export bin for re-pack')
    await load()
    setBusyId(null)
  }

  async function handleExport(order: AdminOrder) {
    setBusyId(order.id)
    await exportOrderToTransit(order.id, currentUser.id)
    await load()
    setBusyId(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Export Bin</h1>
        <p className="mt-1 font-body text-sm text-ink/55">
          {loading ? 'Loading…' : `${orders.length} order${orders.length === 1 ? '' : 's'}`} packed and staged for
          the next outbound batch.
        </p>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-card px-8 py-16 text-center">
          <PackageCheck className="mx-auto text-ink/20" size={28} />
          <p className="mt-3 font-body text-sm text-ink/50">Nothing staged for export right now.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <div key={order.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink/10 bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-ink">{order.displayId}</span>
                  <StatusPill label="Packed" tone="amber" />
                </div>
                <p className="mt-1 truncate font-body text-sm text-ink/60">{order.customerName}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={busyId === order.id}
                  onClick={() => handlePull(order)}
                  className="rounded-full border border-ink/15 px-3 py-1.5 font-body text-xs font-semibold text-ink/60 disabled:opacity-40"
                >
                  Pull back
                </button>
                <button
                  disabled={busyId === order.id}
                  onClick={() => handleExport(order)}
                  className="rounded-full bg-ink px-3 py-1.5 font-body text-xs font-semibold text-parchment disabled:opacity-40"
                >
                  Mark exported
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
