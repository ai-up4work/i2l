// app/admin/orders/[orderId]/page.tsx
"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, ChevronRight, MessageSquare, PencilLine } from "lucide-react"

import { useAdminData, hoursSince, formatAge } from "@/contexts/AdminDataContext"
import { STAGE_ORDER, CHANNEL_LABEL, type Channel, type Order, type OrderStage } from "@/types/admin"
import type { StatusTone } from "@/components/admin/warehouse/status-pill"
import { AnimatedItemCardStack } from "@/components/admin/orders/AnimatedItemCardStack"
import { fetchQcIssuesForItems, type CustomerVisibleQcIssue } from "@/lib/supabase/qc-issues"
import QcIssueBanner from "@/components/shared/QcIssueBanner"

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

const FALLBACK_PRODUCT_IMAGE =
  "https://images.pexels.com/photos/5632402/pexels-photo-5632402.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"

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

function QcIssuePill() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
      <AlertTriangle size={11} className="shrink-0" />
      QC issue
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

// Same distinct-channel derivation as /admin/orders' orderChannels() —
// kept in sync deliberately so a mixed order (e.g. one catalogue item +
// one pasted-link item bundled into a single cart checkout) shows the
// same set of badges whether you're scanning the list or looking at its
// detail page, instead of the header collapsing to just order.channel.
function orderChannels(o: Order): Channel[] {
  const set = new Set<Channel>(o.items.map((i) => i.channel ?? o.channel))
  return ([1, 2, 3] as Channel[]).filter((c) => set.has(c))
}

