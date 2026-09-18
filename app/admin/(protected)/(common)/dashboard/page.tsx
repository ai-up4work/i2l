// app/admin/dashboard/page.tsx
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAdminData } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"

// The "Dashboard" nav link always points here, regardless of role — this
// page's only job is to send the person on to their actual dashboard
// (/admin/dashboard/warehouse, /sales, /manager, or the Super Admin
// overview), each a fully separate route/file. Keeping one stable entry
// URL means the sidebar link never has to know or care who's logged in,
// and switching roles via the role switcher just re-runs this redirect
// on next visit.
//
// Record<Role, string> is supposed to force every Role variant to have
// an entry here at compile time — this previously omitted 'super_admin'
// and TypeScript didn't catch it, which sent DASHBOARD_PATH['super_admin']
// to `undefined` and crashed router.replace(undefined) for any Super
// Admin landing on /admin/dashboard. Keep this object's keys in sync
// with the Role union any time a new role is added.

const DASHBOARD_PATH: Record<Role, string> = {
  warehouse: "/admin/warehouse-dashboard",
  manager: "/admin/manager-dashboard",
  sales: "/admin/sales-dashboard",
  super_admin: "/admin/super-admin",
}

export default function DashboardRedirectPage() {
  const router = useRouter()
  const { currentUser } = useAdminData()

  useEffect(() => {
    const target = DASHBOARD_PATH[currentUser.role]
    if (!target) {
      // Defensive fallback — if a future role is ever added without a
      // matching entry here, land somewhere safe instead of crashing
      // router.replace(undefined) again.
      console.error(`[DashboardRedirectPage] No DASHBOARD_PATH entry for role "${currentUser.role}"`)
      return
    }
    router.replace(target)
  }, [currentUser.role, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment font-body text-sm text-ink/40">
      Taking you to your dashboard…
    </div>
  )
}