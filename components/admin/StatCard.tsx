// components/admin/StatCard.tsx
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string
  value: string | number
  hint?: string
  tone?: "default" | "warning"
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === "warning" ? "border-red-100 bg-red-50/40" : "border-indigo-100 bg-white"
      }`}
    >
      <p className="text-xs font-medium text-indigo-400">{label}</p>
      <p className={`mt-1 font-serif text-2xl ${tone === "warning" ? "text-red-700" : "text-indigo-900"}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-indigo-400">{hint}</p>}
    </div>
  )
}