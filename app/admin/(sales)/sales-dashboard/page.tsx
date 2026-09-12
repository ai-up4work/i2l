// app/admin/(sales)/sales-dashboard/page.tsx
"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Flag, Inbox, MessageSquare, ShoppingBag } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import { CHANNEL_LABEL, type Channel } from "@/types/admin"
import { INITIAL_DOMAINS, isDomainFlagged, daysAgo as domainDaysAgo } from "@/data/scrape-health/data"
import { panelClass } from "@/components/admin/seller/shared"
import { AttentionList, LinkCard, QueueCard, StatCard, type AttentionItem } from "@/components/admin/dashboard/shared"

// Sales dashboard — commercial and read-only. Sales can't mutate order
// stage or act on purchases (see canMutateOrderStage in
// AdminDataContext), and their real job per the Purchases page's own
// comments is the customer-facing follow-up when something's stuck — so
// this centers on manual-quote/Channel 3 orders and anything that needs
// a customer conversation, plus quick links to Requests, Purchases, and
// Customer chat, where their actual work happens. A direct visit by a
// non-Sales role bounces back through the role-based redirector at
// /admin/dashboard.

export default function SalesDashboardPage() {
  const router = useRouter()
  const { currentUser, visibleOrders, visiblePurchaseLines } = useAdminData()

  useEffect(() => {
    if (currentUser.role !== "sales") router.replace("/admin/dashboard")
  }, [currentUser.role, router])

  const manualQuoteOrders = visibleOrders.filter((o) => o.isManualQuote)
  const manualQuoteInFlight = manualQuoteOrders.filter((o) => o.stage !== "Delivered").length
  const channel3Total = visibleOrders.filter((o) => o.channel === 3).length
  const needsPurchase = visiblePurchaseLines.filter((l) => l.status === "needs_purchase").length
  const unavailable = visiblePurchaseLines.filter((l) => l.status === "unavailable").length

  const channelBreakdown = useMemo(() => {
    const channels: Channel[] = [1, 2, 3]
    return channels.map((channel) => ({
      channel,
      count: visibleOrders.filter((o) => o.channel === channel).length,
    }))
  }, [visibleOrders])

  // What actually needs a customer conversation — not a warehouse fix.
  const attention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = []

    for (const l of visiblePurchaseLines.filter((l) => l.status === "unavailable")) {
      items.push({
        key: `purchase-${l.id}`,
        title: l.productTitle,
        subtitle: `${l.orderNumber} · ${l.sellerName}`,
        meta: "Unavailable — needs follow-up",
        href: `/admin/purchases/${l.id}`,
        tone: "rose",
      })
    }
    for (const o of manualQuoteOrders.filter((o) => o.delayed)) {
      items.push({
        key: `manual-${o.id}`,
        title: o.id,
        subtitle: `${o.customerName} · ${o.stage}`,
        meta: "Delayed manual quote",
        href: `/admin/orders/${o.id}`,
        tone: "amber",
      })
    }
    return items.slice(0, 10)
  }, [visiblePurchaseLines, manualQuoteOrders])

  // Domains whose fallback-request volume has crossed the manual-work
  // threshold with no decision made — these are exactly what keeps
  // generating Channel 3 manual requests for Sales to handle by hand,
  // so a build-extractor/pursue-affiliate decision here directly cuts
  // their future workload. Note: this reads INITIAL_DOMAINS directly
  // (see data/scrape-health/data.ts) rather than a live context — the
  // Scrape health page has its own local useState, so a status change
  // made there won't be reflected here until a real ScrapeHealthContext
  // exists to share that state the way AdminDataContext does for orders.
  const scrapeHealthAttention = useMemo<AttentionItem[]>(() => {
    return INITIAL_DOMAINS.filter(isDomainFlagged)
      .sort((a, b) => b.requests30d - a.requests30d)
      .slice(0, 5)
      .map((d) => ({
        key: `domain-${d.domain}`,
        title: d.domain,
        subtitle: `${d.requests30d} requests/30d · last seen ${domainDaysAgo(d.lastSeen)}`,
        meta: "Needs decision",
        href: "/admin/scrape-health",
        tone: "rose" as const,
      }))
  }, [])
  const scrapeHealthFlaggedCount = useMemo(() => INITIAL_DOMAINS.filter(isDomainFlagged).length, [])

  // Guard comes AFTER every hook above so hook call order never changes
  // between renders, even as currentUser.role flips via the role switcher.
  if (currentUser.role !== "sales") return null

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-24 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <MessageSquare size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Good to see you, {currentUser.name.split(" ")[0]}</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Manual quotes, requests, and anything that needs a customer follow-up.
              </p>
            </div>
          </div>
        </div>

        {/* ── Stat strip ── */}
        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Flag size={15} />} label="Manual quotes in flight" value={manualQuoteInFlight} />
          <StatCard icon={<ShoppingBag size={15} />} label="Channel 3 orders" value={channel3Total} />
          <StatCard icon={<ShoppingBag size={15} />} label="Needs purchase" value={needsPurchase} hint="View only — ops action" />
          <StatCard icon={<Flag size={15} />} label="Unavailable" value={unavailable} tone={unavailable > 0 ? "warning" : "default"} />
        </div>

        {/* ── Quick links ── */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <LinkCard
            icon={<Inbox size={20} strokeWidth={1.75} />}
            label="Requests"
            description="Quote, confirm, or decline Channel 3 requests."
            onOpen={() => router.push("/admin/requests")}
          />
          <LinkCard
            icon={<ShoppingBag size={20} strokeWidth={1.75} />}
            label="Purchases"
            description="See what ops still needs to buy."
            onOpen={() => router.push("/admin/purchases")}
          />
          <LinkCard
            icon={<MessageSquare size={20} strokeWidth={1.75} />}
            label="Customer chat"
            description="Follow up on unavailable items or delayed quotes."
            onOpen={() => router.push("/admin/chat")}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── Channel mix ── */}
          <div className={`overflow-hidden ${panelClass}`}>
            <div className="border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Orders by channel</h2>
            </div>
            <div className="space-y-3 px-5 py-4">
              {channelBreakdown.map(({ channel, count }) => (
                <div key={channel} className="flex items-center justify-between text-sm">
                  <span className="text-ink/60">Ch. {channel} · {CHANNEL_LABEL[channel]}</span>
                  <span className="font-semibold text-ink">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Needs a customer conversation ── */}
          <div className={`overflow-hidden lg:col-span-2 ${panelClass}`}>
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Needs a customer conversation</h2>
              <span className="text-xs text-ink/40">{attention.length}</span>
            </div>
            <div className="px-4">
              <AttentionList items={attention} emptyLabel="Nothing waiting on a customer follow-up right now." />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}