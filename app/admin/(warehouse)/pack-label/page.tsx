'use client'

import { useEffect, useState } from 'react'
import { useAdminData } from '@/contexts/AdminDataContext'
import { OrderQueueTable } from '@/components/admin/orders/OrderQueueTable'
import { fetchOrdersByQueue, type AdminOrder } from '@/lib/supabase/orders-admin'

// Orders that passed QC ('qc_passed'), awaiting packing & label generation.
export default function PackLabelQueuePage() {
  const { currentUser, permissions } = useAdminData()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const siteId = permissions.ordersScopedToOwnSite ? currentUser.siteId : undefined
    fetchOrdersByQueue('pack-label', siteId).then((o) => {
      setOrders(o)
      setLoading(false)
    })
  }, [currentUser.siteId, permissions.ordersScopedToOwnSite])

  const sorted = [...orders].sort((a, b) => new Date(a.stageEnteredAt).getTime() - new Date(b.stageEnteredAt).getTime())

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Pack & Label</h1>
        <p className="mt-1 font-body text-sm text-ink/55">
          {loading ? 'Loading…' : `${orders.length} order${orders.length === 1 ? '' : 's'}`} passed QC, waiting to
          be packed.
        </p>
      </div>
      <OrderQueueTable
        orders={sorted}
        detailBasePath="/admin/pack-label"
        loading={loading}
        emptyLabel="Nothing waiting to be packed right now."
        extraColumn={{ header: 'Destination', render: (o) => o.recipient?.city ?? '—' }}
      />
    </div>
  )
}