function orderAccent(stage: OrderStage, delayed: boolean): string {
  if (delayed) return "border-l-rose-500"
  switch (stage) {
    case "Ordered":
      return "border-l-ink/15"
    case "Quality check":
      return "border-l-gold-deep"
    case "Shipped":
    case "Delivered":
      return "border-l-teal-deep"
  }
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
    deleteOrder,
    dataLoading,
  } = useAdminData()

  const order = getOrder(orderId)
  const [noteDraft, setNoteDraft] = useState("")
  const [advanceError, setAdvanceError] = useState<string | null>(null)
  const [rollbackError, setRollbackError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [qcIssuesByItemId, setQcIssuesByItemId] = useState<Map<string, CustomerVisibleQcIssue>>(new Map())
  useEffect(() => {
    if (!order) return
    const itemIds = order.items.map((i) => i.id).filter((id): id is string => !!id)
    if (!itemIds.length) return
    fetchQcIssuesForItems(itemIds).then(setQcIssuesByItemId)
  }, [order])

  if (dataLoading) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-3xl px-6 py-16 lg:px-10">
          <div className="h-48 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
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

  const canOverride = permissions.canOverrideOrderStage
  const canAddNote =
    permissions.canMutateOrderStage && (!permissions.ordersScopedToOwnSite || order.siteId === currentUser.siteId)

  const siteName = sites.find((s) => s.id === order.siteId)?.name ?? order.siteId
  const stageIdx = STAGE_ORDER.indexOf(order.stage)
  const advanceCheck = canAdvanceStage(order.id)
  const accent = orderAccent(order.stage, order.delayed)
  const hasOpenQcIssue = [...qcIssuesByItemId.values()].some((issue) => issue.resolution === "pending")

  const handleAdvance = () => {
    const result = advanceStage(order.id)
    setAdvanceError(result.allowed ? null : result.reason ?? "This order can't advance yet.")
  }

  const handleRollback = () => {
    const result = rollbackStage(order.id)
    setRollbackError(result.allowed ? null : result.reason ?? "This order can't roll back.")
  }

  const handleDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    deleteOrder(order.id)
    router.push("/admin/orders")
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-8xl px-6 pb-20 pt-8 lg:px-10">
        <button
          type="button"
          onClick={() => router.push("/admin/orders")}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
        >
          <ArrowLeft size={15} />
          Back to Orders
        </button>

        {permissions.canDelete && (
          <div className="mb-6 -mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleDelete}
              onBlur={() => setConfirmingDelete(false)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                confirmingDelete
                  ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
                  : "border-red-600/25 bg-red-600/5 text-red-700 hover:bg-red-600/10"
              }`}
            >
              {confirmingDelete ? "Click again to permanently delete" : "Delete order"}
            </button>
          </div>
        )}

        <div className={`overflow-hidden rounded-2xl border border-ink/10 border-l-4 bg-card ${accent}`}>
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
            <div className="h-28 w-full flex-none sm:w-56">
              <AnimatedItemCardStack items={order.items} className="h-full" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="font-display text-2xl text-ink">{order.id}</h1>
                    {hasOpenQcIssue && <QcIssuePill />}
                    {order.delayed && <DelayedPill />}
                  </div>
                  <p className="mt-1.5 text-sm text-ink/55">
                    {order.customerName} <span className="text-ink/25">·</span> {siteName}{" "}
                    <span className="text-ink/25">·</span> placed {formatAge(hoursSince(order.placedAt))} ago
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {orderChannels(order).map((ch) => (
                      <Pill key={ch} tone={CHANNEL_TONE[ch]}>
                        Ch. {ch} · {CHANNEL_LABEL[ch]}
                      </Pill>
                    ))}
                    {order.isManualQuote && <Pill tone="amber">Manual quote</Pill>}
                    <Pill tone={STAGE_TONE[order.stage]}>{order.stage}</Pill>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Total</p>
                  <p className="mt-0.5 font-display text-xl text-ink">Rs. {order.totalValue.toLocaleString("en-US")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
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

            <SectionCard title="Items">
              {/* Per-item channel pill only shows once this order is
                  actually mixed (see orderChannels() above) — a
                  single-channel order already says so once in the header,
                  repeating it on every line would just be noise. */}
              <ul className="space-y-2.5">
                {order.items.map((item) => {
                  const issue = qcIssuesByItemId.get(item.id)
                  const itemChannel = item.channel ?? order.channel
                  const isMixedOrder = orderChannels(order).length > 1
                  return (
                    <li key={item.id} className="rounded-xl border border-ink/[0.06] bg-parchment/40 p-3.5 text-sm">
                      <div className="flex gap-3">
                        <img
                          src={item.productImage ?? FALLBACK_PRODUCT_IMAGE}
                          alt={item.title}
                          className="h-14 w-14 flex-none rounded-lg bg-ink/5 object-contain"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-ink">{item.title}</span>
                            <span className="shrink-0 text-ink/40">×{item.quantity}</span>
                          </div>
                          {isMixedOrder && (
                            <div className="mt-1">
                              <Pill tone={CHANNEL_TONE[itemChannel]}>
                                Ch. {itemChannel} · {CHANNEL_LABEL[itemChannel]}
                              </Pill>
                            </div>
                          )}
                          {item.variant && <p className="mt-1 text-xs text-ink/50">{item.variant}</p>}
                          {item.sku && <p className="mt-1 text-xs text-ink/45">Catalog SKU: {item.sku}</p>}
                          {item.sourceSnapshot && (
                            <p className="mt-1 text-xs text-ink/45">Source snapshot: {item.sourceSnapshot}</p>
                          )}
                          {item.requestLink && (
                            <p className="mt-1 line-clamp-2 break-all text-xs text-ink/45">
                              Original request link:{" "}
                              <a
                                href={item.requestLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-teal-deep underline hover:text-teal-deep/80"
                              >
                                {item.requestLink}
                              </a>
                            </p>
                          )}
                        </div>
                      </div>

                      {issue && (
                        <div className="mt-3 border-t border-ink/[0.06] pt-3">
                          <QcIssueBanner issue={issue} />
                          <Link
                            href={`/admin/qc-issues/${issue.id}`}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-deep hover:underline"
                          >
                            Manage this QC issue <ChevronRight size={12} />
                          </Link>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              <Link
                href="/admin/purchases"
                className="mt-3 inline-block text-xs font-semibold text-teal-deep hover:underline"
              >
                Manage purchasing for these items →
              </Link>
            </SectionCard>

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

          <div className="space-y-6">
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