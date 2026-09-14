'use client'

import { useEffect, useState } from 'react'
import { useAdminData } from '@/contexts/AdminDataContext'
import { OrderQueueTable } from '@/components/admin/orders/OrderQueueTable'
import { fetchOrdersByQueue, type AdminOrder } from '@/lib/supabase/orders-admin'

// Quality Check queue for this site — orders awaiting inspection against
// what was ordered. Real data: filters live orders at stage
// 'quality_check'. Advancing an order here (see [id]/page.tsx) moves it
// to 'qc_passed', which is what feeds the Pack & Label queue next.
export default function QcQueuePage() {
  const { currentUser, permissions } = useAdminData()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const siteId = permissions.ordersScopedToOwnSite ? currentUser.siteId : undefined
    fetchOrdersByQueue('qc', siteId).then((o) => {
      setOrders(o)
      setLoading(false)
    })
  }, [currentUser.siteId, permissions.ordersScopedToOwnSite])

  const sorted = [...orders].sort((a, b) => new Date(a.stageEnteredAt).getTime() - new Date(b.stageEnteredAt).getTime())

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Quality Check</h1>
        <p className="mt-1 font-body text-sm text-ink/55">
          {loading ? 'Loading…' : `${orders.length} order${orders.length === 1 ? '' : 's'}`} awaiting inspection,
          oldest first.
        </p>
      </div>
      <OrderQueueTable orders={sorted} detailBasePath="/admin/qc" loading={loading} emptyLabel="No orders waiting on QC right now." />
    </div>
  )
}
