// components/admin/dashboard/shared.tsx
//
// Small building blocks shared by the three role dashboards
// (app/admin/dashboard/warehouse, /sales, /manager). Pulled out here so
// the three pages read as three distinct views built from the same
// pieces, rather than three near-identical files that happen to diverge
// slightly — the same reasoning as components/admin/seller/shared.tsx.

import { useRouter } from "next/navigation"
import { ArrowUpRight, Inbox } from "lucide-react"
import { STAGE_AGE_THRESHOLD_HOURS, type OrderStage } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"

export const TONE_DOT: Record<StatusTone, string> = {
  teal: "bg-teal-deep",
  amber: "bg-gold-deep",
  rose: "bg-rose-600",
}
export const TONE_PILL: Record<StatusTone, string> = {
  teal: "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25",
  amber: "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
}

/** Same per-stage SLA check the Orders page uses — kept in one place so all three dashboards agree with it and each other. */
export function isOverThreshold(stage: OrderStage, stageHours: number) {
  const threshold = STAGE_AGE_THRESHOLD_HOURS[stage]
  return threshold !== Infinity && stageHours > threshold
}

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
  tone?: "default" | "warning"
}) {
  return (
    <div className={`rounded-2xl border p-5 ${tone === "warning" ? "border-rose-100 bg-rose-50/40" : "border-ink/10 bg-card"}`}>
      <div className="flex items-center gap-2 text-ink/45">
        {icon}
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className={`mt-2 font-display text-2xl ${tone === "warning" ? "text-rose-700" : "text-ink"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink/40">{hint}</p>}
    </div>
  )
}

export function QueueCard({
  icon,
  label,
  description,
  count,
  countLabel,
  flagCount,
  flagLabel,
  onOpen,
}: {
  icon: React.ReactNode
  label: string
  description: string
  count: number
  countLabel: string
  flagCount?: number
  flagLabel?: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col items-start gap-3 rounded-2xl border border-ink/10 bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(14,140,156,0.4)]"
    >
      <div className="flex w-full items-start justify-between">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep">
          {icon}
        </span>
        <ArrowUpRight size={16} className="text-ink/20 transition-colors group-hover:text-teal-deep" />
      </div>
      <div>
        <h3 className="font-display text-base font-semibold text-ink">{label}</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink/50">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-display text-2xl text-ink">{count}</span>
        <span className="text-xs text-ink/40">{countLabel}</span>
      </div>
      {flagCount !== undefined && flagCount > 0 && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
          {flagCount} {flagLabel}
        </span>
      )}
    </button>
  )
}

/** Small nav tile for pages a dashboard wants to surface but doesn't have a live count worth showing (e.g. Requests, whose data isn't wired into AdminDataContext yet). */
export function LinkCard({
  icon,
  label,
  description,
  onOpen,
}: {
  icon: React.ReactNode
  label: string
  description: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-3 rounded-2xl border border-ink/10 bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(14,140,156,0.4)]"
    >
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block truncate text-xs text-ink/50">{description}</span>
      </span>
      <ArrowUpRight size={16} className="flex-none text-ink/20 transition-colors group-hover:text-teal-deep" />
    </button>
  )
}

export type AttentionItem = {
  key: string
  title: string
  subtitle: string
  meta: string
  href: string
  tone: StatusTone
}

export function AttentionList({ items, emptyLabel }: { items: AttentionItem[]; emptyLabel: string }) {
  const router = useRouter()
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Inbox size={20} className="text-ink/25" />
        <p className="text-sm text-ink/45">{emptyLabel}</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-ink/[0.06]">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => router.push(item.href)}
          className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left transition-colors hover:bg-parchment/50"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
            <span className="block truncate text-xs text-ink/45">{item.subtitle}</span>
          </span>
          <span className={`inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[item.tone]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[item.tone]}`} />
            {item.meta}
          </span>
        </button>
      ))}
    </div>
  )
}