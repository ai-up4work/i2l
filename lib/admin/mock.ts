// lib/admin/staffMock.ts
//
// StaffMember (types/admin.ts) is deliberately thin — id/name/role/siteId
// only, since AdminDataContext has no real staff-account backend yet (no
// email, status, or login-history fields, and no updateStaff/
// deactivateStaff mutations). The staff list and staff detail pages both
// need *something* other than a blank status/activity section, so this
// file derives a stable mock profile from a staff id — the same id
// always produces the same status/email/activity feed, across both
// pages and across re-renders, without adding any new context state.
//
// DISPLAY-ONLY. Nothing here is persisted or wired into AdminDataContext.
// When a real staff backend exists, this file goes away and its two
// callers switch to real fields on StaffMember.

export type StaffAccountStatus = "active" | "invited" | "deactivated" | "pending"

export interface StaffActivityEvent {
  id: string
  label: string
  hoursAgo: number
}

export interface StaffMeta {
  status: StaffAccountStatus
  /** null = never signed in yet (still an open invite) */
  lastLoginHoursAgo: number | null
  email: string
  activity: StaffActivityEvent[]
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** Deterministic mock profile for one staff id — same id → same result. */
export function getStaffMeta(id: string, name: string): StaffMeta {
  const h = hashStr(id)
  const invited = h % 11 === 0 // roughly 1 in 11 accounts is a pending invite
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@Wishdrop.shop`

  if (invited) {
    return {
      status: "invited",
      lastLoginHoursAgo: null,
      email,
      activity: [{ id: `${id}-invited`, label: "Invitation sent", hoursAgo: (h % 72) + 1 }],
    }
  }

  const lastLoginHoursAgo = h % 96
  return {
    status: "active",
    lastLoginHoursAgo,
    email,
    activity: [
      { id: `${id}-a1`, label: "Signed in", hoursAgo: lastLoginHoursAgo },
      { id: `${id}-a2`, label: "Updated an order stage", hoursAgo: lastLoginHoursAgo + (h % 20) + 4 },
      { id: `${id}-a3`, label: "Signed in", hoursAgo: lastLoginHoursAgo + (h % 40) + 20 },
      { id: `${id}-a4`, label: "Account created", hoursAgo: lastLoginHoursAgo + (h % 400) + 200 },
    ],
  }
}

export const STAFF_STATUS_LABEL: Record<StaffAccountStatus, string> = {
  active: "Active",
  invited: "Invite pending",
  deactivated: "Deactivated",
  pending: "Requested access",
}

export const STAFF_STATUS_TONE: Record<StaffAccountStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  invited: "bg-gold/15 text-gold-deep ring-1 ring-inset ring-gold/30",
  deactivated: "bg-ink/[0.04] text-ink/40 ring-1 ring-inset ring-ink/10",
  pending: "bg-teal/10 text-teal-deep ring-1 ring-inset ring-teal/25",
}