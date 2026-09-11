// components/admin/warehouse/status-pill.tsx
// Shared status vocabulary: amber = needs action, teal = resolved/good,
// rose = problem. Used by both the Purchases and QC screens so a color
// means the same thing everywhere in the ops surface.

export type StatusTone = "amber" | "teal" | "rose"

const TONE_STYLES: Record<StatusTone, string> = {
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  teal: "bg-teal/[0.1] text-teal-deep border-teal-deep/20",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
}

export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${TONE_STYLES[tone]}`}
    >
      {label}
    </span>
  )
}