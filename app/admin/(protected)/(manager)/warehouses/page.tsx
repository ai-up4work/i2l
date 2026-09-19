// app/admin/(manager)/warehouses/page.tsx
"use client"

import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  MapPin,
  Package,
  Plus,
  Search,
  SearchX,
  Star,
  Users,
  Warehouse as WarehouseIcon,
  X,
} from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { Site } from "@/types/admin"

// Reference list of registered warehouse sites — the source list used
// when assigning a Warehouse account to a site (see the site-select on
// /admin/staff/[staffId]), and now also where the DEFAULT site (the one
// new orders land on when nothing else determines a site — see
// Site.isDefault's own doc comment) is set.
//
// FIX (was): AdminDataContext's `sites` used to be a hardcoded const,
// not read from the database at all, and this page's Add/Edit/
// Deactivate all operated on local component state that reset on every
// refresh — this page's own comment used to flag that directly. Both
// are now real: `sites` is fetched from and written back to the actual
// `sites` table (see lib/supabase/sites-admin.ts), so nothing here
// needs a local mirror of the list anymore — site.active IS the real
// deactivated/active state, not a locally-tracked overlay on top of it.
//
// RESTYLE (2026-09): brought in line with the header/toolbar/empty-state
// language used on /admin/orders, /admin/export-bin and /demo/quote —
// the icon+dl stat strip sitting in the header row (not a separate
// stat-card grid below it), the search toolbar with a "X of Y shown"
// counter, and the icon-led empty state — rather than the
// (manager)/reports page's bordered-icon + standalone summary-card
// layout, which turned out to be the outlier, not the standard, once
// compared against the other three pages.

const inputClass =
  "rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
const labelClass = "text-xs font-medium text-ink/50"
const LINK_BUTTON = "text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"

