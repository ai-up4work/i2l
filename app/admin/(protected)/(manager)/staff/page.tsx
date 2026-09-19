// app/admin/(manager)/staff/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Inbox, Search, SearchX, ShieldCheck, ShoppingBag, Users, Warehouse } from "lucide-react"

import { useAdminData, formatAge } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"
import { STAFF_STATUS_LABEL, STAFF_STATUS_TONE, type StaffAccountStatus } from "@/lib/admin/mock"

// Staff: the roster of every Sales & Purchase and Warehouse account, across
// every site. A manager can approve or reject a pending request, edit, and
// delete accounts here, but only Sales & Purchase and Warehouse ones. Manager
// and Super Admin accounts are Super Admin's domain, enforced server-side in
// app/api/admin/staff/**, not just by filtering those rows out of this list.
// There is no "Add staff" action: onboarding is self-service (/admin/register)
// plus approval.
//
// Status and last-active come straight from StaffMember (staff_accounts.status
// and last_login). Accounts awaiting approval get a gold left edge, the one
// tone kept for "needs a second look".

type StaffRole = Extract<Role, "sales" | "warehouse">
type RoleFilter = "all" | StaffRole

const ROLE_LABEL: Record<StaffRole, string> = {
  sales: "Sales & Purchase",
  warehouse: "Warehouse",
}

const ROLE_ICON: Record<StaffRole, React.ReactNode> = {
  sales: <ShoppingBag size={11} aria-hidden />,
  warehouse: <Warehouse size={11} aria-hidden />,
}

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sales", label: ROLE_LABEL.sales },
  { key: "warehouse", label: ROLE_LABEL.warehouse },
]

const PILL = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold"
const INK_PILL = "bg-ink/[0.04] text-ink/60 ring-1 ring-inset ring-ink/10"
const GOLD_PILL = "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30"
const STATE_SHELL = "flex flex-col items-center gap-3 px-4 py-16 text-center"
const LINK_BUTTON = "text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"

// Shared by the header row and every row so the columns always line up.
const GRID =
  "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_1.5rem]"

function RoleCell({ role, requestedRole }: { role: Role | null | undefined; requestedRole: string | null | undefined }) {
  if (role) {
    return (
      <span className={`${PILL} ${INK_PILL}`}>
        {ROLE_ICON[role as StaffRole]}
        {ROLE_LABEL[role as StaffRole]}
      </span>
    )
  }
  return (
    <span className={`${PILL} ${GOLD_PILL}`}>
      Requested: {requestedRole ? ((ROLE_LABEL as Record<string, string>)[requestedRole] ?? requestedRole) : "not specified"}
    </span>
  )
}

