// components/admin/RoleSwitcher.tsx
"use client"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"

const ROLE_LABEL: Record<Role, string> = {
  manager: "Manager",
  sales: "Sales",
  warehouse: "Warehouse",
}

export function RoleSwitcher() {
  const { role, setRole, currentUser, sites } = useAdminData()
  const siteName = currentUser.siteId ? sites.find((s) => s.id === currentUser.siteId)?.name : null

  return (
    <div className="flex items-center gap-3">
      <div className="text-right leading-tight">
        <p className="text-sm font-medium text-indigo-900">{currentUser.name}</p>
        <p className="text-xs text-indigo-400">
          {ROLE_LABEL[role]}
          {siteName ? ` · ${siteName}` : ""}
        </p>
      </div>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="rounded-md border border-indigo-200 bg-white px-2 py-1.5 text-sm text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        aria-label="Preview the console as a different role"
      >
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <option key={r} value={r}>
            Preview as {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
    </div>
  )
}