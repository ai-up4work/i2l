// app/admin/orders/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAdminData,
  hoursSince,
  formatAge,
} from "@/contexts/AdminDataContext";
import type { Channel, OrderStage } from "@/types/admin";
import { STAGE_ORDER } from "@/types/admin";

const CHANNEL_LABEL: Record<Channel, string> = {
  1: "Affiliated store",
  2: "Scraped link",
  3: "Manual request",
};

function ChannelBadge({ channel }: { channel: Channel }) {
  if (channel === 3) {
    // Distinct tag so anyone scanning the list can tell this price
    // wasn't system-generated — see route spec note on /admin/orders.
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-gold bg-gold/15 px-2 py-0.5 text-xs font-medium text-amber-800">
        Ch. 3 · Manual quote
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
      Ch. {channel} · {CHANNEL_LABEL[channel]}
    </span>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const { visibleOrders, sites, role, currentUser, permissions, updateOrderStage, reassignSite, toggleDelayed } =
    useAdminData();

  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | Channel>("all");
  const [stageFilter, setStageFilter] = useState<"all" | OrderStage>("all");
  const [siteFilter, setSiteFilter] = useState<"all" | string>("all");
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    return visibleOrders.filter((o) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!o.id.toLowerCase().includes(q) && !o.customerName.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (channelFilter !== "all" && o.channel !== channelFilter) return false;
      if (stageFilter !== "all" && o.stage !== stageFilter) return false;
      if (siteFilter !== "all" && o.siteId !== siteFilter) return false;
      if (delayedOnly && !o.delayed) return false;
      if (dateFrom && new Date(o.placedAt) < new Date(dateFrom)) return false;
      if (dateTo && new Date(o.placedAt) > new Date(dateTo)) return false;
      return true;
    });
  }, [visibleOrders, search, channelFilter, stageFilter, siteFilter, delayedOnly, dateFrom, dateTo]);

  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-indigo-900">Orders</h1>
        <p className="mt-1 text-sm text-indigo-500">
          Every order across all three channels, independent of the warehouse queue.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-indigo-100 bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-indigo-500">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order ID or customer"
            className="w-48 rounded-md border border-indigo-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-indigo-500">Channel</label>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value === "all" ? "all" : (Number(e.target.value) as Channel))}
            className="rounded-md border border-indigo-200 px-2 py-1.5 text-sm"
          >
            <option value="all">All channels</option>
            <option value={1}>1 · Affiliated store</option>
            <option value={2}>2 · Scraped link</option>
            <option value={3}>3 · Manual request</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-indigo-500">Stage</label>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as "all" | OrderStage)}
            className="rounded-md border border-indigo-200 px-2 py-1.5 text-sm"
          >
            <option value="all">All stages</option>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Site filter hidden for Warehouse — their list is already scoped to one site */}
        {!permissions.ordersScopedToOwnSite && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-indigo-500">Site</label>
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="rounded-md border border-indigo-200 px-2 py-1.5 text-sm"
            >
              <option value="all">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-indigo-500">Placed from</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-indigo-200 px-2 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-indigo-500">Placed to</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-indigo-200 px-2 py-1.5 text-sm" />
        </div>

        <label className="flex items-center gap-2 pb-1.5 text-sm text-indigo-700">
          <input
            type="checkbox"
            checked={delayedOnly}
            onChange={(e) => setDelayedOnly(e.target.checked)}
            className="h-4 w-4 rounded border-indigo-300 text-teal focus:ring-teal"
          />
          Delayed only
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-indigo-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-indigo-100 text-xs uppercase tracking-wide text-indigo-400">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Delayed</th>
              {permissions.canMutateOrderStage && <th className="px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const canEditThisRow =
                permissions.canMutateOrderStage &&
                (!permissions.ordersScopedToOwnSite || o.siteId === currentUser.siteId);

              return (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/admin/orders/${o.id}`)}
                  className="cursor-pointer border-b border-indigo-50 last:border-0 hover:bg-teal/5"
                >
                  <td className="px-4 py-3 font-medium text-indigo-900">{o.id}</td>
                  <td className="px-4 py-3 text-indigo-700">{o.customerName}</td>
                  <td className="px-4 py-3"><ChannelBadge channel={o.channel} /></td>
                  <td className="px-4 py-3 text-indigo-700">{o.stage}</td>
                  <td className="px-4 py-3 text-indigo-700">{siteName(o.siteId)}</td>
                  <td className="px-4 py-3 text-indigo-500">{formatAge(hoursSince(o.placedAt))}</td>
                  <td className="px-4 py-3 text-indigo-900">₹{o.totalValue.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {o.delayed && (
                      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" title="Delayed" />
                    )}
                  </td>
                  {permissions.canMutateOrderStage && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {canEditThisRow ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={o.stage}
                            onChange={(e) => updateOrderStage(o.id, e.target.value as OrderStage)}
                            className="rounded-md border border-indigo-200 px-1.5 py-1 text-xs"
                          >
                            {STAGE_ORDER.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>

                          {permissions.canReassignSite && (
                            <select
                              value={o.siteId}
                              onChange={(e) => reassignSite(o.id, e.target.value)}
                              className="rounded-md border border-indigo-200 px-1.5 py-1 text-xs"
                              title="Reassign site"
                            >
                              {sites.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          )}

                          {permissions.canReassignSite && (
                            <button
                              onClick={() => toggleDelayed(o.id)}
                              className="rounded-md border border-indigo-200 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
                            >
                              {o.delayed ? "Clear delay" : "Flag delayed"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-indigo-300">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-indigo-400">
                  No orders match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}