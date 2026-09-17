// components/admin/CurrentStaffBadge.tsx
//
// Replaces RoleSwitcher.tsx, which let anyone flip a dropdown to
// "Preview as Manager/Sales/Warehouse/Super Admin" — a dev convenience
// from before real staff auth existed. Now that AdminDataContext's
// currentUser/role come from the actual signed-in staff_accounts row
// (via /api/admin/auth/me, enforced by middleware.ts before any /admin
// page even renders), there's nothing left to "preview" — the role
// shown here is simply who you actually are. This is read-only on
// purpose: switching roles is now a real action (someone else changing
// your staff_accounts.role, or you signing in as a different account),
// not a client-side toggle.
"use client"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"

const ROLE_LABEL: Record<Role, string> = {
  manager: "Manager",
  sales: "Sales & Purchase",
  warehouse: "Warehouse",
  super_admin: "Super Admin",
}

export function CurrentStaffBadge() {
  const { role, currentUser, sites } = useAdminData()
  const siteName = currentUser.siteId ? sites.find((s) => s.id === currentUser.siteId)?.name : null

  return (
    <div className="flex items-center gap-2.5 pb-1">
      <span className="grid size-8 flex-none place-items-center rounded-full bg-teal/12 text-sm font-semibold text-teal-deep">
        {currentUser.name.charAt(0).toUpperCase() || "?"}
      </span>
      <div className="text-right leading-tight">
        <p className="text-sm font-medium text-indigo-900">{currentUser.name}</p>
        <p className="text-xs text-indigo-400">
          {ROLE_LABEL[role]}
          {siteName ? ` · ${siteName}` : ""}
        </p>
      </div>
    </div>
  )
}