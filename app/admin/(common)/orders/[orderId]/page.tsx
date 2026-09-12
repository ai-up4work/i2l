// app/admin/orders/[orderId]/page.tsx
"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ChevronRight, MessageSquare, PencilLine } from "lucide-react"

import { useAdminData, hoursSince, formatAge } from "@/contexts/AdminDataContext"
import { STAGE_ORDER, CHANNEL_LABEL, type OrderStage } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { panelClass } from "@/components/admin/seller/shared"

// Order detail — restyled to match Orders/Purchases: ink/parchment/card
// palette, font-display headers, the shared Pill tone system instead of
// the old indigo/teal/gold badge set. Backed by the same useAdminData()
// store the list page and Purchases read from, so nothing here is a
// local copy — editing stage/site/notes here is reflected everywhere
// else immediately.
//
// The Advance/Roll back buttons are the OVERRIDE tool, gated on
// canOverrideOrderStage (Manager only) — not canMutateOrderStage, which
// still governs the real per-stage actions on QC/Pack & label/Export
// bin/In transit for Warehouse-at-own-site + Manager-anywhere. A
// Warehouse user opening this page sees the stage pips and history as
// read-only, with a note pointing them to the actual queue action.

const TONE_PILL: Record<StatusTone, string> = {
  teal: "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25",
  amber: "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
}
const TONE_DOT: Record<StatusTone, string> = {
  teal: "bg-teal-deep",
  amber: "bg-gold-deep",
  rose: "bg-rose-600",
}
const INK_PILL = "bg-ink/[0.04] text-ink/60 ring-1 ring-inset ring-ink/10"
const INK_DOT = "bg-ink/30"

function Pill({ tone, children }: { tone: StatusTone | "ink"; children: React.ReactNode }) {
  const pillClass = tone === "ink" ? INK_PILL : TONE_PILL[tone]
  const dotClass = tone === "ink" ? INK_DOT : TONE_DOT[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${pillClass}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
      {children}
    </span>
  )
}

function DelayedPill() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
      Delayed
    </span>
  )
}

const CHANNEL_TONE: Record<1 | 2 | 3, StatusTone | "ink"> = { 1: "teal", 2: "ink", 3: "amber" }
const STAGE_TONE: Record<OrderStage, StatusTone | "ink"> = {
  "Ordered": "ink",
  "Quality check": "amber",
  "Shipped": "teal",
  "Delivered": "teal",
}

