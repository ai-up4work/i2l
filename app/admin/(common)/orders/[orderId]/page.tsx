// app/admin/orders/[orderId]/page.tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useAdminData,
  hoursSince,
  formatAge,
} from "@/contexts/AdminDataContext";
import { STAGE_ORDER } from "@/types/admin";

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const {
    getOrder,
    sites,
    currentUser,
    permissions,
    advanceStage,
    rollbackStage,
    reassignSite,
    addInternalNote,
  } = useAdminData();

  const order = getOrder(orderId);
  const [noteDraft, setNoteDraft] = useState("");

  if (!order) {
    return (
      <div className="rounded-xl border border-indigo-100 bg-white p-8 text-center">
        <p className="text-indigo-500">Order {orderId} not found.</p>
        <button
          onClick={() => router.push("/admin/orders")}
          className="mt-3 text-sm text-teal underline"
        >
          Back to orders
        </button>
      </div>
    );
  }

  // Warehouse can only act on orders at their own site — view is still
  // allowed (they wouldn't have a link to it otherwise from their own
  // queues, but guard anyway since the URL is directly reachable).
  const canMutateThisOrder =
    permissions.canMutateOrderStage &&
    (!permissions.ordersScopedToOwnSite || order.siteId === currentUser.siteId);

  const siteName = sites.find((s) => s.id === order.siteId)?.name ?? order.siteId;
  const stageIdx = STAGE_ORDER.indexOf(order.stage);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin/orders" className="text-xs text-teal underline">
            ← All orders
          </Link>
          <h1 className="mt-1 font-serif text-2xl text-indigo-900">{order.id}</h1>
          <p className="text-sm text-indigo-500">
            {order.customerName} · {siteName} · placed {formatAge(hoursSince(order.placedAt))} ago
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-indigo-400">Total</p>
          <p className="font-serif text-xl text-indigo-900">₹{order.totalValue.toLocaleString()}</p>
          {order.isManualQuote && (
            <span className="mt-1 inline-block rounded-full border border-gold bg-gold/15 px-2 py-0.5 text-xs text-amber-800">
              Manual quote — Channel 3
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Stage control */}
          <section className="rounded-xl border border-indigo-100 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-indigo-900">Pipeline stage</h2>
              <span className="rounded-full bg-teal/10 px-3 py-1 text-sm font-medium text-teal-700">
                {order.stage}
              </span>
            </div>

            {canMutateThisOrder && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => rollbackStage(order.id)}
                  disabled={stageIdx <= 0}
                  className="rounded-md border border-indigo-200 px-3 py-1.5 text-sm text-indigo-600 disabled:opacity-40"
                >
                  ← Roll back
                </button>
                <button
                  onClick={() => advanceStage(order.id)}
                  disabled={stageIdx >= STAGE_ORDER.length - 1}
                  className="rounded-md bg-teal px-3 py-1.5 text-sm text-white hover:bg-teal-700 disabled:opacity-40"
                >
                  Advance →
                </button>
              </div>
            )}

            {permissions.canReassignSite && (
              <div className="mt-4 flex items-center gap-2 border-t border-indigo-50 pt-3">
                <label className="text-sm text-indigo-500">Reassign site</label>
                <select
                  value={order.siteId}
                  onChange={(e) => reassignSite(order.id, e.target.value)}
                  className="rounded-md border border-indigo-200 px-2 py-1 text-sm"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <span className="text-xs text-indigo-400">Restarts QC at the new site if mid-QC.</span>
              </div>
            )}
          </section>

          {/* Items — channel-aware */}
          <section className="rounded-xl border border-indigo-100 bg-white p-4">
            <h2 className="mb-3 font-medium text-indigo-900">Items</h2>
            <ul className="space-y-2">
              {order.items.map((item) => (
                <li key={item.id} className="rounded-lg border border-indigo-50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-indigo-800">{item.title}</span>
                    <span className="text-indigo-400">×{item.quantity}</span>
                  </div>
                  {item.sku && (
                    <p className="mt-1 text-xs text-indigo-500">Catalog SKU: {item.sku}</p>
                  )}
                  {item.sourceSnapshot && (
                    <p className="mt-1 text-xs text-indigo-500">Source snapshot: {item.sourceSnapshot}</p>
                  )}
                  {item.requestLink && (
                    <p className="mt-1 text-xs text-indigo-500">
                      Original request link: <span className="underline">{item.requestLink}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Stage history */}
          <section className="rounded-xl border border-indigo-100 bg-white p-4">
            <h2 className="mb-3 font-medium text-indigo-900">Stage history</h2>
            <ol className="space-y-2 border-l border-indigo-100 pl-4">
              {order.stageHistory.map((ev, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium text-indigo-800">{ev.stage}</span>
                  <span className="text-indigo-400"> — {new Date(ev.at).toLocaleString()} · {ev.by}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          {/* Linked chat thread */}
          <section className="rounded-xl border border-indigo-100 bg-white p-4">
            <h2 className="mb-2 font-medium text-indigo-900">Chat thread</h2>
            {order.linkedRequestId ? (
              <Link
                href={`/admin/chat?requestId=${order.linkedRequestId}`}
                className="inline-flex items-center gap-1 rounded-md bg-teal/10 px-3 py-1.5 text-sm text-teal-700 hover:bg-teal/20"
              >
                Open thread for {order.linkedRequestId}
              </Link>
            ) : (
              <p className="text-sm text-indigo-300">No linked request for this order.</p>
            )}
          </section>

          {/* Internal notes — never customer-visible, never fed into chat */}
          <section className="rounded-xl border border-indigo-100 bg-white p-4">
            <h2 className="mb-1 font-medium text-indigo-900">Internal notes</h2>
            <p className="mb-3 text-xs text-indigo-400">Ops-only. Never shown to the customer.</p>

            <ul className="mb-3 space-y-2">
              {order.internalNotes.map((n) => (
                <li key={n.id} className="rounded-lg bg-indigo-50/60 p-2 text-sm">
                  <p className="text-indigo-800">{n.body}</p>
                  <p className="mt-1 text-xs text-indigo-400">{n.author} · {new Date(n.at).toLocaleString()}</p>
                </li>
              ))}
              {order.internalNotes.length === 0 && (
                <li className="text-sm text-indigo-300">No internal notes yet.</li>
              )}
            </ul>

            {canMutateThisOrder && (
              <div className="space-y-2">
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={2}
                  placeholder="Add a note for ops…"
                  className="w-full rounded-md border border-indigo-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                />
                <button
                  onClick={() => {
                    addInternalNote(order.id, noteDraft);
                    setNoteDraft("");
                  }}
                  disabled={!noteDraft.trim()}
                  className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                >
                  Add note
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}