export default function WarehouseSitesPage() {
  const router = useRouter()
  const { role, sites, staffDirectory, orders, addSite, updateSiteInfo, toggleSiteActive, setDefaultSiteAction } =
    useAdminData()

  useEffect(() => {
    // Effective `role`, super_admin let through unconditionally — same
    // fix as manager-dashboard/page.tsx and reports/page.tsx.
    if (role !== "manager" && role !== "super_admin") router.replace("/admin/dashboard")
  }, [role, router])

  const [search, setSearch] = useState("")
  const [modal, setModal] = useState<{ mode: "add" | "edit"; site?: Site } | null>(null)
  const [form, setForm] = useState({ name: "", location: "" })
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const headcountOf = (siteId: string) =>
    staffDirectory.filter((s) => s.role === "warehouse" && s.siteId === siteId).length
  const activeOrdersOf = (siteId: string) =>
    orders.filter((o) => o.siteId === siteId && o.stage !== "Delivered").length

  const hasFilter = search.trim() !== ""
  const clearFilters = () => setSearch("")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sites
    return sites.filter((s) => s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q))
  }, [sites, search])

  const activeSiteCount = sites.filter((s) => s.active).length
  const totalHeadcount = staffDirectory.filter((s) => s.role === "warehouse").length
  const totalActiveOrders = orders.filter((o) => o.stage !== "Delivered").length

  if (role !== "manager" && role !== "super_admin") return null

  const openAdd = () => {
    setForm({ name: "", location: "" })
    setModal({ mode: "add" })
  }
  const openEdit = (site: Site) => {
    setForm({ name: site.name, location: site.location })
    setModal({ mode: "edit", site })
  }
  const closeModal = () => setModal(null)

  const submitModal = async () => {
    if (!form.name.trim() || !form.location.trim()) return
    setActionError(null)
    const res =
      modal?.mode === "add"
        ? await addSite(form.name.trim(), form.location.trim())
        : modal?.mode === "edit" && modal.site
          ? await updateSiteInfo(modal.site.id, { name: form.name.trim(), location: form.location.trim() })
          : { ok: true }
    if (!res.ok) {
      setActionError(res.error ?? "Could not save this site. Please try again.")
      return
    }
    closeModal()
  }

  const toggleDeactivate = async (site: Site) => {
    if (!site.active && activeOrdersOf(site.id) > 0) {
      // Blocked outright, per spec: don't let an order silently lose its site.
      setConfirmDeactivateId(null)
      return
    }
    // A default site being deactivated would leave every future order
    // with nowhere to land (defaultSiteId falls back to sites[0], but
    // that's a "don't crash" safety net, not a real substitute for an
    // admin's actual choice) — block it the same deliberate way an
    // active-orders block works, rather than silently picking a new
    // default on the admin's behalf.
    if (site.active && site.isDefault) {
      setActionError("This is the default site — set a different one as default before deactivating it.")
      setConfirmDeactivateId(null)
      return
    }
    setActionError(null)
    const res = await toggleSiteActive(site.id, !site.active)
    if (!res.ok) setActionError(res.error ?? "Could not update this site. Please try again.")
    setConfirmDeactivateId(null)
  }

  const makeDefault = async (site: Site) => {
    setActionError(null)
    const res = await setDefaultSiteAction(site.id)
    if (!res.ok) setActionError(res.error ?? "Could not set this as the default site. Please try again.")
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <WarehouseIcon size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Warehouse sites</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Registered hubs — the source list used whenever a Warehouse account is assigned to a site.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3">
              <dt className="text-xs font-medium text-ink/45">Sites</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{activeSiteCount}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Warehouse headcount</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{totalHeadcount}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Active orders</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{totalActiveOrders}</dd>
            </div>
          </dl>
        </div>

        {/* ── Toolbar ── */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative w-full sm:w-72">
              <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search site or location"
                aria-label="Search site or location"
                className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
              />
            </div>
            <p className="hidden whitespace-nowrap text-xs text-ink/45 sm:block">
              {filtered.length} of {sites.length} shown
              {hasFilter && (
                <button type="button" onClick={clearFilters} className={`ml-2 ${LINK_BUTTON}`}>
                  Clear
                </button>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment outline-none transition-colors hover:bg-teal-deep/90 focus-visible:ring-2 focus-visible:ring-teal/40"
          >
            <Plus size={15} /> Add site
          </button>
        </div>

        {actionError && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700">
            <AlertTriangle size={13} className="flex-none" />
            {actionError}
          </div>
        )}

        {/* ── Site cards ── */}
        <div className="mt-4 space-y-3">
          {filtered.length === 0 ? (
            <EmptyState hasAnyFilter={hasFilter} isEmptyOverall={sites.length === 0} onClearFilters={clearFilters} />
          ) : (
            filtered.map((site) => {
              const headcount = headcountOf(site.id)
              const activeOrders = activeOrdersOf(site.id)
              const blockedDeactivate = activeOrders > 0 || site.isDefault

              return (
                <div
                  key={site.id}
                  className={`overflow-hidden rounded-2xl border border-ink/10 border-l-4 bg-card p-4 transition-colors hover:border-ink/20 ${
                    !site.active ? "border-l-ink/10 opacity-60" : site.isDefault ? "border-l-gold" : "border-l-teal-deep"
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
                          {site.isDefault && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold-deep">
                              <Star size={10} className="fill-current" /> Default
                            </span>
                          )}
                          {!site.active && (
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
                      {/* Super Admin only — see this page's default-site
                          comment and the sidebar's own "only super_admin
                          sees this group" precedent for why this action
                          specifically is gated tighter than the rest of
                          this page (view/add/edit/deactivate stay open
                          to Manager too). */}
                      {role === "super_admin" && site.active && !site.isDefault && (
                        <button
                          type="button"
                          onClick={() => makeDefault(site)}
                          className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold-deep outline-none transition-colors hover:bg-gold/15 focus-visible:ring-2 focus-visible:ring-gold/40"
                        >
                          Set as default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(site)}
                        className="rounded-lg border border-ink/10 bg-card px-3 py-1.5 text-xs font-semibold text-ink/70 outline-none transition-colors hover:bg-parchment/60 focus-visible:ring-2 focus-visible:ring-teal/40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          site.active
                            ? setConfirmDeactivateId(confirmDeactivateId === site.id ? null : site.id)
                            : toggleDeactivate(site)
                        }
                        aria-expanded={site.active ? confirmDeactivateId === site.id : undefined}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 ${
                          !site.active
                            ? "border-teal/30 bg-teal/5 text-teal-deep hover:bg-teal/10 focus-visible:ring-teal/40"
                            : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose/40"
                        }`}
                      >
                        {site.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </div>

                  {confirmDeactivateId === site.id && site.active && (
                    <div className="mt-3 rounded-xl border border-ink/10 bg-parchment/60 px-4 py-3 text-xs">
                      {blockedDeactivate ? (
                        <p className="flex items-center gap-1.5 font-medium text-rose-700">
                          <AlertTriangle size={13} />
                          {site.isDefault
                            ? "Can\u2019t deactivate \u2014 this is the default site. Set a different one as default first."
                            : `Can\u2019t deactivate \u2014 ${activeOrders} active order${activeOrders === 1 ? "" : "s"} still routed here. Reassign them to another site first.`}
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
                              className="rounded-lg border border-ink/10 bg-card px-2.5 py-1 font-semibold text-ink/60 outline-none transition-colors hover:bg-parchment/60"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleDeactivate(site)}
                              className="rounded-lg bg-rose-600 px-2.5 py-1 font-semibold text-white outline-none transition-colors hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose/40"
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
            })
          )}
        </div>
      </div>

      {/* ── Add/Edit modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={closeModal}>
          <div
            className="w-full max-w-sm rounded-2xl border border-ink/10 bg-card p-5 shadow-[0_24px_48px_-20px_rgba(32,36,43,0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-ink">{modal.mode === "add" ? "Add site" : "Edit site"}</h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="rounded-full p-1 text-ink/40 outline-none transition-colors hover:bg-ink/[0.04] hover:text-ink focus-visible:ring-2 focus-visible:ring-teal/40"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="site-name" className={`mb-1.5 block ${labelClass}`}>Site name</label>
                <input
                  id="site-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Jaffna Hub"
                  className={`w-full ${inputClass}`}
                />
              </div>
              <div>
                <label htmlFor="site-location" className={`mb-1.5 block ${labelClass}`}>Location</label>
                <input
                  id="site-location"
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Jaffna, LK"
                  className={`w-full ${inputClass}`}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-ink/10 bg-card px-3.5 py-2 text-sm font-semibold text-ink/60 outline-none transition-colors hover:bg-parchment/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitModal}
                disabled={!form.name.trim() || !form.location.trim()}
                className="rounded-lg bg-teal-deep px-3.5 py-2 text-sm font-semibold text-parchment outline-none transition-colors hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
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

function EmptyState({
  hasAnyFilter,
  isEmptyOverall,
  onClearFilters,
}: {
  hasAnyFilter: boolean
  isEmptyOverall: boolean
  onClearFilters: () => void
}) {
  if (isEmptyOverall) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-card px-4 py-16 text-center">
        <WarehouseIcon size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No warehouse sites registered yet</p>
          <p className="mt-1 max-w-xs text-xs text-ink/50">Add a site to make it selectable when assigning Warehouse accounts.</p>
        </div>
      </div>
    )
  }

  if (hasAnyFilter) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-card px-4 py-16 text-center">
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No sites match this search</p>
          <p className="mt-1 text-xs text-ink/50">Check the site name or location.</p>
        </div>
        <button type="button" onClick={onClearFilters} className="text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal">
          Clear search
        </button>
      </div>
    )
  }

  return null
}