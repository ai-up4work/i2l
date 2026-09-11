"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Printer, PackageCheck, AlertTriangle } from "lucide-react"

// Pack a single order: review contents + destination, carry over any
// handling notes flagged during QC, enter package weight/dimensions,
// generate a shipping label, then mark packed — which is the order's
// advance into the export bin per the pipeline spec.
//
// TODO: mock data — swap for a real fetch by orderId once the API exists.
// TODO: "generate label" currently just flips local UI state; wire to the
// real label-generation endpoint (and actual PDF/print output) later.

type PackItem = {
  id: string
  name: string
  variant: string
  qty: number
}

const MOCK_ORDER = {
  id: "WD-2288",
  customer: "Nadeesha K.",
  destination: {
    line1: "42/3 Lake Road",
    line2: "Kandy, Central Province",
    postcode: "20000",
    country: "Sri Lanka",
    phone: "+94 77 123 4567",
  },
  handlingNote: null as string | null,
  items: [
    { id: "i1", name: "Wireless earbuds", variant: "Matte black", qty: 1 },
  ] as PackItem[],
}

export default function PackLabelDetailPage() {
  const params = useParams<{ orderId: string }>()
  const router = useRouter()

  const [weight, setWeight] = useState("")
  const [length, setLength] = useState("")
  const [width, setWidth] = useState("")
  const [height, setHeight] = useState("")
  const [labelGenerated, setLabelGenerated] = useState(false)
  const [packed, setPacked] = useState(false)

  const dimensionsComplete = weight.trim() !== "" && length.trim() !== "" && width.trim() !== "" && height.trim() !== ""

  const handleGenerateLabel = () => {
    if (!dimensionsComplete) return
    setLabelGenerated(true)
  }

  const handleMarkPacked = () => {
    setPacked(true)
    // Advances the order into the export bin. Redirect back to the queue
    // after a short beat so the confirmation is visible.
    setTimeout(() => router.push("/admin/pack-label"), 900)
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/admin/pack-label"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
      >
        <ArrowLeft size={15} /> Back to Pack &amp; label
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {MOCK_ORDER.id}
          </h1>
          <p className="mt-1 text-sm text-ink/55">{MOCK_ORDER.customer} · {params.orderId}</p>
        </div>
        {packed && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/[0.08] px-3 py-1.5 text-sm font-medium text-teal-deep">
            <PackageCheck size={15} /> Packed
          </span>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Contents */}
        <section className="rounded-2xl border border-ink/10 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink/70">Contents</h2>
          <div className="flex flex-col gap-3">
            {MOCK_ORDER.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between border-b border-ink/[0.06] pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-ink">{item.name}</p>
                  <p className="text-xs text-ink/45">{item.variant}</p>
                </div>
                <span className="text-sm text-ink/60">×{item.qty}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Destination */}
        <section className="rounded-2xl border border-ink/10 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink/70">Destination</h2>
          <p className="text-sm leading-relaxed text-ink/70">
            {MOCK_ORDER.destination.line1}
            <br />
            {MOCK_ORDER.destination.line2}
            <br />
            {MOCK_ORDER.destination.postcode}, {MOCK_ORDER.destination.country}
          </p>
          <p className="mt-2 text-sm text-ink/50">{MOCK_ORDER.destination.phone}</p>
        </section>

        {/* Handling notes carried over from QC */}
        {MOCK_ORDER.handlingNote && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 md:col-span-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 flex-none text-amber-700" />
              <div>
                <h2 className="text-sm font-semibold text-amber-800">Handling note from QC</h2>
                <p className="mt-1 text-sm text-amber-700">{MOCK_ORDER.handlingNote}</p>
              </div>
            </div>
          </section>
        )}

        {/* Package details */}
        <section className="rounded-2xl border border-ink/10 bg-white p-5 md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-ink/70">Package details</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Weight (kg)" value={weight} onChange={setWeight} disabled={packed} />
            <Field label="Length (cm)" value={length} onChange={setLength} disabled={packed} />
            <Field label="Width (cm)" value={width} onChange={setWidth} disabled={packed} />
            <Field label="Height (cm)" value={height} onChange={setHeight} disabled={packed} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGenerateLabel}
              disabled={!dimensionsComplete || packed}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-parchment transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:bg-ink/20"
            >
              <Printer size={15} />
              {labelGenerated ? "Reprint label" : "Generate & print label"}
            </button>
            {!dimensionsComplete && (
              <span className="text-xs text-ink/40">Enter weight and dimensions to generate a label.</span>
            )}
            {labelGenerated && !packed && (
              <span className="text-xs text-teal-deep">Label ready.</span>
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleMarkPacked}
          disabled={!labelGenerated || packed}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-deep px-5 py-3 text-sm font-semibold text-parchment transition-colors hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/15"
        >
          <PackageCheck size={16} />
          {packed ? "Sent to export bin" : "Mark packed"}
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink/50">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.1"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/40 disabled:bg-ink/[0.03] disabled:text-ink/40"
      />
    </label>
  )
}