function StagePips({ current }: { current: OrderStage }) {
  const currentIdx = STAGE_ORDER.indexOf(current)
  return (
    <div className="flex items-center">
      {STAGE_ORDER.map((stage, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        return (
          <div key={stage} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                  active
                    ? "bg-teal-deep text-white"
                    : done
                    ? "bg-teal/15 text-teal-deep"
                    : "bg-ink/[0.05] text-ink/35"
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-[11px] font-medium ${active ? "text-ink" : "text-ink/45"}`}>{stage}</span>
            </div>
            {i < STAGE_ORDER.length - 1 && (
              <div className={`mx-2 h-px flex-1 ${done ? "bg-teal-deep/40" : "bg-ink/10"}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink/10 bg-card p-5">
      <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const router = useRouter()
  const {
    getOrder,
    sites,
    currentUser,
    permissions,
    advanceStage,
    rollbackStage,
    canAdvanceStage,
    reassignSite,
    addInternalNote,
  } = useAdminData()

  const order = getOrder(orderId)
  const [noteDraft, setNoteDraft] = useState("")
  const [advanceError, setAdvanceError] = useState<string | null>(null)
  const [rollbackError, setRollbackError] = useState<string | null>(null)

  if (!order) {
    return (
      <div className="min-h-screen bg-parchment font-body text-ink">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center lg:px-10">
          <p className="text-sm text-ink/50">Order {orderId} not found.</p>
          <button
            type="button"
            onClick={() => router.push("/admin/orders")}
            className="mt-3 text-sm font-medium text-teal-deep hover:underline"
          >
            Back to orders
          </button>
        </div>
      </div>
    )
  }

  // The Advance/Roll back override is Manager-only, everywhere — unlike
  // the real per-stage actions, this isn't a "your own site" thing, it's
  // "your role" thing. Warehouse sees the pipeline as read-only here.
  const canOverride = permissions.canOverrideOrderStage

  // Adding a note is a normal per-order action, not an override — same
  // gate as the real queue actions: Warehouse can note orders at their
  // own site, Manager can note any order.
  const canAddNote =
    permissions.canMutateOrderStage && (!permissions.ordersScopedToOwnSite || order.siteId === currentUser.siteId)

  const siteName = sites.find((s) => s.id === order.siteId)?.name ?? order.siteId
  const stageIdx = STAGE_ORDER.indexOf(order.stage)
  const advanceCheck = canAdvanceStage(order.id)

  const handleAdvance = () => {
    const result = advanceStage(order.id)
    setAdvanceError(result.allowed ? null : result.reason ?? "This order can't advance yet.")
  }

  const handleRollback = () => {
    const result = rollbackStage(order.id)
    setRollbackError(result.allowed ? null : result.reason ?? "This order can't roll back.")
  }

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-8xl px-6 pb-20 pt-8 lg:px-10">
        <button
          type="button"
          onClick={() => router.push("/admin/orders")}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
        >
          <ArrowLeft size={15} />
          Back to Orders
        </button>

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl text-ink">{order.id}</h1>
              {order.delayed && <DelayedPill />}
            </div>
            <p className="mt-1.5 text-sm text-ink/55">
              {order.customerName} <span className="text-ink/25">·</span> {siteName}{" "}
              <span className="text-ink/25">·</span> placed {formatAge(hoursSince(order.placedAt))} ago
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <Pill tone={CHANNEL_TONE[order.channel]}>
                Ch. {order.channel} · {CHANNEL_LABEL[order.channel]}
              </Pill>
              {order.isManualQuote && (
                <Pill tone="amber">Manual quote</Pill>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-card px-5 py-3 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Total</p>
            <p className="mt-0.5 font-display text-xl text-ink">₹{order.totalValue.toLocaleString("en-IN")}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main column */}
          <div className="space-y-6 lg:col-span-2">
            {/* Stage control */}
            <SectionCard title="Pipeline stage">
              <StagePips current={order.stage} />

              {canOverride ? (
                <div className="mt-5 border-t border-ink/[0.06] pt-4">
                  <p className="mb-3 text-xs text-ink/40">
                    Manager override — normally this order advances on its own via Quality check, Pack &amp; label, and In transit.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleRollback}
                      disabled={stageIdx <= 0}
                      className="rounded-xl border border-ink/10 px-3.5 py-1.5 text-sm font-medium text-ink/60 hover:bg-ink/[0.04] hover:text-ink disabled:opacity-40"
                    >
                      ← Roll back
                    </button>
                    <button
                      type="button"
                      onClick={handleAdvance}
                      disabled={stageIdx >= STAGE_ORDER.length - 1 || !advanceCheck.allowed}
                      title={!advanceCheck.allowed ? advanceCheck.reason : undefined}
                      className="rounded-xl bg-teal-deep px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-teal disabled:opacity-40"
                    >
                      Advance →
                    </button>
                  </div>
                  {stageIdx < STAGE_ORDER.length - 1 && !advanceCheck.allowed && (
                    <p className="mt-2 text-xs text-rose-600">{advanceCheck.reason}</p>
                  )}
                  {advanceError && advanceError !== advanceCheck.reason && (
                    <p className="mt-2 text-xs text-rose-600">{advanceError}</p>
                  )}
                  {rollbackError && <p className="mt-2 text-xs text-rose-600">{rollbackError}</p>}
                </div>
              ) : (
                <p className="mt-5 border-t border-ink/[0.06] pt-4 text-sm text-ink/40">
                  This order moves forward automatically as it clears Purchases, Quality check, Pack &amp; label, and In
                  transit — only a manager can directly override its stage from here.
                </p>
              )}

              {permissions.canReassignSite && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink/[0.06] pt-4">
                  <label className="text-sm text-ink/55">Reassign site</label>
                  <select
                    value={order.siteId}
                    onChange={(e) => reassignSite(order.id, e.target.value)}
                    className="rounded-lg border border-ink/10 bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <span className="text-xs text-ink/40">Restarts QC at the new site if mid-QC.</span>
                </div>
              )}
            </SectionCard>

            {/* Items — channel-aware */}
            <SectionCard title="Items">
              <ul className="space-y-2.5">
                {order.items.map((item) => (
                  <li key={item.id} className="rounded-xl border border-ink/[0.06] bg-parchment/40 p-3.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-ink">{item.title}</span>
                      <span className="shrink-0 text-ink/40">×{item.quantity}</span>
                    </div>
                    {item.variant && <p className="mt-1 text-xs text-ink/50">{item.variant}</p>}
                    {item.sku && <p className="mt-1 text-xs text-ink/45">Catalog SKU: {item.sku}</p>}
                    {item.sourceSnapshot && (
                      <p className="mt-1 text-xs text-ink/45">Source snapshot: {item.sourceSnapshot}</p>
                    )}
                    {item.requestLink && (
                      <p className="mt-1 text-xs text-ink/45">
                        Original request link: <span className="underline">{item.requestLink}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <Link
                href="/admin/purchases"
                className="mt-3 inline-block text-xs font-semibold text-teal-deep hover:underline"
              >
                Manage purchasing for these items →
              </Link>
            </SectionCard>

            {/* Stage history — timeline */}
            <SectionCard title="Stage history">
              <ol className="space-y-4">
                {order.stageHistory.map((ev, i) => (
                  <li key={i} className="relative pl-5">
                    <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-teal-deep/70" />
                    {i < order.stageHistory.length - 1 && (
                      <span className="absolute left-[3px] top-3.5 h-[calc(100%+0.5rem)] w-px bg-ink/10" />
                    )}
                    <p className="text-sm font-medium text-ink">{ev.stage}</p>
                    <p className="text-xs text-ink/40">
                      {new Date(ev.at).toLocaleString()} · {ev.by}
                    </p>
                  </li>
                ))}
              </ol>
            </SectionCard>
          </div>

          {/* Side column */}
          <div className="space-y-6">
            {/* Linked chat thread */}
            <SectionCard title="Chat thread">
              {order.linkedRequestId ? (
                <Link
                  href={`/admin/chat?requestId=${order.linkedRequestId}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal/10 px-3.5 py-2 text-sm font-medium text-teal-deep hover:bg-teal/15"
                >
                  <MessageSquare size={14} />
                  Open thread for {order.linkedRequestId}
                  <ChevronRight size={14} className="text-teal-deep/50" />
                </Link>
              ) : (
                <p className="text-sm text-ink/35">No linked request for this order.</p>
              )}
            </SectionCard>

            {/* Internal notes — never customer-visible, never fed into chat.
                Amber tint matches the "manual quote" pill — both mark things
                a human wrote/priced by hand rather than the system. */}
            <section className="rounded-2xl border border-gold/30 bg-gold/[0.06] p-5">
              <h2 className="flex items-center gap-1.5 font-display text-base font-semibold text-ink">
                <PencilLine size={15} className="text-gold-deep" />
                Internal notes
              </h2>
              <p className="mb-3.5 mt-1 text-xs text-ink/45">Ops-only. Never shown to the customer.</p>

              <ul className="mb-3.5 space-y-2">
                {order.internalNotes.map((n) => (
                  <li key={n.id} className="rounded-xl bg-card/80 p-3 text-sm">
                    <p className="text-ink/80">{n.body}</p>
                    <p className="mt-1 text-xs text-ink/40">
                      {n.author} · {new Date(n.at).toLocaleString()}
                    </p>
                  </li>
                ))}
                {order.internalNotes.length === 0 && (
                  <li className="text-sm text-ink/35">No internal notes yet.</li>
                )}
              </ul>

              <div className="space-y-2">
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={2}
                  placeholder="Add a note for ops…"
                  disabled={!canAddNote}
                  className="w-full resize-none rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15 disabled:opacity-60"
                />
                {canAddNote ? (
                  <button
                    type="button"
                    onClick={() => {
                      addInternalNote(order.id, noteDraft)
                      setNoteDraft("")
                    }}
                    disabled={!noteDraft.trim()}
                    className="rounded-xl bg-teal-deep px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-teal disabled:opacity-40"
                  >
                    Add note
                  </button>
                ) : (
                  <p className="text-xs text-ink/40">This order belongs to a different site — you can view notes but not add one.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}