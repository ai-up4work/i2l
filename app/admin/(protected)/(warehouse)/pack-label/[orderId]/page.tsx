// app/admin/pack-label/[orderId]/page.tsx
"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  PackageCheck,
  Printer,
  StickyNote,
} from "lucide-react"

import { useAdminData, hoursSince, formatAge } from "@/contexts/AdminDataContext"
import { CHANNEL_LABEL, PACK_STATUS_LABEL, type PackStatus } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"

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
//
// RESTYLE (2026-09): brought in line with /admin/orders/[orderId] and the
// other detail pages (same tokens, Pill/Meta/SectionCard, sticky
// breadcrumb top bar, colored left-edge accent). The packing workflow
// (weight/dimensions → label → mark packed) now lives in the sidebar next
// to the items it applies to. Every handler and piece of state below is
// unchanged — only markup/styling.

/* ---------- tokens (same as the order detail page) ---------- */

const TONE_DOT: Record<StatusTone, string> = {
  teal: "bg-teal-deep",
  amber: "bg-gold-deep",
  rose: "bg-rose-600",
}
const TONE_PILL: Record<StatusTone, string> = {
  teal: "bg-teal/12 text-teal-deep ring-teal/25",
  amber: "bg-gold/15 text-gold-deep ring-gold/30",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
}
const TONE_ACCENT: Record<StatusTone, string> = {
  teal: "border-l-teal-deep",
  amber: "border-l-gold-deep",
  rose: "border-l-rose-600",
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

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
const BTN_PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:bg-ink/15 disabled:text-ink/35 ${FOCUS}`
const BTN_OUTLINE = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-card px-4 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/[0.04] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`
const FIELD = `w-full rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm text-ink outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15 disabled:bg-ink/[0.03] disabled:text-ink/40`

/* ---------- small components (same as the order detail page) ---------- */

function Pill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${TONE_PILL[tone]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} />
      {children}
    </span>
  )
}

