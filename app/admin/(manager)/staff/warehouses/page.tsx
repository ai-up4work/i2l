// app/admin/(manager)/staff/warehouses/page.tsx
"use client"

import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ChevronRight,
  MapPin,
  Package,
  Plus,
  Search,
  Users,
  Warehouse as WarehouseIcon,
  X,
} from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { Site } from "@/types/admin"

// Reference list of registered warehouse sites — the source list used
// when assigning a Warehouse account to a site (see the site-select on
// /admin/staff/[staffId]).
//
// KNOWN LIMITATION: AdminDataContext's `sites` array is a static const
// (SITES in that file), not usePersistentState-backed — there's no
// addSite/updateSite/deactivateSite mutation yet. Add/Edit/Deactivate
// here operate on LOCAL component state only, seeded from context on
// mount, so a real site's headcount/active-order numbers (both read
// live from context) stay accurate, but a newly "added" site won't
// survive a refresh and won't be selectable elsewhere in the app until
// AdminDataContext grows real site CRUD. Flagging rather than faking a
// deeper persistence story.

type EditableSite = Site & { deactivated: boolean }

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-card p-5">
      <div className="flex items-center gap-1.5 text-ink/40">{icon}<p className="text-xs font-medium">{label}</p></div>
      <p className="mt-1 font-display text-2xl text-ink">{value}</p>
    </div>
  )
}

