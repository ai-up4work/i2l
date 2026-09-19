// app/admin/(protected)/super-admin/staff/[id]/page.tsx
//
// Detail view for a single staff account, reached from the roster at
// /admin/super-admin/staff. Super Admin-only, same access-boundary
// pattern as the roster page (effective/previewRole-aware redirect).
//
// Adds the "Resend invite" action for accounts that are active but have
// never signed in (displayStatus === "invited" — same derived-status
// logic as the roster page). Calls POST /api/admin/staff/[staffId]/resend-invite,
// which returns { link } — a fresh /admin/set-password link the caller
// can hand to the staff member directly (Slack, WhatsApp, etc.) without
// depending on Supabase's mailer actually delivering it.
"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Mail,
  ShieldCheck,
  ShoppingBag,
  UserCog,
  Warehouse,
} from "lucide-react"

import { useAdminData, formatAge } from "@/contexts/AdminDataContext"
import { PendingApprovalPanel } from "@/components/admin/PendingApprovalPanel"
import type { Role } from "@/types/admin"
import { STAFF_STATUS_LABEL, STAFF_STATUS_TONE, type StaffAccountStatus } from "@/lib/admin/mock"
import { ROLE_LABEL } from "@/components/admin/Rolepreviewmenu"

const ALL_ROLES: readonly Role[] = ["manager", "sales", "warehouse", "super_admin"]

const ROLE_ICON: Record<Role, React.ReactNode> = {
  manager: <UserCog size={13} />,
  sales: <ShoppingBag size={13} />,
  warehouse: <Warehouse size={13} />,
  super_admin: <Crown size={13} />,
}

type ResendState = "idle" | "sending" | "done" | "error"

export default function StaffDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { role: effectiveRole, staffDirectory, sites, updateStaffAccount, deleteStaffAccount } = useAdminData()

  const [resendState, setResendState] = useState<ResendState>("idle")
  const [resendError, setResendError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (effectiveRole !== "super_admin") router.replace("/admin/dashboard")
  }, [effectiveRole, router])

  const staff = useMemo(() => {
    const raw = staffDirectory.find((s) => s.id === params.id)
    if (!raw) return null
    return {
      ...raw,
      displayStatus: (raw.status === "active" && !raw.lastLogin ? "invited" : raw.status) as StaffAccountStatus,
      siteName: raw.siteId ? sites.find((site) => site.id === raw.siteId)?.name : undefined,
    }
  }, [staffDirectory, sites, params.id])

  const handleResendInvite = async () => {
    if (!staff) return
    setResendState("sending")
    setResendError(null)
    setInviteLink(null)
    setCopied(false)

    try {
      const res = await fetch(`/api/admin/staff/${staff.id}/resend-invite`, { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResendError(body.error ?? "Couldn't resend the invite.")
        setResendState("error")
        return
      }
      setInviteLink(body.link)
      setResendState("done")
    } catch {
      setResendError("Couldn't reach the server. Try again.")
      setResendState("error")
    }
  }

  const handleCopyLink = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can fail in some contexts (non-HTTPS, permissions) —
      // the link is still shown/selectable on screen either way.
    }
  }

  if (effectiveRole !== "super_admin") return null

  if (!staff) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-2xl px-6 pb-20 pt-10 lg:px-10">
          <button
            type="button"
            onClick={() => router.push("/admin/super-admin/staff")}
            className="flex items-center gap-1.5 text-xs font-semibold text-ink/50 hover:text-ink/80"
          >
            <ArrowLeft size={14} /> Back to staff
          </button>
          <div className="mt-8 rounded-2xl border border-dashed border-ink/15 bg-card px-4 py-16 text-center">
            <p className="text-sm font-semibold text-ink/70">Staff account not found</p>
            <p className="mt-1 text-xs text-ink/45">It may have been removed.</p>
          </div>
        </div>
      </div>
    )
  }

  if (staff.status === "pending") {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <PendingApprovalPanel
          staff={staff}
          sites={sites}
          allowedRoles={ALL_ROLES}
          onDone={() => router.push("/admin/super-admin/staff")}
          updateStaffAccount={updateStaffAccount}
          deleteStaffAccount={deleteStaffAccount}
        />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-2xl px-6 pb-20 pt-10 lg:px-10">
        <button
          type="button"
          onClick={() => router.push("/admin/super-admin/staff")}
          className="flex items-center gap-1.5 text-xs font-semibold text-ink/50 hover:text-ink/80"
        >
          <ArrowLeft size={14} /> Back to staff
        </button>

        {/* ── Header ── */}
        <div className="mt-6 flex items-center gap-4">
          <div className="grid h-14 w-14 flex-none place-items-center rounded-full bg-teal-deep/10 font-display text-lg font-semibold text-teal-deep">
            {staff.name.charAt(0)}
          </div>
          <div>
            <h1 className="font-display text-2xl text-ink">{staff.name}</h1>
            <p className="mt-0.5 text-sm text-ink/50">{staff.email}</p>
          </div>
        </div>

        {/* ── Badges ── */}
        {/* staff.role is guaranteed non-null here — the `status ===
            "pending"` branch above (the only case role can be null)
            already returned earlier. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.04] px-2.5 py-1 text-xs font-semibold text-ink/60 ring-1 ring-inset ring-ink/10">
            {ROLE_ICON[staff.role as Role]} {ROLE_LABEL[staff.role as Role]}
          </span>
          {staff.siteName && (
            <span className="rounded-full bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal-deep">
              {staff.siteName}
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STAFF_STATUS_TONE[staff.displayStatus]}`}>
            {STAFF_STATUS_LABEL[staff.displayStatus]}
          </span>
        </div>

        <p className="mt-3 text-xs text-ink/40">
          {!staff.lastLogin ? "Never signed in" : `Active ${formatAge((Date.now() - new Date(staff.lastLogin).getTime()) / 3_600_000)} ago`}
        </p>

        {/* ── Pending invite card ── */}
        {staff.displayStatus === "invited" && (
          <div className="mt-8 rounded-2xl border border-ink/10 bg-card p-5">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-teal-deep" />
              <p className="font-display text-sm font-semibold text-ink">Invite pending</p>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink/55">
              This account was invited but hasn't set a password yet. If the invite email didn't
              arrive, generate a fresh link below and send it to them directly.
            </p>

            <button
              type="button"
              onClick={handleResendInvite}
              disabled={resendState === "sending"}
              className="mt-4 rounded-lg bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
            >
              {resendState === "sending" ? "Generating link…" : "Resend invite"}
            </button>

            {resendState === "error" && (
              <p className="mt-3 rounded-lg bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                {resendError}
              </p>
            )}

            {resendState === "done" && inviteLink && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-ink/50">Invite link</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs text-ink/70 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex flex-none items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs font-semibold text-ink/70 hover:bg-ink/[0.03]"
                  >
                    {copied ? <Check size={13} className="text-teal-deep" /> : <Copy size={13} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-ink/40">
                  No email is sent automatically — copy this link and send it to them yourself.
                </p>
              </div>
            )}
          </div>
        )}

        <p className="mt-6 flex items-center gap-1.5 text-xs text-ink/35">
          <ShieldCheck size={12} /> Only Super Admin can view or manage this account.
        </p>
      </div>
    </div>
  )
}