function Meta({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-xs text-ink/45">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

function SectionCard({
  title,
  count,
  className = "",
  children,
}: {
  title: string
  count?: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`flex flex-col rounded-2xl border border-ink/10 bg-card ${className}`}>
      <header className="flex items-baseline gap-2 px-5 pt-5">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {count !== undefined && <span className="text-sm text-ink/40">{count}</span>}
      </header>
      <div className="flex flex-1 flex-col p-5 pt-4">{children}</div>
    </section>
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
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink/70">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.1"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={FIELD}
      />
    </label>
  )
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
    dataLoading,
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

  if (dataLoading) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-8xl space-y-6 px-6 py-10 lg:px-10">
          <div className="h-6 w-40 animate-pulse rounded bg-ink/10" />
          <div className="h-40 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
          <div className="h-56 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
        </div>
      </div>
    )
  }

  if (!line || !order) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center lg:px-10">
          <h1 className="font-display text-xl text-ink">This order isn&apos;t in the Pack &amp; label queue</h1>
          <p className="mt-1.5 text-sm text-ink/50">
            It may not have passed QC yet, has already been picked up, or the order id is wrong.
          </p>
          <button type="button" onClick={() => router.push("/admin/pack-label")} className={`${BTN_OUTLINE} mt-5`}>
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

  const canPackNow = line.status === "awaiting_pack" && canAct

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-ink/[0.07] bg-parchment/90 backdrop-blur">
        <div className="mx-auto flex max-w-8xl items-center justify-between gap-4 px-6 py-3 lg:px-10">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <Link
              href="/admin/pack-label"
              className={`inline-flex items-center gap-1.5 rounded-md font-medium text-ink/55 hover:text-ink ${FOCUS}`}
            >
              <ArrowLeft size={15} />
              Pack &amp; label
            </Link>
            <ChevronRight size={14} className="text-ink/25" />
            <span className="truncate font-medium text-ink">{order.id}</span>
          </nav>

          <Link href={`/admin/orders/${order.id}`} className={BTN_OUTLINE}>
            View full order
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-8xl px-6 pb-8 pt-6 lg:px-10">
        {/* Confirmation banner */}
        {justPacked && (
          <div
            role="status"
            className="mb-6 flex items-center gap-2.5 rounded-2xl border border-teal/25 bg-teal/10 px-4 py-3 text-sm font-medium text-teal-deep"
          >
            <CheckCircle2 size={16} className="shrink-0" />
            Order packed and moved to the export bin, awaiting courier pickup.
          </div>
        )}

        {/* Summary */}
        <div className={`overflow-hidden rounded-2xl border border-l-4 border-ink/10 bg-card ${TONE_ACCENT[tone]}`}>
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="font-display text-3xl leading-none text-ink">{order.id}</h1>
              <Pill tone={tone}>{PACK_STATUS_LABEL[line.status]}</Pill>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ink/[0.07] pt-4 sm:grid-cols-3 lg:grid-cols-6">
              <Meta label="Customer">{order.customerName}</Meta>
              <Meta label="Channel">{CHANNEL_LABEL[order.channel]}</Meta>
              <Meta label="Site">{siteName}</Meta>
              <Meta label="Destination">
                <span title={line.destination}>{line.destination}</span>
              </Meta>
              <Meta label="Passed QC">{line.qcPassedAgeLabel} ago</Meta>
              <Meta label="Order age">{line.orderAgeLabel}</Meta>
            </dl>
          </div>
        </div>

        {line.handlingNote && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-gold/25 bg-gold/10 px-4 py-3 text-sm text-gold-deep">
            <StickyNote size={16} className="mt-0.5 flex-none" />
            <span>
              <span className="font-semibold">Handling note: </span>
              {line.handlingNote}
            </span>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main column: items + notes */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <SectionCard
              title="Items"
              count={line.itemCount}
              className={order.internalNotes.length === 0 ? "flex-1" : ""}
            >
              <ul className="divide-y divide-ink/[0.07]">
                {itemRows.map(({ item, purchase, qc }) => {
                  const qcTone = qc ? QC_STATUS_TONE[qc.status] : undefined
                  return (
                    <li
                      key={item.id}
                      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="h-16 w-16 flex-none overflow-hidden rounded-xl border border-ink/[0.08] bg-parchment/60">
                          {item.productImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.productImage} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="line-clamp-2 break-words text-sm font-semibold text-ink">{item.title}</p>
                          <p className="mt-0.5 truncate text-xs text-ink/55">
                            {item.variant ? `${item.variant}, ` : ""}Qty {item.quantity}
                            {purchase?.sellerName ? `, ${purchase.sellerName}` : ""}
                          </p>
                          {purchase?.purchaseReference && (
                            <p className="mt-0.5 truncate text-xs text-ink/40">Ref: {purchase.purchaseReference}</p>
                          )}
                        </div>
                      </div>

                      {qc && qcTone && (
                        <Pill tone={qcTone}>
                          QC {qc.status}
                        </Pill>
                      )}
                    </li>
                  )
                })}
              </ul>
            </SectionCard>

            {order.internalNotes.length > 0 && (
              <SectionCard title="Internal notes" className="flex-1">
                <ul className="space-y-2">
                  {order.internalNotes.map((note) => (
                    <li key={note.id} className="rounded-xl bg-parchment/60 p-3 text-sm">
                      <p className="whitespace-pre-wrap break-words text-ink/80">{note.body}</p>
                      <p className="mt-1.5 text-xs text-ink/45">
                        {note.author}, {formatAge(hoursSince(note.at))} ago
                      </p>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}
          </div>

          {/* Sidebar: package, label, pack */}
          <aside className="flex flex-col gap-6">
            <SectionCard title={line.status === "awaiting_pack" ? "Package and label" : "Package"} className="flex-1">
              {canPackNow && (
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Weight (kg)" value={weight} onChange={setWeight} disabled={labelReady} />
                    <Field label="Length (cm)" value={length} onChange={setLength} disabled={labelReady} />
                    <Field label="Width (cm)" value={width} onChange={setWidth} disabled={labelReady} />
                    <Field label="Height (cm)" value={height} onChange={setHeight} disabled={labelReady} />
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleGenerateLabel}
                      disabled={!dimensionsComplete}
                      className={`w-full ${BTN_OUTLINE}`}
                    >
                      <Printer size={15} />
                      {labelReady ? "Reprint label" : "Generate and print label"}
                    </button>
                    {!dimensionsComplete && (
                      <p className="mt-2 text-xs text-ink/45">Enter weight and dimensions to generate a label.</p>
                    )}
                    {labelReady && <p className="mt-2 text-xs font-medium text-teal-deep">Label {order.labelRef} ready.</p>}
                  </div>
                </div>
              )}

              {line.status === "packed" && (
                <dl className="space-y-3 text-sm">
                  {order.labelRef && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-ink/50">Label</dt>
                      <dd className="font-medium text-ink">{order.labelRef}</dd>
                    </div>
                  )}
                  {order.packageWeightKg != null && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-ink/50">Weight</dt>
                      <dd className="font-medium text-ink">{order.packageWeightKg} kg</dd>
                    </div>
                  )}
                  {order.packageDimensionsCm && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-ink/50">Dimensions</dt>
                      <dd className="font-medium text-ink">
                        {order.packageDimensionsCm.length} × {order.packageDimensionsCm.width} ×{" "}
                        {order.packageDimensionsCm.height} cm
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              <div className="mt-auto space-y-3 pt-5">
                {line.status === "packed" ? (
                  <p className="flex items-center gap-1.5 text-sm text-ink/55">
                    <CheckCircle2 size={14} className="shrink-0 text-teal-deep" />
                    Packed. Waiting in the export bin for courier pickup.
                  </p>
                ) : !canAct ? (
                  <p className="flex items-center gap-1.5 text-sm text-ink/55">
                    <AlertTriangle size={14} className="shrink-0 text-gold-deep" />
                    You don&apos;t have permission to pack orders at this site.
                  </p>
                ) : !labelReady ? (
                  <p className="text-sm text-ink/55">Generate a shipping label before marking this order packed.</p>
                ) : (
                  <p className="text-sm text-ink/55">Label ready. This order can now be packed.</p>
                )}

                {canPackNow && (
                  <button type="button" onClick={handlePack} disabled={!labelReady} className={`w-full ${BTN_PRIMARY}`}>
                    <PackageCheck size={16} />
                    Mark packed
                  </button>
                )}
              </div>
            </SectionCard>
          </aside>
        </div>
      </div>
    </div>
  )
}