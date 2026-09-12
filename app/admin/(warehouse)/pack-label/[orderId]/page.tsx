// app/admin/pack-label/[orderId]/page.tsx
"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  CheckCircle2,
  MapPin,
  PackageCheck,
  Printer,
  ShieldCheck,
  StickyNote,
} from "lucide-react"

import { useAdminData, hoursSince, formatAge } from "@/contexts/AdminDataContext"
import { CHANNEL_LABEL, PACK_STATUS_LABEL, type PackStatus } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { panelClass } from "@/components/admin/seller/shared"

// Detail view for a single Pack & label row — weight/dimensions, label
// generation, and the final "mark packed" action, all backed by
// useAdminData() so this order also shows up correctly on Orders, and
// (once packed) on Export bin, then In transit, then Delivered. Nothing
// here is local mock state anymore: generateLabel/packOrder both write
// straight to the shared order record.
//
// Item ↔ purchase/QC matching used to go by `productTitle`, which works
// but is fragile — two items on the same order with the same title (or
// a renamed item) could collide or miss. Now that purchaseLines and
// qcLines both carry orderItemId, and purchaseLines guarantees exactly
// one entry per order item (see AdminDataContext), matching by
// item.id === orderItemId is both exact and always resolves.

const TONE_DOT: Record<StatusTone, string> = {
  teal: "bg-teal-deep",
  amber: "bg-gold-deep",
  rose: "bg-rose-600",
}
const TONE_PILL: Record<StatusTone, string> = {
  teal: "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25",
  amber: "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
}
const PACK_STATUS_TONE: Record<PackStatus, StatusTone> = {
  awaiting_pack: "amber",
  packed: "teal",
}
const QC_STATUS_TONE: Record<string, StatusTone> = {
  pending: "amber",
  passed: "teal",
  flagged: "rose",
}

