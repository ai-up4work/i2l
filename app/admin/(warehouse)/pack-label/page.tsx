"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { PackageCheck, Search } from "lucide-react"

// Pack & label queue — orders that passed QC at this site, awaiting packing.
// Mirrors the visual pattern established on /admin/qc: icon header, pill
// tabs with live counts, search, uppercase-label table. Rows are per-order
// here (not per-item like QC), since packing/labeling is an order-level
// action, not a per-line-item one.
//
// TODO: mock data — swap for real fetch scoped to the logged-in Warehouse
// account's site once the API exists.

type PackOrder = {
  id: string
  customer: string
  channel: "Affiliated store" | "Scraped link" | "Manual quote"
  itemCount: number
  destination: string
  qcPassedAgeHours: number
  orderAge: string
  handlingNote: string | null
  status: "Awaiting pack" | "Packed"
}

const ORDERS: PackOrder[] = [
  {
    id: "WD-2281",
    customer: "Priyanka Silva",
    channel: "Affiliated store",
    itemCount: 3,
    destination: "Colombo 05",
    qcPassedAgeHours: 26,
    orderAge: "3d 4h",
    handlingNote: "Fragile — glass item, double-box",
    status: "Awaiting pack",
  },
  {
    id: "WD-2288",
    customer: "Nadeesha K.",
    channel: "Scraped link",
    itemCount: 1,
    destination: "Kandy",
    qcPassedAgeHours: 4,
    orderAge: "6h",
    handlingNote: null,
    status: "Awaiting pack",
  },
  {
    id: "WD-2270",
    customer: "Ruwan Jayasuriya",
    channel: "Manual quote",
    itemCount: 2,
    destination: "Galle",
    qcPassedAgeHours: 52,
    orderAge: "5d 12h",
    handlingNote: "Customer requested gift wrap",
    status: "Awaiting pack",
  },
  {
    id: "WD-2292",
    customer: "Ishara Fonseka",
    channel: "Affiliated store",
    itemCount: 1,
    destination: "Negombo",
    qcPassedAgeHours: 1,
    orderAge: "1d 2h",
    handlingNote: null,
    status: "Packed",
  },
]

const TABS = ["All", "Awaiting pack", "Packed"] as const
type Tab = (typeof TABS)[number]

const CHANNEL_BADGE: Record<PackOrder["channel"], string> = {
  "Affiliated store": "bg-indigo-50 text-indigo-700",
  "Scraped link": "bg-indigo-50 text-indigo-700",
  "Manual quote": "bg-amber-50 text-amber-700",
}

export default function PackLabelPage() {
  const [tab, setTab] = useState<Tab>("Awaiting pack")
  const [query, setQuery] = useState("")

  const counts = useMemo(
    () => ({
      All: ORDERS.length,
      "Awaiting pack": ORDERS.filter((o) => o.status === "Awaiting pack").length,
      Packed: ORDERS.filter((o) => o.status === "Packed").length,
    }),
    []
  )

  const rows = useMemo(() => {
    return ORDERS.filter((o) => {
      const matchesTab = tab === "All" ? true : o.status === tab
      const matchesQuery =
        query.trim() === "" ||
        o.id.toLowerCase().includes(query.toLowerCase()) ||
        o.customer.toLowerCase().includes(query.toLowerCase())
      return matchesTab && matchesQuery
    }).sort((a, b) => b.qcPassedAgeHours - a.qcPassedAgeHours)
  }, [tab, query])

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-white shadow-[0_2px_8px_rgba(32,36,43,0.08)]">
          <PackageCheck size={22} className="text-teal-deep" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Pack &amp; label</h1>
          <p className="mt-1 max-w-xl text-sm text-ink/55">
            Orders that passed quality check at Colombo Hub, ready to be packed and labeled for export.
          </p>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-teal-deep text-parchment"
                  : "bg-white text-ink/60 hover:bg-ink/[0.04]"
              }`}
            >
              {t} <span className={tab === t ? "text-parchment/70" : "text-ink/35"}>{counts[t]}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order or customer"
            className="w-72 rounded-full border border-ink/10 bg-white py-2 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-teal/40"
          />
        </div>
      </div>

      <p className="mb-2 text-sm text-ink/45">
        {rows.length} {rows.length === 1 ? "order" : "orders"}
      </p>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-indigo-500/70">
              <th className="px-5 py-3">Order</th>
              <th className="px-5 py-3">Destination</th>
              <th className="px-5 py-3">Items</th>
              <th className="px-5 py-3">Passed QC</th>
              <th className="px-5 py-3">Order age</th>
              <th className="px-5 py-3">Handling</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-ink/[0.06] last:border-0 hover:bg-ink/[0.02]">
                <td className="px-5 py-4">
                  <div className="font-semibold text-ink">{o.id}</div>
                  <div className="text-xs text-ink/45">{o.customer}</div>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${CHANNEL_BADGE[o.channel]}`}
                  >
                    {o.channel}
                  </span>
                </td>
                <td className="px-5 py-4 text-ink/70">{o.destination}</td>
                <td className="px-5 py-4 text-ink/70">{o.itemCount}</td>
                <td className="px-5 py-4 text-ink/70">{o.qcPassedAgeHours}h ago</td>
                <td className="px-5 py-4 text-ink/70">{o.orderAge}</td>
                <td className="px-5 py-4">
                  {o.handlingNote ? (
                    <span className="text-xs text-amber-700">{o.handlingNote}</span>
                  ) : (
                    <span className="text-ink/25">—</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                      o.status === "Packed"
                        ? "bg-teal/[0.08] text-teal-deep"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {o.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/admin/pack-label/${o.id}`}
                    className="text-sm font-medium text-teal-deep hover:underline"
                  >
                    {o.status === "Packed" ? "View" : "Pack"}
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-ink/40">
                  Nothing here right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}