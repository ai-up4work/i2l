// app/admin/(manager)/staff/[staffId]/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  MapPin,
  ShoppingBag,
  Trash2,
  Warehouse,
} from "lucide-react"

import { useAdminData, formatAge } from "@/contexts/AdminDataContext"
import { panelClass } from "@/components/admin/seller/shared"
import { PendingApprovalPanel } from "@/components/admin/PendingApprovalPanel"
import type { Role } from "@/types/admin"
import { STAFF_STATUS_LABEL, STAFF_STATUS_TONE, type StaffAccountStatus } from "@/lib/admin/mock"

// Edit one Sales & Purchase or Warehouse account. Used to ALSO handle
// creating a new one (switching into a "create mode" whenever
// params.staffId === "new") — that branch is gone now: it was
// unreachable dead code anyway (a static app/admin/(manager)/staff/new/
// route always wins over this dynamic [staffId] one for the literal
// path /admin/staff/new, per Next.js route precedence), and even if it
// had been reachable, its own header comment admitted it only ever
// wrote to local component state, never actually persisting a new
// account.
//
// Manager accounts aren't editable here — per spec, that's Super
// Admin's domain — so a manager id is out of scope for this page
// entirely (see the `s.role !== "manager"` filter below). Manager CAN
// still edit, deactivate, and delete Sales & Purchase/Warehouse
// accounts here; Manager and Super Admin accounts are Super Admin-only
// for all of that (create, edit, delete — see
// app/admin/(protected)/super-admin/staff/**), enforced server-side in
// app/api/admin/staff/**, not just by this page's own role filter.
//
// Save/Deactivate/Reactivate below used to only ever write to local
// component state — the "Deactivate account" button, for instance,
// flipped a useState and nothing else, so refreshing the page (or the
// roster list re-fetching from /api/admin/staff) would show the
// account as if nothing had happened. All three now call the real
// mutators on AdminDataContext, which hit the real, now
// server-side-enforced /api/admin/staff/[staffId] endpoint. Email and
// last-active also used to come from getStaffMeta (lib/admin/mock) — a
// fully fabricated email address and randomly-hashed "last signed in"
// time, unrelated to the real account — now read straight off `staff`
// (the real staff_accounts row) instead. The old fake "Activity
// history" panel is gone entirely rather than fixed, since there's no
// real audit-log table behind it yet to source it from — see
// /admin/super-admin/audit-log for where that eventually belongs.

const ROLE_LABEL = { sales: "Sales & Purchase", warehouse: "Warehouse" } as const
type EditableRole = Extract<Role, "sales" | "warehouse">

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-ink/50">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink/40">{hint}</p>}
    </div>
  )
}

