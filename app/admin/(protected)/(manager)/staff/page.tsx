// app/admin/(manager)/staff/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Plus, Search, SearchX, ShieldCheck, ShoppingBag, Users, Warehouse } from "lucide-react"

import { useAdminData, formatAge } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"
import { STAFF_STATUS_LABEL, STAFF_STATUS_TONE, type StaffAccountStatus } from "@/lib/admin/mock"

// Roster of all Sales & Purchase and Warehouse accounts, across every
// site. Manager can add, edit, and delete accounts here — but only
// Sales & Purchase/Warehouse ones. Manager and Super Admin accounts
// are Super Admin's domain exclusively (create, edit, and delete —
// see app/admin/(protected)/super-admin/staff/**), enforced server-side
// in app/api/admin/staff/**, not just by Manager rows being filtered
// out of this list.
//
// status/last-active now come straight from StaffMember (real
// staff_accounts.status/last_login) — this used to layer mock data from
// lib/admin/mock's getStaffMeta on top since StaffMember had no such
// fields; it does now, so that layer is gone.

type RoleFilter = "all" | Extract<Role, "sales" | "warehouse">

const ROLE_LABEL: Record<Extract<Role, "sales" | "warehouse">, string> = {
  sales: "Sales & Purchase",
  warehouse: "Warehouse",
}

const ROLE_ICON: Record<Extract<Role, "sales" | "warehouse">, React.ReactNode> = {
  sales: <ShoppingBag size={11} />,
  warehouse: <Warehouse size={11} />,
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-card p-5">
      <p className="text-xs font-medium text-ink/45">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value}</p>
    </div>
  )
}

export default function StaffListPage() {
  const router = useRouter()
  const { role, currentUser, staffDirectory, sites } = useAdminData()
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
  const [siteFilter, setSiteFilter] = useState<string>("all")

  useEffect(() => {
    // Effective `role`, super_admin let through unconditionally — same
    // fix as manager-dashboard/page.tsx and reports/page.tsx.
    if (role !== "manager" && role !== "super_admin") router.replace("/admin/dashboard")
  }, [role, router])

  // Manager AND Super Admin accounts are managed via Super Admin, not
  // this roster — same reasoning applies to both now that super_admin
  // is a real role (see the resolved routing question in
  // whatsapp-integration-discussion-summary.md §6.6).
  const roster = useMemo(() => staffDirectory.filter((s) => s.role !== "manager" && s.role !== "super_admin"), [staffDirectory])

  const rows = useMemo(
    () =>
      roster.map((s) => ({
        ...s,
        // "Invited" is a display-only derived state, not a real DB
        // status — the schema only has active/deactivated (see
        // staff_status in wishdrop-supabase-schema.sql). An account
        // that's active but has never actually signed in (no real
        // invite-email flow exists yet — see /api/admin/staff's own
        // header comment) reads as "invite pending" here rather than
        // claiming it's already in use.
        displayStatus: (s.status === "active" && !s.lastLogin ? "invited" : s.status) as StaffAccountStatus,
        siteName: s.siteId ? sites.find((site) => site.id === s.siteId)?.name : undefined,
      })),
    [roster, sites]
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

  const salesCount = roster.filter((s) => s.role === "sales").length
  const warehouseCount = roster.filter((s) => s.role === "warehouse").length
  const invitedCount = rows.filter((r) => r.displayStatus === "invited").length
  const hasActiveFilters = search.trim() !== "" || roleFilter !== "all" || siteFilter !== "all"

  if (role !== "manager" && role !== "super_admin") return null

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
              <h1 className="font-display text-3xl text-ink">Staff</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Every Sales & Purchase and Warehouse account, across every site.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/admin/staff/new")}
            className="flex items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep/90"
          >
            <Plus size={15} /> Add staff
          </button>
        </div>

        {/* ── Stat strip ── */}
        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total staff" value={roster.length} />
          <StatCard label="Sales & Purchase" value={salesCount} />
          <StatCard label="Warehouse" value={warehouseCount} />
          <StatCard label="Pending invites" value={invitedCount} />
        </div>

        {/* ── Filters ── */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
            {(["all", "sales", "warehouse"] as RoleFilter[]).map((f) => (
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

        <p className="mt-4 text-xs font-medium text-ink/40">{filtered.length} of {roster.length} staff</p>

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
                onClick={() => router.push(`/admin/staff/${s.id}`)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/admin/staff/${s.id}`) }}
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
                    {ROLE_ICON[s.role as "sales" | "warehouse"]} {ROLE_LABEL[s.role as "sales" | "warehouse"]}
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
                  <ChevronRight size={16} className="hidden text-ink/25 sm:block" />
                </div>
              </div>
            ))
          )}
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-xs text-ink/35">
          <ShieldCheck size={12} /> Manager and Super Admin accounts aren't managed here — see{" "}
          <a href="/admin/super-admin/staff" className="underline decoration-dotted underline-offset-4 hover:text-ink/60">
            All staff
          </a>
          .
        </p>
      </div>
    </div>
  )
}