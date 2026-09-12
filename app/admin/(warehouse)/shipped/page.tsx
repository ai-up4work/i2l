// app/admin/shipped/page.tsx
"use client"

import { useRouter } from "next/navigation"
import {
  Archive,
  ArrowUpRight,
  Boxes,
  ChevronRight,
  PackageCheck,
  Truck,
} from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"

// Shipped — the overview for everything that falls under the order
// pipeline's single "Shipped" stage (see STAGE_ORDER in types/admin.ts).
// From an order's point of view there's no sub-stage here: it's either
// Quality check or Shipped or Delivered. But operationally "Shipped"
// actually covers three different queues an order moves through —
// Pack & label, Export bin, In transit — each its own page. This is the
// hub that ties them together so nobody has to remember three separate
// URLs.
//
// Previously the counts here were hand-typed constants the file's own
// TODO admitted were guesses meant to "roughly match" each queue's mock
// dataset — so this hub could silently disagree with the real pages the
// moment any of them changed. Now every number is computed straight from
// useAdminData()'s visiblePackLines / visibleExportBinLines /
// visibleInTransitLines, the same site-scoped data those three pages
// render from, so this hub can never drift out of sync with them again.

type StageKey = "pack-label" | "export-bin" | "in-transit"

type StageSummary = {
  key: StageKey
  label: string
  description: string
  count: number
  countLabel: string
  flagCount?: number
  flagLabel?: string
  icon: React.ReactNode
}

export default function ShippedPage() {
  const router = useRouter()
  const { visiblePackLines, visibleExportBinLines, visibleInTransitLines, sites, currentUser, permissions } =
    useAdminData()

  const awaitingPackCount = visiblePackLines.filter((l) => l.status === "awaiting_pack").length
  const inBinCount = visibleExportBinLines.length
  const inTransitCount = visibleInTransitLines.length
  const overdueCount = visibleInTransitLines.filter((l) => l.deliveryStatus === "overdue").length

  const STAGES: StageSummary[] = [
    {
      key: "pack-label",
      label: "Pack & label",
      description: "Passed QC, waiting to be boxed and labeled.",
      count: awaitingPackCount,
      countLabel: "awaiting pack",
      icon: <PackageCheck size={20} strokeWidth={1.75} />,
    },
    {
      key: "export-bin",
      label: "Export bin",
      description: "Packed and labeled, staged for courier pickup.",
      count: inBinCount,
      countLabel: "in bin",
      icon: <Archive size={20} strokeWidth={1.75} />,
    },
    {
      key: "in-transit",
      label: "In transit",
      description: "Handed off to a courier, en route to the customer.",
      count: inTransitCount,
      countLabel: "en route",
      flagCount: overdueCount,
      flagLabel: "overdue",
      icon: <Truck size={20} strokeWidth={1.75} />,
    },
  ]

  const totalInFlight = STAGES.reduce((sum, s) => sum + s.count, 0)
  const totalFlagged = STAGES.reduce((sum, s) => sum + (s.flagCount ?? 0), 0)

  const scopeLabel = permissions.ordersScopedToOwnSite
    ? sites.find((s) => s.id === currentUser.siteId)?.name ?? "your site"
    : "all sites"

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-8xl px-6 pb-24 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-white text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <Boxes size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold text-ink">Shipped</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Everything between Quality check and Delivered at {scopeLabel} — packed, staged, and moving.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-white px-5 py-3 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">In flight</p>
            <p className="mt-0.5 font-display text-xl text-ink">
              {totalInFlight}
              {totalFlagged > 0 && (
                <span className="ml-2 text-sm font-normal text-rose-600">{totalFlagged} need attention</span>
              )}
            </p>
          </div>
        </div>

        {/* ── Pipeline strip ── */}
        <div className="mt-9 flex items-center gap-2 overflow-x-auto rounded-2xl border border-ink/10 bg-white px-5 py-4">
          {STAGES.map((stage, i) => (
            <div key={stage.key} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => router.push(`/admin/${stage.key}`)}
                className="flex flex-1 flex-col items-center gap-1.5 rounded-xl px-3 py-2 text-center transition-colors hover:bg-parchment/60"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-teal/10 text-teal-deep">
                  {stage.icon}
                </span>
                <span className="whitespace-nowrap text-xs font-semibold text-ink">{stage.label}</span>
                <span className="text-[11px] text-ink/40">{stage.count}</span>
              </button>
              {i < STAGES.length - 1 && (
                <ChevronRight size={16} className="mx-1 flex-none text-ink/20" />
              )}
            </div>
          ))}
        </div>

        {/* ── Stage cards ── */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STAGES.map((stage) => (
            <StageCard key={stage.key} stage={stage} onOpen={() => router.push(`/admin/${stage.key}`)} />
          ))}
        </div>

        {/* ── Footnote ── */}
        <p className="mt-8 text-center text-xs text-ink/35">
          These are separate queues for the same pipeline stage — an order only moves to{" "}
          <span className="font-medium text-ink/50">Delivered</span> once it&apos;s marked delivered from{" "}
          <span className="font-medium text-ink/50">In transit</span>.
        </p>
      </div>
    </div>
  )
}

function StageCard({ stage, onOpen }: { stage: StageSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col items-start gap-4 rounded-2xl border border-ink/10 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(14,140,156,0.4)]"
    >
      <div className="flex w-full items-start justify-between">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep">
          {stage.icon}
        </span>
        <ArrowUpRight size={16} className="text-ink/20 transition-colors group-hover:text-teal-deep" />
      </div>

      <div>
        <h2 className="font-display text-base font-semibold text-ink">{stage.label}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink/50">{stage.description}</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-display text-2xl text-ink">{stage.count}</span>
        <span className="text-xs text-ink/40">{stage.countLabel}</span>
      </div>

      {stage.flagCount !== undefined && stage.flagCount > 0 && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
          {stage.flagCount} {stage.flagLabel}
        </span>
      )}
    </button>
  )
}