export default function WarehouseSitesPage() {
  const router = useRouter()
  const { currentUser, sites, staffDirectory, orders } = useAdminData()

  useEffect(() => {
    if (currentUser.role !== "manager") router.replace("/admin/dashboard")
  }, [currentUser.role, router])

  const [localSites, setLocalSites] = useState<EditableSite[]>(() => sites.map((s) => ({ ...s, deactivated: false })))
  const [search, setSearch] = useState("")
  const [modal, setModal] = useState<{ mode: "add" | "edit"; site?: EditableSite } | null>(null)
  const [form, setForm] = useState({ name: "", location: "" })
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null)

  const headcountOf = (siteId: string) =>
    staffDirectory.filter((s) => s.role === "warehouse" && s.siteId === siteId).length
  const activeOrdersOf = (siteId: string) =>
    orders.filter((o) => o.siteId === siteId && o.stage !== "Delivered").length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return localSites
    return localSites.filter((s) => s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q))
  }, [localSites, search])

  const totalHeadcount = staffDirectory.filter((s) => s.role === "warehouse").length
  const totalActiveOrders = orders.filter((o) => o.stage !== "Delivered").length

  if (currentUser.role !== "manager") return null

  const openAdd = () => {
    setForm({ name: "", location: "" })
    setModal({ mode: "add" })
  }
  const openEdit = (site: EditableSite) => {
    setForm({ name: site.name, location: site.location })
    setModal({ mode: "edit", site })
  }
  const closeModal = () => setModal(null)

  const submitModal = () => {
    if (!form.name.trim() || !form.location.trim()) return
    if (modal?.mode === "add") {
      setLocalSites((prev) => [
        ...prev,
        { id: `site_${Date.now()}`, name: form.name.trim(), location: form.location.trim(), deactivated: false },
      ])
    } else if (modal?.mode === "edit" && modal.site) {
      setLocalSites((prev) =>
        prev.map((s) => (s.id === modal.site!.id ? { ...s, name: form.name.trim(), location: form.location.trim() } : s))
      )
    }
    closeModal()
  }

  const toggleDeactivate = (site: EditableSite) => {
    if (!site.deactivated && activeOrdersOf(site.id) > 0) {
      // Blocked outright, per spec: don't let an order silently lose its site.
      setConfirmDeactivateId(null)
      return
    }
    setLocalSites((prev) => prev.map((s) => (s.id === site.id ? { ...s, deactivated: !s.deactivated } : s)))
    setConfirmDeactivateId(null)
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <WarehouseIcon size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Warehouse sites</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Registered hubs — the source list used whenever a Warehouse account is assigned to a site.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep/90"
          >
            <Plus size={15} /> Add site
          </button>
        </div>

        {/* ── Stat strip ── */}
        <div className="mt-9 grid grid-cols-3 gap-3">
          <StatCard icon={<MapPin size={14} />} label="Sites" value={localSites.filter((s) => !s.deactivated).length} />
          <StatCard icon={<Users size={14} />} label="Warehouse headcount" value={totalHeadcount} />
          <StatCard icon={<Package size={14} />} label="Active orders" value={totalActiveOrders} />
        </div>

        {/* ── Search ── */}
        <div className="relative mt-6 w-full sm:w-72">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search site or location"
            className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
          />
        </div>

        {/* ── Site cards ── */}
        <div className="mt-4 space-y-3">
          {filtered.map((site) => {
            const headcount = headcountOf(site.id)
            const activeOrders = activeOrdersOf(site.id)
            const blockedDeactivate = activeOrders > 0

            return (
              <div
                key={site.id}
                className={`overflow-hidden rounded-2xl border border-ink/10 border-l-4 bg-card p-4 ${
                  site.deactivated ? "border-l-ink/10 opacity-60" : "border-l-teal-deep"
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep">
                      <MapPin size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-display text-sm font-semibold text-ink">{site.name}</p>
                        {site.deactivated && (
                          <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11px] font-semibold text-ink/40">
                            Deactivated
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink/50">{site.location}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.04] px-2.5 py-1 text-xs font-semibold text-ink/60 ring-1 ring-inset ring-ink/10">
                      <Users size={11} /> {headcount} staff
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                        activeOrders > 0
                          ? "bg-teal/10 text-teal-deep ring-teal/25"
                          : "bg-ink/[0.04] text-ink/40 ring-ink/10"
                      }`}
                    >
                      <Package size={11} /> {activeOrders} active orders
                    </span>
                    <button
                      type="button"
                      onClick={() => openEdit(site)}
                      className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-parchment/60"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeactivateId(confirmDeactivateId === site.id ? null : site.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        site.deactivated
                          ? "border-teal/30 bg-teal/5 text-teal-deep hover:bg-teal/10"
                          : "border-red-600/25 bg-red-600/5 text-red-700 hover:bg-red-600/10"
                      }`}
                    >
                      {site.deactivated ? "Reactivate" : "Deactivate"}
                    </button>
                  </div>
                </div>

                {confirmDeactivateId === site.id && !site.deactivated && (
                  <div className="mt-3 rounded-xl border border-ink/10 bg-parchment/60 px-4 py-3 text-xs">
                    {blockedDeactivate ? (
                      <p className="flex items-center gap-1.5 font-medium text-rose-700">
                        <AlertTriangle size={13} /> Can't deactivate — {activeOrders} active order
                        {activeOrders === 1 ? "" : "s"} still routed here. Reassign them to another site first.
                      </p>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-ink/60">
                          {headcount > 0
                            ? `${headcount} warehouse account${headcount === 1 ? "" : "s"} assigned here will need reassigning.`
                            : "No staff or orders are affected."}{" "}
                          Deactivate this site?
                        </p>
                        <div className="flex flex-none gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeactivateId(null)}
                            className="rounded-lg border border-ink/15 bg-white px-2.5 py-1 font-semibold text-ink/60"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleDeactivate(site)}
                            className="rounded-lg bg-red-600 px-2.5 py-1 font-semibold text-white hover:bg-red-700"
                          >
                            Deactivate
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-ink/15 bg-card px-4 py-12 text-center text-sm text-ink/45">
              No sites match "{search}".
            </div>
          )}
        </div>
      </div>

      {/* ── Add/Edit modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={closeModal}>
          <div
            className="w-full max-w-sm rounded-2xl border border-ink/10 bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-ink">{modal.mode === "add" ? "Add site" : "Edit site"}</h2>
              <button type="button" onClick={closeModal} className="text-ink/40 hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-ink/50">Site name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Jaffna Hub"
                  className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink/50">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Jaffna, LK"
                  className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-sm font-semibold text-ink/60 hover:bg-parchment/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitModal}
                disabled={!form.name.trim() || !form.location.trim()}
                className="rounded-lg bg-teal-deep px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
              >
                {modal.mode === "add" ? "Add site" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}