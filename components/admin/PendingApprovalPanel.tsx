// components/admin/PendingApprovalPanel.tsx
//
// Shown instead of the normal edit-mode view whenever a staff detail
// page's account has status='pending' — a self-registered applicant
// awaiting approval (see /admin/register and
// data/Wishdrop-staff-self-registration.sql). Reused by both the
// Manager staff detail page (allowedRoles: sales/warehouse only) and
// the Super Admin one (all four roles) rather than duplicating this
// panel in both places, since the only real difference between them is
// which roles the approver is allowed to grant — enforced again
// server-side in app/api/admin/staff/[staffId]/route.ts's PATCH/DELETE
// regardless of what this component renders.

import { useState } from "react"
import { ArrowLeft, Check, Crown, MapPin, ShieldCheck, ShoppingBag, UserCog, Warehouse, X } from "lucide-react"
import type { Role, Site, StaffMember } from "@/types/admin"
import { panelClass } from "@/components/admin/seller/shared"

const ROLE_LABEL: Record<Role, string> = {
  manager: "Manager",
  sales: "Sales & Purchase",
  warehouse: "Warehouse",
  super_admin: "Super Admin",
}

const ROLE_ICON: Record<Role, React.ReactNode> = {
  manager: <UserCog size={13} />,
  sales: <ShoppingBag size={13} />,
  warehouse: <Warehouse size={13} />,
  super_admin: <Crown size={13} />,
}

export function PendingApprovalPanel({
  staff,
  sites,
  allowedRoles,
  onDone,
  updateStaffAccount,
  deleteStaffAccount,
}: {
  staff: StaffMember
  sites: Site[]
  allowedRoles: readonly Role[]
  onDone: () => void
  updateStaffAccount: (
    staffId: string,
    patch: { name?: string; email?: string; role?: Role; siteId?: string; status?: "active" | "deactivated" },
  ) => Promise<{ ok: boolean; error?: string }>
  deleteStaffAccount: (staffId: string) => Promise<{ ok: boolean; error?: string }>
}) {
  // Default to what they requested if it's actually grantable here,
  // otherwise the first role this approver can grant at all.
  const initialRole = staff.requestedRole && allowedRoles.includes(staff.requestedRole) ? staff.requestedRole : allowedRoles[0]
  const [chosenRole, setChosenRole] = useState<Role>(initialRole)
  const [siteId, setSiteId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingReject, setConfirmingReject] = useState(false)

  const canApprove = chosenRole !== "warehouse" || siteId

  const handleApprove = async () => {
    if (!canApprove) return
    setBusy(true)
    setError(null)
    const result = await updateStaffAccount(staff.id, {
      role: chosenRole,
      siteId: chosenRole === "warehouse" ? siteId : undefined,
      status: "active",
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? "Failed to approve this account.")
      return
    }
    onDone()
  }

  const handleReject = async () => {
    setBusy(true)
    setError(null)
    const result = await deleteStaffAccount(staff.id)
    setBusy(false)
    if (!result.ok) {
      setConfirmingReject(false)
      setError(result.error ?? "Failed to reject this request.")
      return
    }
    onDone()
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pb-20 pt-8 lg:px-10">
      <button
        type="button"
        onClick={onDone}
        className="flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="mt-4 flex items-center gap-3.5">
        <div className="grid h-14 w-14 flex-none place-items-center rounded-full bg-teal-deep/10 font-display text-xl font-semibold text-teal-deep">
          {staff.name.charAt(0)}
        </div>
        <div>
          <h1 className="font-display text-2xl text-ink">{staff.name}</h1>
          <p className="mt-0.5 text-sm text-ink/50">{staff.email}</p>
        </div>
      </div>

      <div className={`mt-6 overflow-hidden ${panelClass}`}>
        <div className="border-b border-ink/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink/70">Access request</h2>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-xs text-ink/55">
            {staff.requestedRole ? (
              <>
                Requested <span className="font-semibold text-ink/70">{ROLE_LABEL[staff.requestedRole]}</span>{" "}
                access. Choose the role to actually grant below — it doesn't have to match what they asked for.
              </>
            ) : (
              "No specific role was requested. Choose one below."
            )}
          </p>

          <div>
            <label className="text-xs font-semibold text-ink/50">Grant role</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {allowedRoles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setChosenRole(r)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                    chosenRole === r
                      ? "border-teal-deep bg-teal-deep/10 text-teal-deep"
                      : "border-ink/15 bg-white text-ink/60 hover:border-ink/25"
                  }`}
                >
                  {ROLE_ICON[r]} {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          {chosenRole === "warehouse" && (
            <div>
              <label className="text-xs font-semibold text-ink/50">Site assignment</label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
              >
                <option value="">Select a site…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.location}
                  </option>
                ))}
              </select>
              {siteId && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-ink/40">
                  <MapPin size={11} /> {sites.find((s) => s.id === siteId)?.location}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleApprove}
              disabled={!canApprove || busy}
              className="flex items-center gap-1.5 rounded-lg bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
            >
              <Check size={14} /> {busy ? "Approving…" : `Approve as ${ROLE_LABEL[chosenRole]}`}
            </button>

            {confirmingReject ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmingReject(false)}
                  disabled={busy}
                  className="rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink/60 hover:bg-parchment/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X size={14} /> {busy ? "Rejecting…" : "Confirm reject"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingReject(true)}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-red-600/25 bg-red-600/5 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-600/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={14} /> Reject request
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-ink/35">
        <ShieldCheck size={12} /> Rejecting permanently removes this account and its request — this can't be undone.
      </p>
    </div>
  )
}
