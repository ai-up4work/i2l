// components/admin/reports/shared.tsx
//
// Presentational-only components for the Reports pages. No data
// fetching or business logic here — that all lives in lib/admin/reports.ts
// so the two report pages can never compute a metric differently.

import type { ReactNode } from "react"

export function SummaryCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon?: ReactNode
  label: string
  value: string
  hint?: string
  tone?: "default" | "warning" | "positive"
}) {
  const toneClass = tone === "warning" ? "text-red-700" : tone === "positive" ? "text-emerald-700" : "text-ink"
  return (
    <div className="rounded-xl border border-ink/10 bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-ink/50">
        {icon}
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink/40">{hint}</p>}
    </div>
  )
}

interface TrendBarChartPoint {
  key: string
  label: string
  value: number | null
  countLabel?: string
}

/**
 * Lightweight, dependency-free trend chart — a row of height-scaled
 * bars with a native `title` tooltip per bar (exact date + value on
 * hover) rather than a full charting library. Buckets with no data
 * still render as a faint minimum-height bar so a quiet day reads as
 * "quiet, zero," not as a rendering gap. Only the first/last date
 * label is shown under the axis — daily buckets over 30–90 days would
 * make a label per bar unreadable.
 */
export function TrendBarChart({
  title,
  points,
  emptyLabel,
  formatValue,
}: {
  title: string
  points: TrendBarChartPoint[]
  emptyLabel: string
  formatValue: (v: number) => string
}) {
  const withValues = points.filter((p): p is TrendBarChartPoint & { value: number } => p.value !== null)
  const hasData = withValues.length > 0
  const max = Math.max(...withValues.map((p) => p.value), 1)

  return (
    <div>
      <p className="text-xs font-semibold text-ink/50">{title}</p>
      {!hasData ? (
        <p className="mt-4 text-sm text-ink/40">{emptyLabel}</p>
      ) : (
        <>
          <div className="mt-3 flex h-32 items-end gap-[3px]">
            {points.map((p) => {
              const heightPct = p.value !== null ? Math.max((p.value / max) * 100, 4) : 4
              return (
                <div
                  key={p.key}
                  className="group relative h-full flex-1"
                  title={`${p.label}: ${p.value !== null ? formatValue(p.value) : "no data"}${
                    p.countLabel ? ` (${p.countLabel})` : ""
                  }`}
                >
                  <div className="absolute inset-x-0 bottom-0 flex h-full items-end">
                    <div
                      className={`w-full rounded-t-sm transition-colors ${
                        p.value === null ? "bg-ink/5" : "bg-teal-deep/55 group-hover:bg-teal-deep"
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-ink/35">
            <span>{points[0]?.label}</span>
            <span>{points[points.length - 1]?.label}</span>
          </div>
        </>
      )}
    </div>
  )
}