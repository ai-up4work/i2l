// app/admin/(protected)/super-admin/staff/page.tsx
//
// The full roster — every role included, unlike /admin/staff (Manager's
// view, which deliberately excludes Manager and Super Admin rows). This
// is also the only place "Add staff" lives now: staff onboarding of any
// role is Super Admin-only, so this page (not Manager's) owns that
// entry point. See app/admin/(protected)/(manager)/staff/page.tsx's own
// comment for the other half of that change.
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Plus, Search, SearchX, Crown, ShieldCheck, ShoppingBag, Trash2, UserCog, Users, Warehouse } from "lucide-react"

import { useAdminData, formatAge } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"
import { STAFF_STATUS_LABEL, STAFF_STATUS_TONE, type StaffAccountStatus } from "@/lib/admin/mock"
import { ROLE_LABEL } from "@/components/admin/Rolepreviewmenu"

type RoleFilter = "all" | Role

const ROLE_ICON: Record<Role, React.ReactNode> = {
  manager: <UserCog size={11} />,
  sales: <ShoppingBag size={11} />,
  warehouse: <Warehouse size={11} />,
  super_admin: <Crown size={11} />,
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-card p-5">
      <p className="text-xs font-medium text-ink/45">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value}</p>
    </div>
  )
}

export default function AllStaffPage() {
  const router = useRouter()
  const { role: effectiveRole, currentUser, staffDirectory, sites, deleteStaffAccount } = useAdminData()
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
  const [siteFilter, setSiteFilter] = useState<string>("all")
  // Single shared "which row is armed to delete" slot — same
  // click-once-to-arm, click-again-to-confirm pattern used elsewhere in
  // the admin panel (e.g. the order detail page's delete button), just
  // scoped per-row here since this is a list. Only one row is ever
  // armed at a time; picking a different row's delete (or clicking
  // elsewhere) disarms the previous one rather than stacking confirms.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    // Effective `role` (previewRole-aware) — same pattern as every
    // other super-admin-only page, so a preview session sees the same
    // access boundary a real non-super-admin would.
    if (effectiveRole !== "super_admin") router.replace("/admin/dashboard")
  }, [effectiveRole, router])

  const rows = useMemo(
    () =>
      staffDirectory.map((s) => ({
        ...s,
        // "Invited" is a display-only derived state, not a real DB
        // status — the schema only has active/deactivated. An account
        // that's active but has never actually signed in reads as
        // "invite pending" here rather than claiming it's already in use.
        displayStatus: (s.status === "active" && !s.lastLogin ? "invited" : s.status) as StaffAccountStatus,
        siteName: s.siteId ? sites.find((site) => site.id === s.siteId)?.name : undefined,
      })),
    [staffDirectory, sites]
  )

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (roleFilter === "all" ? true : r.role === roleFilter))
      .filter((r) => (siteFilter === "all" ? true : r.siteId === siteFilter))
      .filter((r) => {
        const q = search.trim().toLowerCase()
        if (!q) return true
        return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, roleFilter, siteFilter, search])

  const countByRole = (r: Role) => staffDirectory.filter((s) => s.role === r).length
  const invitedCount = rows.filter((r) => r.displayStatus === "invited").length
  const hasActiveFilters = search.trim() !== "" || roleFilter !== "all" || siteFilter !== "all"

  // Also removes the underlying Supabase Auth user (see
  // app/api/admin/staff/[staffId]/route.ts's DELETE handler), not just
  // the roster row, so the same email can genuinely be re-invited
  // afterward.
  const handleDelete = async (staffId: string) => {
    setDeletingId(staffId)
    setDeleteError(null)
    const result = await deleteStaffAccount(staffId)
    setDeletingId(null)
    setConfirmingDeleteId(null)
    if (!result.ok) {
      setDeleteError(result.error ?? "Failed to delete this account.")
    }
  }

  if (effectiveRole !== "super_admin") return null

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <Users size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">All staff</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Every role, across every site — Manager and Super Admin included.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/admin/super-admin/staff/new")}
            className="flex items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep/90"
          >
            <Plus size={15} /> Add staff
          </button>
        </div>

        {/* ── Stat strip ── */}
        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Total staff" value={staffDirectory.length} />
          <StatCard label="Manager" value={countByRole("manager")} />
          <StatCard label="Sales & Purchase" value={countByRole("sales")} />
          <StatCard label="Warehouse" value={countByRole("warehouse")} />
          <StatCard label="Pending invites" value={invitedCount} />
        </div>

        {/* ── Filters ── */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
            {(["all", "manager", "sales", "warehouse", "super_admin"] as RoleFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setRoleFilter(f)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  roleFilter === f
                    ? "bg-teal-deep text-parchment shadow-[0_6px_18px_-8px_rgba(14,140,156,0.5)]"
                    : "text-ink/55 hover:text-ink/80"
                }`}
              >
                {f === "all" ? "All" : ROLE_LABEL[f]}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm text-ink outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            >
              <option value="all">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <div className="relative w-full sm:w-64">
              <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email"
                className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
              />
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs font-medium text-ink/40">{filtered.length} of {staffDirectory.length} staff</p>

        {deleteError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200">
            {deleteError}
          </p>
        )}

        {/* ── Roster list ── */}
        <div className="mt-3 space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-ink/15 bg-card px-4 py-16 text-center">
              <SearchX size={22} className="text-ink/25" />
              <div>
                <p className="text-sm font-semibold text-ink/70">Nothing matches this filter</p>
                <p className="mt-1 text-xs text-ink/45">Try a different search term, role, or site.</p>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setRoleFilter("all"); setSiteFilter("all") }}
                  className="mt-1 text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/admin/super-admin/staff/${s.id}`)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/admin/super-admin/staff/${s.id}`) }}
                className="flex cursor-pointer flex-col gap-4 rounded-2xl border border-ink/10 bg-card p-4 outline-none transition-colors hover:border-ink/20 focus-visible:bg-teal/[0.06] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 flex-none place-items-center rounded-full bg-teal-deep/10 font-display text-sm font-semibold text-teal-deep">
                    {s.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-display text-sm font-semibold text-ink">{s.name}</p>
                    <p className="mt-0.5 text-xs text-ink/50">{s.email}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.04] px-2.5 py-1 text-xs font-semibold text-ink/60 ring-1 ring-inset ring-ink/10">
                    {ROLE_ICON[s.role]} {ROLE_LABEL[s.role]}
                  </span>
                  {s.siteName && (
                    <span className="rounded-full bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal-deep">
                      {s.siteName}
                    </span>
                  )}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STAFF_STATUS_TONE[s.displayStatus]}`}>
                    {STAFF_STATUS_LABEL[s.displayStatus]}
                  </span>
                  <span className="text-xs text-ink/40">
                    {!s.lastLogin ? "Never signed in" : `Active ${formatAge((Date.now() - new Date(s.lastLogin).getTime()) / 3_600_000)} ago`}
                  </span>

                  {/* Self-protection — a Super Admin can't delete their
                      own account from anywhere, same guard as the
                      detail page (no one else could undo it). Stops
                      propagation so clicking it doesn't also trigger
                      the row's own onClick (navigating to the detail
                      page). */}
                  {s.id !== currentUser.id && (
                    <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
                      {confirmingDeleteId === s.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setConfirmingDeleteId(null)}
                            disabled={deletingId === s.id}
                            className="rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink/60 hover:bg-parchment/60 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(s.id)}
                            disabled={deletingId === s.id}
                            className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 size={12} />
                            {deletingId === s.id ? "Deleting…" : "Confirm"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null)
                            setConfirmingDeleteId(s.id)
                          }}
                          title="Delete account"
                          aria-label={`Delete ${s.name}'s account`}
                          className="grid h-7 w-7 flex-none place-items-center rounded-lg border border-ink/10 text-ink/40 transition-colors hover:border-red-600/25 hover:bg-red-600/5 hover:text-red-700"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </span>
                  )}

                  <ChevronRight size={16} className="hidden text-ink/25 sm:block" />
                </div>
              </div>
            ))
          )}
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-xs text-ink/35">
          <ShieldCheck size={12} /> Only Super Admin can add or view Manager and Super Admin accounts here.
        </p>
      </div>
    </div>
  )
}