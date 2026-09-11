// app/admin/orders/age/page.tsx
//
// Cross-order "time in stage" / SLA-breach view. Built as a SIBLING of
// [orderId] (/admin/orders/age, not /admin/orders/[orderId]/age) — the
// route spec flagged that nesting this under a single order would scope
// it to one order's history instead of the cross-order dashboard the
// spec actually describes. Confirm this is the intended version; if you
// actually wanted the per-order age trend, that's a different page.
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAdminData,
  hoursSince,
  formatAge,
} from "@/contexts/AdminDataContext";
import { STAGE_AGE_THRESHOLD_HOURS, type OrderStage } from "@/types/admin";

export default function OrdersAgePage() {
  const router = useRouter();
  const { visibleOrders, sites, currentUser, permissions, bulkFlagDelayed, advanceStage, rollbackStage } =
    useAdminData();

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Oldest-in-current-stage first, per spec.
  const sorted = useMemo(
    () => [...visibleOrders].sort((a, b) => hoursSince(b.stageEnteredAt) - hoursSince(a.stageEnteredAt)),
    [visibleOrders]
  );

  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? id;

  const isOverThreshold = (stage: OrderStage, stageHours: number) =>
    stageHours > STAGE_AGE_THRESHOLD_HOURS[stage];

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const canActOnRow = (siteId: string) =>
    permissions.canMutateOrderStage && (!permissions.ordersScopedToOwnSite || siteId === currentUser.siteId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-indigo-900">Order age</h1>
          <p className="mt-1 text-sm text-indigo-500">
            Oldest time-in-stage first — spot a stuck order before the customer does.
          </p>
        </div>

        {permissions.canBulkFlag && (
          <button
            onClick={() => {
              bulkFlagDelayed(Array.from(selected));
              setSelected(new Set());
            }}
            disabled={selected.size === 0}
            className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            Flag {selected.size || ""} for review
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-indigo-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-indigo-100 text-xs uppercase tracking-wide text-indigo-400">
              {permissions.canBulkFlag && <th className="px-4 py-3"></th>}
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Total order age</th>
              <th className="px-4 py-3">Current-stage age</th>
              {permissions.canMutateOrderStage && <th className="px-4 py-3">Act</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => {
              const stageHours = hoursSince(o.stageEnteredAt);
              const totalHours = hoursSince(o.placedAt);
              const breach = isOverThreshold(o.stage, stageHours);

              return (
                <tr
                  key={o.id}
                  className={`cursor-pointer border-b border-indigo-50 last:border-0 hover:bg-teal/5 ${breach ? "bg-red-50/50" : ""}`}
                  onClick={() => router.push(`/admin/orders/${o.id}`)}
                >
                  {permissions.canBulkFlag && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggleSelect(o.id)}
                        className="h-4 w-4 rounded border-indigo-300 text-teal focus:ring-teal"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium text-indigo-900">{o.id}</td>
                  <td className="px-4 py-3 text-indigo-700">{o.customerName}</td>
                  <td className="px-4 py-3 text-indigo-700">{siteName(o.siteId)}</td>
                  <td className="px-4 py-3 text-indigo-700">{o.stage}</td>
                  <td className="px-4 py-3 text-indigo-500">{formatAge(totalHours)}</td>
                  <td className="px-4 py-3">
                    <span className={breach ? "font-medium text-red-600" : "text-indigo-500"}>
                      {formatAge(stageHours)}
                      {breach && " · over threshold"}
                    </span>
                  </td>
                  {permissions.canMutateOrderStage && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {canActOnRow(o.siteId) ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => rollbackStage(o.id)}
                            className="rounded-md border border-indigo-200 px-2 py-1 text-xs text-indigo-600"
                          >
                            ←
                          </button>
                          <button
                            onClick={() => advanceStage(o.id)}
                            className="rounded-md bg-teal px-2 py-1 text-xs text-white"
                          >
                            →
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-indigo-300">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-indigo-400">
                  No orders to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}