export default function StaffDetailPage() {
  const router = useRouter()
  const params = useParams<{ staffId: string }>()
  const { role, currentUser, staffDirectory, sites, orders, updateStaffAccount, deleteStaffAccount } = useAdminData()

  useEffect(() => {
    // Effective `role`, super_admin let through unconditionally — same
    // fix as manager-dashboard/page.tsx and reports/page.tsx.
    if (role !== "manager" && role !== "super_admin") router.replace("/admin/dashboard")
  }, [role, router])

  const staff = staffDirectory.find(
    (s) =>
      s.id === params.staffId &&
      s.role !== "manager" &&
      (s.status !== "pending" || (s.requestedRole !== "manager" && s.requestedRole !== "super_admin")),
  )

  // -- Edit-mode form state ------------------------------------------------
  const [name, setName] = useState(staff?.name ?? "")
  const [email, setEmail] = useState(staff?.email ?? "")
  const [siteId, setSiteId] = useState(staff?.siteId ?? "")
  const [status, setStatus] = useState<StaffAccountStatus>(staff?.status ?? "active")
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (role !== "manager" && role !== "super_admin") return null

  // ======================================================================
  // EDIT MODE
  // ======================================================================

  if (!staff) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-sm text-ink/50">Staff account not found.</p>
        <p className="mt-1 text-xs text-ink/35">Manager accounts aren't managed from this page.</p>
        <button
          type="button"
          onClick={() => router.push("/admin/staff")}
          className="mt-4 text-sm font-semibold text-teal-deep hover:underline"
        >
          Back to Staff
        </button>
      </div>
    )
  }

  if (staff.status === "pending") {
    return (
      <PendingApprovalPanel
        staff={staff}
        sites={sites}
        allowedRoles={["sales", "warehouse"]}
        onDone={() => router.push("/admin/staff")}
        updateStaffAccount={updateStaffAccount}
        deleteStaffAccount={deleteStaffAccount}
      />
    )
  }

  const isWarehouse = staff.role === "warehouse"
  const openOrdersAtSite = siteId ? orders.filter((o) => o.siteId === siteId && o.stage !== "Delivered").length : 0
  const otherWarehouseAtSite = isWarehouse && siteId
    ? staffDirectory.filter((s) => s.role === "warehouse" && s.siteId === siteId && s.id !== staff.id).length
    : 0

  const hasChanges = name !== staff.name || email !== staff.email || siteId !== (staff.siteId ?? "")

  const handleSave = async () => {
    setBusy(true)
    setActionError(null)
    const result = await updateStaffAccount(staff.id, {
      name,
      email,
      siteId: isWarehouse ? siteId : undefined,
    })
    setBusy(false)
    if (!result.ok) {
      setActionError(result.error ?? "Failed to save changes.")
      return
    }
    setSavedAt(Date.now())
  }
  const handleDeactivate = async () => {
    setBusy(true)
    setActionError(null)
    const result = await updateStaffAccount(staff.id, { status: "deactivated" })
    setBusy(false)
    setConfirmingDeactivate(false)
    if (!result.ok) {
      setActionError(result.error ?? "Failed to deactivate this account.")
      return
    }
    setStatus("deactivated")
    setSavedAt(Date.now())
  }
  const handleReactivate = async () => {
    setBusy(true)
    setActionError(null)
    const result = await updateStaffAccount(staff.id, { status: "active" })
    setBusy(false)
    if (!result.ok) {
      setActionError(result.error ?? "Failed to reactivate this account.")
      return
    }
    setStatus("active")
    setSavedAt(Date.now())
  }
  const handleDelete = async () => {
    setBusy(true)
    setActionError(null)
    const result = await deleteStaffAccount(staff.id)
    setBusy(false)
    if (!result.ok) {
      setConfirmingDelete(false)
      setActionError(result.error ?? "Failed to delete this account.")
      return
    }
    router.push("/admin/staff")
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pb-20 pt-8 lg:px-10">
      <button
        type="button"
        onClick={() => router.push("/admin/staff")}
        className="flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
      >
        <ArrowLeft size={14} /> Staff
      </button>

      {/* ── Header ── */}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="grid h-14 w-14 flex-none place-items-center rounded-full bg-teal-deep/10 font-display text-xl font-semibold text-teal-deep">
            {staff.name.charAt(0)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl text-ink">{staff.name}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STAFF_STATUS_TONE[status]}`}>
                {STAFF_STATUS_LABEL[status]}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink/45">
              {isWarehouse ? <Warehouse size={12} /> : <ShoppingBag size={12} />}
              {ROLE_LABEL[staff.role as EditableRole]}
              <span className="text-ink/25">·</span>
              <Clock size={12} />
              {!staff.lastLogin
                ? "Never signed in"
                : `Active ${formatAge((Date.now() - new Date(staff.lastLogin).getTime()) / 3_600_000)} ago`}
            </p>
          </div>
        </div>
        {savedAt && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <Check size={13} /> Saved
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: editable details */}
        <div className="space-y-5 lg:col-span-2">
          <div className={`overflow-hidden ${panelClass}`}>
            <div className="border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Account details</h2>
            </div>
            <div className="space-y-4 px-5 py-4">
              <Field label="Full name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
                />
              </Field>
              <Field label="Role">
                <div className="rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2 text-sm text-ink/50">
                  {ROLE_LABEL[staff.role as EditableRole]} — role can't be changed here
                </div>
              </Field>

              {/* Site assignment — shown only for Warehouse, hidden entirely otherwise, per spec */}
              {isWarehouse && (
                <Field label="Site assignment">
                  <select
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
                  >
                    <option value="" disabled>Choose a site</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {siteId && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-ink/40">
                      <MapPin size={11} /> {sites.find((s) => s.id === siteId)?.location}
                    </p>
                  )}
                </Field>
              )}

              {actionError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                  {actionError}
                </p>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || busy}
                className="rounded-lg bg-teal-deep px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>

        {/* Right: danger zone */}
        <div className="flex flex-col gap-6">
          <div className={`overflow-hidden ${panelClass}`}>
            <div className="border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Account status</h2>
            </div>
            <div className="px-5 py-4">
              {status === "deactivated" ? (
                <>
                  <p className="text-xs text-ink/50">This account is deactivated and can't sign in.</p>
                  <button
                    type="button"
                    onClick={handleReactivate}
                    disabled={busy}
                    className="mt-3 w-full rounded-lg border border-teal/30 bg-teal/5 px-3 py-2 text-sm font-semibold text-teal-deep hover:bg-teal/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "Reactivating…" : "Reactivate account"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-ink/50">
                    Deactivating revokes sign-in without removing the account — reversible any time from here.
                  </p>

                  {confirmingDeactivate ? (
                    <div className="mt-3 space-y-3 rounded-xl border border-ink/10 bg-parchment/60 px-3.5 py-3">
                      {isWarehouse && siteId && openOrdersAtSite > 0 && otherWarehouseAtSite === 0 && (
                        <p className="flex items-start gap-1.5 text-xs font-medium text-rose-700">
                          <AlertTriangle size={13} className="mt-0.5 flex-none" />
                          This is the only warehouse account at {sites.find((s) => s.id === siteId)?.name} — {openOrdersAtSite}{" "}
                          open order{openOrdersAtSite === 1 ? "" : "s"} there will have no one assigned. Reassign the site
                          first if possible.
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingDeactivate(false)}
                          className="rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink/60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleDeactivate}
                          disabled={busy}
                          className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busy ? "Deactivating…" : "Confirm deactivate"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDeactivate(true)}
                      className="mt-3 w-full rounded-lg border border-red-600/25 bg-red-600/5 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-600/10"
                    >
                      Deactivate account
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Real hard delete — was deliberately absent before ("No
              hard delete" was the actual copy here), with deactivate as
              the only destructive action. Kept as a genuinely separate,
              more severe action from deactivate rather than replacing
              it: deactivate is reversible and keeps the row around,
              this permanently removes it. Server-side enforcement (see
              app/api/admin/staff/[staffId]/route.ts's DELETE handler)
              is what actually matters here — this page only ever shows
              Sales & Purchase/Warehouse accounts anyway (the
              `s.role !== "manager"` filter above), but the API checks
              the target's real role independently regardless of what
              this page filters to. */}
          <div className={`overflow-hidden border-red-600/20 ${panelClass}`}>
            <div className="border-b border-red-600/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-red-700">Delete account</h2>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-ink/50">
                Permanently removes this account. This can't be undone — consider deactivating instead if you
                might need this account again.
              </p>

              {confirmingDelete ? (
                <div className="mt-3 space-y-3 rounded-xl border border-red-600/20 bg-red-50/60 px-3.5 py-3">
                  <p className="flex items-start gap-1.5 text-xs font-medium text-rose-700">
                    <Trash2 size={13} className="mt-0.5 flex-none" />
                    Delete {staff.name}'s account permanently? This can't be undone.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink/60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={busy}
                      className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? "Deleting…" : "Confirm delete"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-600/25 bg-red-600/5 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-600/10"
                >
                  <Trash2 size={14} /> Delete account
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}