export default function StaffListPage() {
  const router = useRouter()
  const { role, staffDirectory, sites } = useAdminData()
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
  const [siteFilter, setSiteFilter] = useState<string>("all")

  useEffect(() => {
    // Effective `role`, with super_admin let through unconditionally (same fix
    // as manager-dashboard and reports).
    if (role !== "manager" && role !== "super_admin") router.replace("/admin/dashboard")
  }, [role, router])

  // Manager AND Super Admin accounts are managed via Super Admin, not this
  // roster. A pending (self-registered, role IS NULL) applicant is included
  // UNLESS they requested manager or super_admin access; those go to Super
  // Admin's queue, the same boundary as an existing account of those roles.
  const roster = useMemo(
    () =>
      staffDirectory.filter((s) =>
        s.status === "pending"
          ? s.requestedRole !== "manager" && s.requestedRole !== "super_admin"
          : s.role !== "manager" && s.role !== "super_admin",
      ),
    [staffDirectory],
  )

  const rows = useMemo(
    () =>
      roster.map((s) => ({
        ...s,
        // "Invited" is display-only, not a real DB status (the schema only has
        // active/deactivated). An account that's active but has never signed in
        // reads as "invite pending" rather than claiming it's already in use.
        displayStatus: (s.status === "active" && !s.lastLogin ? "invited" : s.status) as StaffAccountStatus,
        siteName: s.siteId ? sites.find((site) => site.id === s.siteId)?.name : undefined,
      })),
    [roster, sites],
  )

  // Search and site scope everything, including the role-tab counts, so a
  // count always matches what the tab would show.
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (siteFilter === "all" || r.siteId === siteFilter) &&
        (!q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)),
    )
  }, [rows, siteFilter, search])

  const counts: Record<RoleFilter, number> = {
    all: scoped.length,
    sales: scoped.filter((r) => r.role === "sales").length,
    warehouse: scoped.filter((r) => r.role === "warehouse").length,
  }

  const filtered = useMemo(
    () =>
      scoped
        .filter((r) => roleFilter === "all" || r.role === roleFilter)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [scoped, roleFilter],
  )

  const salesCount = roster.filter((s) => s.role === "sales").length
  const warehouseCount = roster.filter((s) => s.role === "warehouse").length
  const invitedCount = rows.filter((r) => r.displayStatus === "invited").length
  const pendingApprovalCount = rows.filter((r) => r.status === "pending").length
  const hasSearch = search.trim() !== ""
  const hasAnyFilter = hasSearch || roleFilter !== "all" || siteFilter !== "all"

  const clearFilters = () => {
    setSearch("")
    setRoleFilter("all")
    setSiteFilter("all")
  }

  if (role !== "manager" && role !== "super_admin") return null

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <Users size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Staff</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Every Sales &amp; Purchase and Warehouse account, across every site. New accounts come in through{" "}
                <span className="font-semibold">/admin/register</span> and are approved from here, not created directly.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Total staff</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{roster.length}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Sales &amp; Purchase</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{salesCount}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Warehouse</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{warehouseCount}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Pending invites</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{invitedCount}</dd>
            </div>
            <div className="px-5 py-3" title="Self-registered accounts waiting for approval">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Requested access</dt>
              <dd className={`mt-0.5 font-display text-xl ${pendingApprovalCount > 0 ? "text-gold-deep" : "text-ink"}`}>
                {pendingApprovalCount}
              </dd>
            </div>
          </dl>
        </div>

        {/* ── Filters ── */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Filter by role" className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
            {ROLE_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={roleFilter === f.key}
                onClick={() => setRoleFilter(f.key)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
                  roleFilter === f.key ? "bg-teal-deep text-parchment" : "text-ink/55 hover:text-ink/80"
                }`}
              >
                {f.label}
                <span className={roleFilter === f.key ? "text-parchment/70" : "text-ink/35"}>{counts[f.key]}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              aria-label="Filter by site"
              className="rounded-lg border border-ink/10 bg-card px-2.5 py-2 text-sm text-ink outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            >
              <option value="all">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-72">
              <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email"
                aria-label="Search name or email"
                className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
              />
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-ink/45">
          {filtered.length} of {roster.length} staff shown
          {hasAnyFilter && (
            <button type="button" onClick={clearFilters} className={`ml-2 ${LINK_BUTTON}`}>
              Clear filters
            </button>
          )}
        </p>

        {/* ── List ── */}
        <div className="mt-3 overflow-clip rounded-2xl border border-ink/10 bg-card">
          <div
            className={`sticky top-0 z-10 hidden items-center gap-3 border-b border-ink/10 bg-parchment/80 px-5 py-3 text-xs font-medium text-ink/50 backdrop-blur sm:grid ${GRID}`}
          >
            <span>Staff</span>
            <span>Role</span>
            <span>Site</span>
            <span>Status</span>
            <span>Last active</span>
            <span />
          </div>

          {filtered.length === 0 ? (
            hasSearch ? (
              <div className={STATE_SHELL}>
                <SearchX size={22} className="text-ink/25" />
                <div>
                  <p className="text-sm font-semibold text-ink/70">No staff match this search</p>
                  <p className="mt-1 text-xs text-ink/50">Check the name or email.</p>
                </div>
                <button type="button" onClick={() => setSearch("")} className={LINK_BUTTON}>
                  Clear search
                </button>
              </div>
            ) : roster.length > 0 ? (
              <div className={STATE_SHELL}>
                <Inbox size={22} className="text-ink/25" />
                <div>
                  <p className="text-sm font-semibold text-ink/70">No staff in this view</p>
                  <p className="mt-1 text-xs text-ink/50">Other accounts are under a different role or site.</p>
                </div>
                <button type="button" onClick={clearFilters} className={LINK_BUTTON}>
                  Show all staff
                </button>
              </div>
            ) : (
              <div className={STATE_SHELL}>
                <Inbox size={22} className="text-ink/25" />
                <div>
                  <p className="text-sm font-semibold text-ink/70">No staff yet</p>
                  <p className="mt-1 max-w-xs text-xs text-ink/50">
                    Accounts appear here once someone registers at /admin/register.
                  </p>
                </div>
              </div>
            )
          ) : (
            filtered.map((s) => {
              const href = `/admin/staff/${s.id}`
              const lastActive = !s.lastLogin
                ? "Never signed in"
                : `${formatAge((Date.now() - new Date(s.lastLogin).getTime()) / 3_600_000)} ago`
              const statusPill = (
                <span className={`${PILL} ${STAFF_STATUS_TONE[s.displayStatus]}`}>{STAFF_STATUS_LABEL[s.displayStatus]}</span>
              )

              return (
                // The row is clickable, the name is a real <Link> so keyboard
                // and middle-click still work.
                <div
                  key={s.id}
                  onClick={() => router.push(href)}
                  className={`relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-ink/[0.06] px-5 py-4 transition-colors last:border-b-0 hover:bg-ink/[0.02] focus-within:bg-teal/[0.04] sm:gap-y-0 sm:py-3.5 ${GRID}`}
                >
                  {s.status === "pending" && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gold-deep" />}

                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-teal-deep/10 font-display text-sm font-semibold text-teal-deep">
                      {s.name.charAt(0)}
                    </span>
                    <span className="min-w-0">
                      <Link
                        href={href}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate rounded text-sm font-semibold outline-none hover:text-teal-deep hover:underline focus-visible:ring-2 focus-visible:ring-teal/40"
                      >
                        {s.name}
                      </Link>
                      <span className="block truncate text-xs text-ink/50">{s.email}</span>
                    </span>
                  </span>

                  {/* mobile: status sits beside the name */}
                  <span className="sm:hidden">{statusPill}</span>

                  <span className="hidden sm:block">
                    <RoleCell role={s.role} requestedRole={s.requestedRole} />
                  </span>
                  <span className="hidden truncate text-sm text-ink/60 sm:block">{s.siteName ?? "\u2014"}</span>
                  <span className="hidden sm:block">{statusPill}</span>
                  <span className="hidden text-sm tabular-nums text-ink/50 sm:block">{lastActive}</span>
                  <ChevronRight size={16} className="hidden flex-none text-ink/25 sm:block" aria-hidden />

                  {/* mobile-only details */}
                  <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink/55 sm:hidden">
                    <RoleCell role={s.role} requestedRole={s.requestedRole} />
                    {s.siteName && <span>{s.siteName}</span>}
                    <span>{lastActive}</span>
                  </span>
                </div>
              )
            })
          )}
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-xs text-ink/45">
          <ShieldCheck size={12} aria-hidden />
          <span>
            Manager and Super Admin accounts aren&rsquo;t managed here. See{" "}
            <Link href="/admin/super-admin/staff" className="underline decoration-dotted underline-offset-4 hover:text-ink/70">
              All staff
            </Link>
            .
          </span>
        </p>
      </div>
    </div>
  )
}