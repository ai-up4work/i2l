'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Boxes, ClipboardCheck, Clock, Flag, PackageCheck, Truck } from 'lucide-react'
import { useAdminData } from '@/contexts/AdminDataContext'
import { QueueCard, StatCard } from '@/components/admin/dashboard/shared'
import { fetchAdminOrders, getAdminQueue, isStageAgeBreached, type AdminOrder, type AdminQueue } from '@/lib/supabase/orders-admin'

// This site's own queue at a glance — real counts, server-side filtered
// to the logged-in Warehouse account's site (or all sites, for a
// Manager previewing this view).
export default function WarehouseDashboardPage() {
  const router = useRouter()
  const { currentUser, permissions } = useAdminData()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const siteId = permissions.ordersScopedToOwnSite ? currentUser.siteId : undefined
    fetchAdminOrders({ siteId }).then((o) => {
      setOrders(o)
      setLoading(false)
    })
  }, [currentUser.siteId, permissions.ordersScopedToOwnSite])

  const queueCount = (queue: Exclude<AdminQueue, null>) =>
    orders.filter((o) => getAdminQueue(o.stage, o.substage) === queue).length
  const delayedCount = orders.filter((o) => o.delayed || isStageAgeBreached(o.stage, o.stageEnteredAt)).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Warehouse dashboard</h1>
        <p className="mt-1 font-body text-sm text-ink/55">
          {currentUser.siteId ? 'Your site\u2019s queues' : 'All sites'} — {loading ? 'loading…' : `${orders.length} active orders`}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Boxes size={16} />} label="Active orders" value={loading ? '—' : orders.length} />
        <StatCard
          icon={<Clock size={16} />}
          label="Delayed / SLA breach"
          value={loading ? '—' : delayedCount}
          tone={delayedCount > 0 ? 'warning' : 'default'}
        />
        <StatCard icon={<ClipboardCheck size={16} />} label="In QC" value={loading ? '—' : queueCount('qc')} />
        <StatCard icon={<PackageCheck size={16} />} label="Delivered" value={loading ? '—' : orders.filter((o) => o.stage === 'delivered').length} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QueueCard
          icon={<ClipboardCheck size={18} />}
          label="Quality Check"
          description="Orders awaiting inspection against what was ordered."
          count={loading ? 0 : queueCount('qc')}
          countLabel="waiting"
          onOpen={() => router.push('/admin/qc')}
        />
        <QueueCard
          icon={<Archive size={18} />}
          label="Pack & Label"
          description="Passed QC, waiting to be packed and labeled."
          count={loading ? 0 : queueCount('pack-label')}
          countLabel="waiting"
          onOpen={() => router.push('/admin/pack-label')}
        />
        <QueueCard
          icon={<Boxes size={18} />}
          label="Export Bin"
          description="Packed and staged for the next outbound batch."
          count={loading ? 0 : queueCount('export-bin')}
          countLabel="staged"
          onOpen={() => router.push('/admin/export-bin')}
        />
        <QueueCard
          icon={<Truck size={18} />}
          label="In Transit"
          description="Currently crossing the border."
          count={loading ? 0 : queueCount('in-transit')}
          countLabel="in transit"
          onOpen={() => router.push('/admin/in-transit')}
        />
        <QueueCard
          icon={<PackageCheck size={18} />}
          label="Shipped"
          description="Arrived, awaiting delivery confirmation."
          count={loading ? 0 : queueCount('shipped')}
          countLabel="awaiting confirmation"
          onOpen={() => router.push('/admin/shipped')}
        />
        <QueueCard
          icon={<Flag size={18} />}
          label="Delayed / aged"
          description="Sitting longer than this stage's normal threshold."
          count={loading ? 0 : delayedCount}
          countLabel="flagged"
          onOpen={() => router.push('/admin/orders')}
        />
      </div>
    </div>
  )
}
