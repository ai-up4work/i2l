// components/admin/StageStepper.tsx
//
// Read-only visual of where an order sits in the pipeline. The actual
// stage-change controls (roll back / advance) live below this in the
// order detail page — this component only renders state, it never
// mutates it, so it stays safe to reuse anywhere an order's progress
// needs to be shown (e.g. a future customer-facing order status page).

import { STAGE_ORDER, type OrderStage } from "@/types/admin"

export function StageStepper({ current }: { current: OrderStage }) {
  const currentIdx = STAGE_ORDER.indexOf(current)

  return (
    <ol className="flex items-start">
      {STAGE_ORDER.map((stage, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "upcoming"
        return (
          <li key={stage} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  state === "done"
                    ? "bg-indigo-700 text-white"
                    : state === "current"
                      ? "bg-teal text-white"
                      : "border border-indigo-200 bg-white text-indigo-300"
                }`}
                aria-hidden
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span
                className={`whitespace-nowrap text-xs ${
                  state === "current" ? "font-medium text-indigo-900" : "text-indigo-400"
                }`}
              >
                {stage}
              </span>
            </div>
            {i < STAGE_ORDER.length - 1 && (
              <div className={`mx-2 h-px flex-1 translate-y-[-10px] ${i < currentIdx ? "bg-indigo-700" : "bg-indigo-100"}`} />
            )}
          </li>
        )
      })}
    </ol>
  )
}