export default function PackLabelDetailPage() {
  const router = useRouter()
  const params = useParams<{ orderId: string }>()
  const orderId = params.orderId

  const {
    getPackLine,
    getOrder,
    purchaseLines,
    qcLines,
    canActOnPackLine,
    generateLabel,
    packOrder,
    sites,
  } = useAdminData()

  const line = getPackLine(orderId)
  const order = getOrder(orderId)

  // Pre-fill from whatever's already on the order (e.g. a label generated
  // earlier, or on page reload) rather than always starting blank.
  const [weight, setWeight] = useState(order?.packageWeightKg?.toString() ?? "")
  const [length, setLength] = useState(order?.packageDimensionsCm?.length.toString() ?? "")
  const [width, setWidth] = useState(order?.packageDimensionsCm?.width.toString() ?? "")
  const [height, setHeight] = useState(order?.packageDimensionsCm?.height.toString() ?? "")
  const [justPacked, setJustPacked] = useState(false)

  const itemRows = useMemo(() => {
    if (!order) return []
    return order.items.map((item) => {
      const purchase = purchaseLines.find((p) => p.orderId === order.id && p.orderItemId === item.id)
      const qc = qcLines.find((q) => q.orderId === order.id && q.orderItemId === item.id)
      return { item, purchase, qc }
    })
  }, [order, purchaseLines, qcLines])

  if (!line || !order) {
    return (
      <div className="min-h-screen bg-parchment font-body text-ink">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center">
          <PackageCheck size={28} className="mx-auto text-ink/25" />
          <p className="mt-4 text-sm font-semibold text-ink/70">This order isn&apos;t in the Pack &amp; label queue</p>
          <p className="mt-1 text-xs text-ink/45">
            It may not have passed QC yet, has already been picked up, or the order id is wrong.
          </p>
          <button
            type="button"
            onClick={() => router.push("/admin/pack-label")}
            className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-card px-4 py-2 text-xs font-semibold text-ink/70 hover:text-ink"
          >
            <ArrowLeft size={14} /> Back to Pack &amp; label
          </button>
        </div>
      </div>
    )
  }

  const tone = PACK_STATUS_TONE[line.status]
  const canAct = canActOnPackLine(line)
  const siteName = sites.find((s) => s.id === order.siteId)?.name ?? order.siteId

  const dimensionsComplete = weight.trim() !== "" && length.trim() !== "" && width.trim() !== "" && height.trim() !== ""
  const labelReady = !!order.labelRef

  const handleGenerateLabel = () => {
    if (!dimensionsComplete) return
    generateLabel(order.id, Number(weight), {
      length: Number(length),
      width: Number(width),
      height: Number(height),
    })
  }

  const handlePack = () => {
    packOrder(order.id)
    setJustPacked(true)
  }

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-4xl px-6 pb-24 pt-10 lg:px-10">
        {/* ── Breadcrumb / back ── */}
        <button
          type="button"
          onClick={() => router.push("/admin/pack-label")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink/45 hover:text-ink/70"
        >
          <ArrowLeft size={14} /> Pack &amp; label
        </button>

        {/* ── Header ── */}
        <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <PackageCheck size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">{order.id}</h1>
              <p className="mt-1.5 text-sm text-ink/60">
                {order.customerName} · {CHANNEL_LABEL[order.channel]} · {siteName}
              </p>
            </div>
          </div>

          <span className={`inline-flex h-fit items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${TONE_PILL[tone]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
            {PACK_STATUS_LABEL[line.status]}
          </span>
        </div>

        {/* ── Confirmation banner ── */}
        {justPacked && (
          <div className="mt-6 flex items-center gap-2.5 rounded-2xl border border-teal/25 bg-teal/10 px-4 py-3 text-sm font-medium text-teal-deep">
            <CheckCircle2 size={16} />
            Order packed and moved to the export bin, awaiting courier pickup.
          </div>
        )}

        {/* ── Summary cards ── */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard icon={<MapPin size={16} />} label="Destination" value={line.destination} />
          <SummaryCard icon={<ShieldCheck size={16} />} label="Passed QC" value={`${line.qcPassedAgeLabel} ago`} />
          <SummaryCard icon={<Box size={16} />} label="Order age" value={line.orderAgeLabel} />
        </div>

        {line.handlingNote && (
          <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-gold/25 bg-gold/10 px-4 py-3 text-sm text-gold-deep">
            <StickyNote size={16} className="mt-0.5 flex-none" />
            <span>
              <span className="font-semibold">Handling note: </span>
              {line.handlingNote}
            </span>
          </div>
        )}

        {/* ── Items ── */}
        <div className={`mt-8 overflow-hidden ${panelClass}`}>
          <div className="border-b border-ink/10 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink/70">Items ({line.itemCount})</h2>
          </div>

          {itemRows.map(({ item, purchase, qc }) => {
            const qcTone = qc ? QC_STATUS_TONE[qc.status] : undefined
            return (
              <div
                key={item.id}
                className="flex flex-col gap-3 border-b border-ink/[0.06] px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-12 w-12 flex-none overflow-hidden rounded-xl border border-ink/10 bg-parchment">
                    {item.productImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.productImage} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                    <p className="truncate text-xs text-ink/50">
                      {item.variant ? `${item.variant} · ` : ""}Qty {item.quantity}
                      {purchase?.sellerName ? ` · ${purchase.sellerName}` : ""}
                    </p>
                    {purchase?.purchaseReference && (
                      <p className="truncate text-[11px] text-ink/35">Ref: {purchase.purchaseReference}</p>
                    )}
                  </div>
                </div>

                {qc && qcTone && (
                  <span className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_PILL[qcTone]}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[qcTone]}`} />
                    QC {qc.status}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Internal notes ── */}
        {order.internalNotes.length > 0 && (
          <div className={`mt-6 overflow-hidden ${panelClass}`}>
            <div className="border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Internal notes</h2>
            </div>
            <div className="divide-y divide-ink/[0.06]">
              {order.internalNotes.map((note) => (
                <div key={note.id} className="px-5 py-3.5">
                  <p className="text-sm text-ink/80">{note.body}</p>
                  <p className="mt-1 text-[11px] font-medium text-ink/40">
                    {note.author} · {formatAge(hoursSince(note.at))} ago
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Package details + label ── */}
        {line.status === "awaiting_pack" && canAct && (
          <section className={`mt-6 overflow-hidden ${panelClass}`}>
            <div className="border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Package details</h2>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Weight (kg)" value={weight} onChange={setWeight} disabled={labelReady} />
                <Field label="Length (cm)" value={length} onChange={setLength} disabled={labelReady} />
                <Field label="Width (cm)" value={width} onChange={setWidth} disabled={labelReady} />
                <Field label="Height (cm)" value={height} onChange={setHeight} disabled={labelReady} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGenerateLabel}
                  disabled={!dimensionsComplete}
                  className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-parchment transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:bg-ink/20"
                >
                  <Printer size={15} />
                  {labelReady ? "Reprint label" : "Generate & print label"}
                </button>
                {!dimensionsComplete && (
                  <span className="text-xs text-ink/40">Enter weight and dimensions to generate a label.</span>
                )}
                {labelReady && (
                  <span className="text-xs text-teal-deep">Label {order.labelRef} ready.</span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Action ── */}
        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {line.status === "packed" ? (
              <p className="flex items-center gap-1.5 text-sm text-ink/50">
                <CheckCircle2 size={14} className="text-teal-deep" />
                Packed — waiting in the export bin for courier pickup.
              </p>
            ) : !canAct ? (
              <p className="flex items-center gap-1.5 text-sm text-ink/50">
                <AlertTriangle size={14} className="text-gold-deep" />
                You don&apos;t have permission to pack orders at this site.
              </p>
            ) : !labelReady ? (
              <p className="text-sm text-ink/50">Generate a shipping label before marking this order packed.</p>
            ) : (
              <p className="text-sm text-ink/50">Label ready — this order can now be packed.</p>
            )}
          </div>

          {line.status === "awaiting_pack" && canAct && (
            <button
              type="button"
              onClick={handlePack}
              disabled={!labelReady}
              className="inline-flex items-center gap-2 rounded-full bg-teal-deep px-5 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_30px_-12px_rgba(14,140,156,0.6)] transition-transform hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:bg-ink/15 disabled:shadow-none"
            >
              <PackageCheck size={16} />
              Mark packed
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-card px-4 py-3.5">
      <div className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-parchment text-ink/50">{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink/40">{label}</p>
        <p className="truncate text-sm font-semibold text-ink">{value}</p>
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
        className="rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-teal/40 disabled:bg-ink/[0.03] disabled:text-ink/40"
      />
    </label>
  )
}