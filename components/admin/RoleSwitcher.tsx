// components/admin/RoleSwitcher.tsx
"use client"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"

const ROLE_LABEL: Record<Role, string> = {
  manager: "Manager",
  sales: "Sales",
  warehouse: "Warehouse",
  super_admin: "Super Admin",
}

export function RoleSwitcher() {
  const { role, currentUser, sites } = useAdminData()
  const siteName = currentUser.siteId ? sites.find((s) => s.id === currentUser.siteId)?.name : null

  return (
    <div className="flex items-center gap-3 pb-1">
      <div className="text-right leading-tight">
        <p className="text-sm font-medium text-indigo-900">{currentUser.name}</p>
        <p className="text-xs text-indigo-400">
          {ROLE_LABEL[role]}
          {siteName ? ` · ${siteName}` : ""}
        </p>
      </div>
      <span className="rounded-md border border-indigo-200 bg-white px-2 py-1.5 text-sm text-indigo-700">
        {ROLE_LABEL[role]}
      </span>
    </div>
  )
}