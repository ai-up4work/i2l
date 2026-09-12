// app/admin/dashboard/page.tsx
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAdminData } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"

// The "Dashboard" nav link always points here, regardless of role — this
// page's only job is to send the person on to their actual dashboard
// (/admin/dashboard/warehouse, /sales, or /manager), each a fully
// separate route/file. Keeping one stable entry URL means the sidebar
// link never has to know or care who's logged in, and switching roles
// via the role switcher just re-runs this redirect on next visit.

const DASHBOARD_PATH: Record<Role, string> = {
  warehouse: "/admin/warehouse-dashboard",
  manager: "/admin/manager-dashboard",
  sales: "/admin/sales-dashboard",
}

export default function DashboardRedirectPage() {
  const router = useRouter()
  const { currentUser } = useAdminData()

  useEffect(() => {
    router.replace(DASHBOARD_PATH[currentUser.role])
  }, [currentUser.role, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment font-body text-sm text-ink/40">
      Taking you to your dashboard…
    </div>
  )
}