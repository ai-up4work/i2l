'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flag, Inbox, MessageSquare, ShoppingBag, TicketPercent } from 'lucide-react'
import { useAdminData } from '@/contexts/AdminDataContext'
import { LinkCard, QueueCard, StatCard } from '@/components/admin/dashboard/shared'
import { ADMIN_DISCOUNTS, getDiscountStatus } from '@/data/discounts/data'
import { fetchPurchases, type AdminPurchase } from '@/lib/supabase/orders-admin'

// "What needs my attention today" — a launchpad, not a full operational
// rollup (that's the manager dashboard). Every card links out; nothing
// edits inline. Pending purchases and discounts-nearing-expiry are real;
// open Channel 3 requests and unread chat threads route out via LinkCard
// since /admin/requests and /admin/chat aren't wired to real data yet.
export default function SalesDashboardPage() {
  const router = useRouter()
  const { currentUser } = useAdminData()
  const [purchases, setPurchases] = useState<AdminPurchase[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (currentUser.role !== 'sales') router.replace('/admin/dashboard')
  }, [currentUser.role, router])

  useEffect(() => {
    fetchPurchases().then((p) => {
      setPurchases(p)
      setLoading(false)
    })
  }, [])

  const pending = purchases.filter((p) => p.status === 'pending')
  const failed = purchases.filter((p) => p.status === 'failed')

  const now = Date.now()
  const expiringDiscounts = ADMIN_DISCOUNTS.filter((d) => {
    if (getDiscountStatus(d) !== 'active' || !d.endsAt) return false
    const end = new Date(d.endsAt).getTime()
    return end - now < 7 * 24 * 3_600_000
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Sales dashboard</h1>
        <p className="mt-1 font-body text-sm text-ink/55">What needs your attention today.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<ShoppingBag size={16} />} label="Pending purchases" value={loading ? '—' : pending.length} />
        <StatCard
          icon={<Flag size={16} />}
          label="Failed purchases"
          value={loading ? '—' : failed.length}
          tone={failed.length > 0 ? 'warning' : 'default'}
        />
        <StatCard icon={<TicketPercent size={16} />} label="Discounts expiring < 7 days" value={expiringDiscounts.length} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QueueCard
          icon={<ShoppingBag size={18} />}
          label="Purchases awaiting execution"
          description="Orders needing a purchase made on the customer's behalf."
          count={loading ? 0 : pending.length}
          countLabel="pending"
          flagCount={failed.length}
          flagLabel="failed — needs follow-up"
          onOpen={() => router.push('/admin/purchases')}
        />
        <LinkCard
          icon={<Inbox size={18} />}
          label="Channel 3 requests"
          description="Manual-quote requests awaiting pricing."
          onOpen={() => router.push('/admin/requests')}
        />
        <LinkCard
          icon={<MessageSquare size={18} />}
          label="Customer chat"
          description="Threads tied to your leads and orders."
          onOpen={() => router.push('/admin/chat')}
        />
      </div>

      {expiringDiscounts.length > 0 && (
        <div className="rounded-2xl border border-gold/30 bg-gold/10 p-5">
          <h2 className="font-display text-base font-semibold text-ink">Discounts nearing expiry</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {expiringDiscounts.map((d) => (
              <li key={d.id} className="flex items-center justify-between font-body text-sm text-ink/70">
                <span>{d.name}</span>
                <span className="text-xs text-ink/45">ends {new Date(d.endsAt!).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
