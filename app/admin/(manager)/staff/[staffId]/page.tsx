// app/admin/(manager)/staff/[staffId]/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  MapPin,
  ShoppingBag,
  UserPlus,
  Warehouse,
} from "lucide-react"

import { useAdminData, formatAge } from "@/contexts/AdminDataContext"
import { panelClass } from "@/components/admin/seller/shared"
import type { Role } from "@/types/admin"
import {
  getStaffMeta,
  STAFF_STATUS_LABEL,
  STAFF_STATUS_TONE,
  type StaffAccountStatus,
} from "@/lib/admin/mock"

// Edit one Sales & Purchase or Warehouse account — AND create a new one.
// There's no separate /admin/staff/new route: the staff list's "Add
// staff" button links straight to /admin/staff/new, and this page
// switches into create mode whenever params.staffId === "new", per
// spec's role selector (Sales & Purchase / Warehouse only) and the
// site-assignment field that only appears once Warehouse is picked.
//
// Manager accounts aren't creatable or editable here — per spec, that's
// Super Admin's domain — so a manager id (or picking "manager" as a
// role, which isn't offered) is out of scope for this page entirely.
//
// KNOWN LIMITATION: AdminDataContext has no addStaff/updateStaff/
// deactivateStaff mutation yet (staffDirectory is a static const, not
// usePersistentState-backed). So both edit-save and create-submit below
// operate on local component state / a local redirect only — a newly
// "created" account won't actually appear in the Staff list or the
// reassign-request dropdown after navigating away. Flagging clearly
// rather than silently pretending it's wired up; this is the natural
// next step once real staff CRUD exists on the context.

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
  const { currentUser, staffDirectory, sites, orders } = useAdminData()

  const isNew = params.staffId === "new"

  useEffect(() => {
    if (currentUser.role !== "manager") router.replace("/admin/dashboard")
  }, [currentUser.role, router])

  const staff = isNew ? undefined : staffDirectory.find((s) => s.id === params.staffId && s.role !== "manager")
  const meta = useMemo(() => (staff ? getStaffMeta(staff.id, staff.name) : null), [staff])

  // -- Create-mode form state --------------------------------------------
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState<EditableRole>("sales")
  const [newSiteId, setNewSiteId] = useState("")
  const [created, setCreated] = useState<{ name: string; role: EditableRole } | null>(null)

  // -- Edit-mode form state ------------------------------------------------
  const [name, setName] = useState(staff?.name ?? "")
  const [email, setEmail] = useState(meta?.email ?? "")
  const [siteId, setSiteId] = useState(staff?.siteId ?? "")
  const [status, setStatus] = useState<StaffAccountStatus>(meta?.status ?? "active")
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  if (currentUser.role !== "manager") return null

  // ======================================================================
  // CREATE MODE
  // ======================================================================
  if (isNew) {
    const openOrdersAtSite = newSiteId ? orders.filter((o) => o.siteId === newSiteId && o.stage !== "Delivered").length : 0
    const canSubmit = newName.trim() !== "" && newEmail.trim() !== "" && (newRole !== "warehouse" || newSiteId !== "")

    const handleCreate = () => {
      if (!canSubmit) return
      // No addStaff mutation on the context yet — see file header. This
      // just confirms the submission was captured, rather than silently
      // acting like the account now exists elsewhere in the app.
      setCreated({ name: newName.trim(), role: newRole })
    }

    if (created) {
      return (
        <div className="mx-auto max-w-lg px-6 py-20 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Check size={24} />
          </div>
          <h1 className="mt-4 font-display text-xl text-ink">{created.name}'s account was created</h1>
          <p className="mt-1.5 text-sm text-ink/55">
            {ROLE_LABEL[created.role]} — an invite would normally be sent from here.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/admin/staff")}
              className="rounded-lg bg-teal-deep px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep/90"
            >
              Back to Staff
            </button>
            <button
              type="button"
              onClick={() => {
                setCreated(null)
                setNewName("")
                setNewEmail("")
                setNewRole("sales")
                setNewSiteId("")
              }}
              className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink/70 hover:bg-parchment/60"
            >
              Add another
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="mx-auto max-w-3xl px-6 pb-20 pt-8 lg:px-10">
        <button
          type="button"
          onClick={() => router.push("/admin/staff")}
          className="flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
        >
          <ArrowLeft size={14} /> Staff
        </button>

        <div className="mt-4 flex items-center gap-3.5">
          <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep">
            <UserPlus size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="font-display text-2xl text-ink">Add staff</h1>
            <p className="mt-1 text-sm text-ink/55">Sales & Purchase or Warehouse only — Manager accounts are created via Super Admin.</p>
          </div>
        </div>

        <div className={`mt-6 overflow-hidden ${panelClass}`}>
          <div className="space-y-4 px-5 py-5">
            <Field label="Full name">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Ishara Jayasuriya"
                className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="name@wishdrop.lk"
                className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
              />
            </Field>

            <Field label="Role">
              <div className="grid grid-cols-2 gap-2">
                {(["sales", "warehouse"] as EditableRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setNewRole(r)}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      newRole === r
                        ? "border-teal-deep bg-teal/10 text-teal-deep"
                        : "border-ink/15 bg-white text-ink/60 hover:bg-parchment/60"
                    }`}
                  >
                    {r === "sales" ? <ShoppingBag size={14} /> : <Warehouse size={14} />}
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </Field>

            {/* Site assignment — shown ONLY when Warehouse is selected, hidden entirely otherwise, per spec */}
            {newRole === "warehouse" && (
              <Field
                label="Site assignment"
                hint={
                  newSiteId && openOrdersAtSite > 0
                    ? `${sites.find((s) => s.id === newSiteId)?.name} currently has ${openOrdersAtSite} open order${openOrdersAtSite === 1 ? "" : "s"}.`
                    : undefined
                }
              >
                <select
                  value={newSiteId}
                  onChange={(e) => setNewSiteId(e.target.value)}
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
                >
                  <option value="" disabled>Choose a site</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — {s.location}</option>
                  ))}
                </select>
              </Field>
            )}

            <div className="flex justify-end gap-2 border-t border-ink/10 pt-4">
              <button
                type="button"
                onClick={() => router.push("/admin/staff")}
                className="rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-sm font-semibold text-ink/60 hover:bg-parchment/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canSubmit}
                className="rounded-lg bg-teal-deep px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
              >
                Create account
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ======================================================================
  // EDIT MODE
  // ======================================================================

  if (!staff || !meta) {
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

  const isWarehouse = staff.role === "warehouse"
  const openOrdersAtSite = siteId ? orders.filter((o) => o.siteId === siteId && o.stage !== "Delivered").length : 0
  const otherWarehouseAtSite = isWarehouse && siteId
    ? staffDirectory.filter((s) => s.role === "warehouse" && s.siteId === siteId && s.id !== staff.id).length
    : 0

  const hasChanges = name !== staff.name || email !== meta.email || siteId !== (staff.siteId ?? "")

  const handleSave = () => setSavedAt(Date.now())
  const handleDeactivate = () => {
    setStatus("deactivated")
    setConfirmingDeactivate(false)
    setSavedAt(Date.now())
  }
  const handleReactivate = () => {
    setStatus("active")
    setSavedAt(Date.now())
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
              {meta.lastLoginHoursAgo === null ? "Never signed in" : `Active ${formatAge(meta.lastLoginHoursAgo)} ago`}
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

              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges}
                className="rounded-lg bg-teal-deep px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
              >
                Save changes
              </button>
            </div>
          </div>

          {/* Activity history */}
          <div className={`overflow-hidden ${panelClass}`}>
            <div className="border-b border-ink/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink/70">Activity history</h2>
            </div>
            <div className="divide-y divide-ink/10">
              {meta.activity.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-ink/75">{a.label}</span>
                  <span className="text-xs text-ink/40">{formatAge(a.hoursAgo)} ago</span>
                </div>
              ))}
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
                    className="mt-3 w-full rounded-lg border border-teal/30 bg-teal/5 px-3 py-2 text-sm font-semibold text-teal-deep hover:bg-teal/10"
                  >
                    Reactivate account
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-ink/50">
                    No hard delete — deactivating revokes sign-in without removing the account's history.
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
                          className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          Confirm deactivate
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
        </div>
      </div>
    </div>
  )
}