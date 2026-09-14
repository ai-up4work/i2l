// app/admin/(manager)/manager-dashboard/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, Archive, ClipboardCheck, Clock, Flag, PackageCheck, ShoppingBag, Store, Truck } from 'lucide-react'

import { useAdminData } from '@/contexts/AdminDataContext'
import { panelClass } from '@/components/admin/seller/shared'
import { AttentionList, QueueCard, StatCard, type AttentionItem } from '@/components/admin/dashboard/shared'
import {
  fetchAdminOrders,
  fetchSites,
  fetchPurchases,
  setOrderDelayed,
  getAdminQueue,
  isStageAgeBreached,
  hoursSince,
  STAGE_ORDER,
  STAGE_LABEL,
  type AdminOrder,
  type AdminPurchase,
} from '@/lib/supabase/orders-admin'

// Manager dashboard — full oversight, real data. Everything Sales sees
// plus the warehouse queues across every site (Manager isn't
// site-scoped, unlike Warehouse), plus one real actionable widget:
// bulk-flag orders that are over SLA and not yet flagged. Reads the same
// `orders`/`purchases` tables every other admin page and the customer's
// "My Orders" page reads — a flag set here is visible everywhere else on
// next load. A direct visit by a non-Manager role bounces back through
// the role-based redirector at /admin/dashboard.
export default function ManagerDashboardPage() {
  const router = useRouter()
  const { currentUser } = useAdminData()

  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [purchases, setPurchases] = useState<AdminPurchase[]>([])
  const [sites, setSites] = useState<{ id: string; name: string; location: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [justFlagged, setJustFlagged] = useState<number | null>(null)
  const [flagging, setFlagging] = useState(false)

  useEffect(() => {
    if (currentUser.role !== 'manager') router.replace('/admin/dashboard')
  }, [currentUser.role, router])

  async function load() {
    const [o, p, s] = await Promise.all([fetchAdminOrders(), fetchPurchases(), fetchSites()])
    setOrders(o)
    setPurchases(p)
    setSites(s)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const delayedCount = orders.filter((o) => o.delayed).length
  const breachedOrders = orders.filter((o) => isStageAgeBreached(o.stage, o.stageEnteredAt))
  const breachCount = breachedOrders.length
  const manualQuoteCount = orders.filter((o) => o.channel === 3 && o.stage !== 'delivered').length
  const inFlightValue = orders.filter((o) => o.stage !== 'delivered').reduce((sum, o) => sum + o.totalValue, 0)

  const pendingPurchases = purchases.filter((p) => p.status === 'pending').length
  const purchasedCount = purchases.filter((p) => p.status === 'purchased').length
  const failedPurchases = purchases.filter((p) => p.status === 'failed').length

  const stageBreakdown = useMemo(
    () => STAGE_ORDER.map((stage) => ({ stage, count: orders.filter((o) => o.stage === stage).length })),
    [orders],
  )
  const maxStageCount = Math.max(1, ...stageBreakdown.map((s) => s.count))

  const siteBreakdown = useMemo(
    () =>
      sites.map((site) => {
        const siteOrders = orders.filter((o) => o.siteId === site.id)
        return {
          site,
          total: siteOrders.length,
          delayed: siteOrders.filter((o) => o.delayed).length,
          breached: siteOrders.filter((o) => isStageAgeBreached(o.stage, o.stageEnteredAt)).length,
        }
      }),
    [sites, orders],
  )

  const attention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = []
    for (const p of purchases.filter((p) => p.status === 'failed')) {
      items.push({
        key: `purchase-${p.id}`,
        title: p.orderDisplayId ?? p.id.slice(0, 8),
        subtitle: `${p.customerName ?? 'Unknown'} · ${p.sourceStore}`,
        meta: 'Purchase failed',
        href: `/admin/purchases/${p.id}`,
        tone: 'rose',
      })
    }
    for (const o of orders.filter((o) => o.delayed)) {
      items.push({
        key: `delayed-${o.id}`,
        title: o.displayId,
        subtitle: `${o.customerName} · ${STAGE_LABEL[o.stage as keyof typeof STAGE_LABEL] ?? o.stage}`,
        meta: 'Delayed',
        href: `/admin/orders/${o.displayId}`,
        tone: 'amber',
      })
    }
    for (const o of breachedOrders) {
      if (o.delayed) continue
      items.push({
        key: `breach-${o.id}`,
        title: o.displayId,
        subtitle: `${o.customerName} · ${STAGE_LABEL[o.stage as keyof typeof STAGE_LABEL] ?? o.stage}`,
        meta: `${Math.round(hoursSince(o.stageEnteredAt))}h in stage`,
        href: `/admin/orders/${o.displayId}`,
        tone: 'amber',
      })
    }
    return items.slice(0, 10)
  }, [purchases, orders, breachedOrders])

  const unflaggedBreaches = breachedOrders.filter((o) => !o.delayed)

  async function handleFlagBreaches() {
    if (unflaggedBreaches.length === 0) return
    setFlagging(true)
    await Promise.all(unflaggedBreaches.map((o) => setOrderDelayed(o.id, true)))
    setFlagging(false)
    setJustFlagged(unflaggedBreaches.length)
    window.setTimeout(() => setJustFlagged(null), 4000)
    load()
  }

  if (currentUser.role !== 'manager') return null

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-24 pt-10 lg:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <Store size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Good to see you, {currentUser.name.split(' ')[0]}</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Full pipeline and warehouse overview across every site.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-card px-5 py-3 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">In flight</p>
            <p className="mt-0.5 font-display text-xl text-ink">{loading ? '—' : `Rs. ${inFlightValue.toLocaleString('en-LK')}`}</p>
          </div>
        </div>

        {justFlagged !== null && (
          <div className="mt-6 flex items-center gap-2.5 rounded-2xl border border-teal/25 bg-teal/[0.08] px-4 py-3 text-sm font-medium text-teal-deep">
            <Flag size={16} />
            {justFlagged} order{justFlagged === 1 ? '' : 's'} flagged for review.
          </div>
        )}

        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<ShoppingBag size={15} />} label="Total orders" value={loading ? '—' : orders.length} />
          <StatCard icon={<Activity size={15} />} label="Delayed" value={loading ? '—' : delayedCount} tone={delayedCount > 0 ? 'warning' : 'default'} />
          <StatCard icon={<Clock size={15} />} label="Over SLA" value={loading ? '—' : breachCount} tone={breachCount > 0 ? 'warning' : 'default'} />
          <StatCard icon={<Flag size={15} />} label="Manual quotes in flight" value={loading ? '—' : manualQuoteCount} />
        </div>

        {!loading && unflaggedBreaches.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-gold/[0.06] px-5 py-3.5">
            <p className="text-sm text-gold-deep">
              <span className="font-semibold">{unflaggedBreaches.length}</span> order{unflaggedBreaches.length === 1 ? ' is' : 's are'} over its stage SLA and not yet flagged.
            </p>
            <button
              type="button"
              disabled={flagging}
              onClick={handleFlagBreaches}
              className="rounded-xl bg-gold-deep px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Flag {unflaggedBreaches.length} for review
            </button>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <QueueCard
            icon={<ShoppingBag size={20} strokeWidth={1.75} />}
            label="Pending purchases"
            description="Orders still waiting to be bought from a seller."
            count={loading ? 0 : pendingPurchases}
            countLabel="orders"
            onOpen={() => router.push('/admin/purchases')}
          />
          <QueueCard
            icon={<PackageCheck size={20} strokeWidth={1.75} />}
            label="Purchased"
            description="Bought and moving through the warehouse pipeline."
            count={loading ? 0 : purchasedCount}
            countLabel="orders"
            onOpen={() => router.push('/admin/purchases')}
          />
          <QueueCard
            icon={<Flag size={20} strokeWidth={1.75} />}
            label="Failed"
            description="Needs a customer follow-up or a re-quote."
            count={loading ? 0 : failedPurchases}
            countLabel="orders"
            onOpen={() => router.push('/admin/purchases')}
          />
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink/70">Warehouse, all sites</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <QueueCard
              icon={<ClipboardCheck size={20} strokeWidth={1.75} />}
              label="Quality check"
              description="Items arrived on-site, waiting on inspection."
              count={loading ? 0 : orders.filter((o) => getAdminQueue(o.stage, o.substage) === 'qc').length}
              countLabel="pending"
              onOpen={() => router.push('/admin/qc')}
            />
            <QueueCard
              icon={<PackageCheck size={20} strokeWidth={1.75} />}
              label="Pack & label"
              description="Passed QC, waiting to be boxed and labeled."
              count={loading ? 0 : orders.filter((o) => getAdminQueue(o.stage, o.substage) === 'pack-label').length}
              countLabel="awaiting pack"
              onOpen={() => router.push('/admin/pack-label')}
            />
            <QueueCard
              icon={<Archive size={20} strokeWidth={1.75} />}
              label="Export bin"
              description="Packed and labeled, staged for courier pickup."
              count={loading ? 0 : orders.filter((o) => getAdminQueue(o.stage, o.substage) === 'export-bin').length}
              countLabel="in bin"
              onOpen={() => router.push('/admin/export-bin')}
            />
            <QueueCard
              icon={<Truck size={20} strokeWidth={1.75} />}
              label="In transit"
              description="Handed off to a courier, en route to the customer."
              count={loading ? 0 : orders.filter((o) => getAdminQueue(o.stage, o.substage) === 'in-transit').length}
              countLabel="en route"
              onOpen={() => router.push('/admin/in-transit')}
            />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className={`overflow-hidden lg:col-span-2 ${panelClass}`}>
            <div className="border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Pipeline breakdown</h2>
            </div>
            <div className="space-y-3 px-5 py-4">
              {stageBreakdown.map(({ stage, count }) => (
                <div key={stage} className="flex items-center gap-3">
                  <span className="w-28 flex-none text-xs font-medium text-ink/60">{STAGE_LABEL[stage]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                    <div className="h-full rounded-full bg-teal-deep/70" style={{ width: `${(count / maxStageCount) * 100}%` }} />
                  </div>
                  <span className="w-8 flex-none text-right text-xs font-semibold text-ink/70">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={`overflow-hidden ${panelClass}`}>
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Needs attention</h2>
              <span className="text-xs text-ink/40">{attention.length}</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto px-4">
              <AttentionList items={attention} emptyLabel="Nothing delayed, failed, or over SLA right now." />
            </div>
          </div>
        </div>

        {sites.length > 0 && (
          <div className={`mt-6 overflow-hidden ${panelClass}`}>
            <div className="border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">By site</h2>
            </div>
            <div className="divide-y divide-ink/[0.06]">
              {siteBreakdown.map(({ site, total, delayed, breached }) => (
                <div key={site.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-semibold text-ink">{site.name}</p>
                    <p className="text-xs text-ink/45">{site.location}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-ink/60">{total} orders</span>
                    {delayed > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                        {delayed} delayed
                      </span>
                    )}
                    {breached > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold-deep ring-1 ring-inset ring-gold/30">
                        {breached} over SLA
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
