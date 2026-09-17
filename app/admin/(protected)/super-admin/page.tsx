// app/admin/(protected)/super-admin/page.tsx
//
// The missing piece that caused an actual infinite redirect loop:
// /admin/dashboard sends a super_admin to DASHBOARD_HREF['super_admin'],
// which used to just point at /admin/manager-dashboard (reusing
// Manager's page, since super_admin shares MANAGER_PERMISSIONS). But
// manager-dashboard has its own guard — `if (role !== "manager")
// router.replace("/admin/dashboard")` — which bounced a real
// super_admin (role !== "manager") straight back to /admin/dashboard,
// which redirected to manager-dashboard again, forever. This is the
// real, dedicated landing page super_admin needed so that loop can't
// happen: this page has no other role's guard to collide with.
//
// Content-wise: an overview of the super-admin-only areas (see
// components/admin/admin-sidebar.tsx's "Super Admin" nav group) plus a
// couple of real summary stats already available from useAdminData()
// (staffDirectory, sites) — not fake charts for data this app doesn't
// track yet (revenue, WhatsApp cost, etc. — those live at
// /admin/super-admin/analytics/*, still stubs themselves; see that
// section's own pages).
"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  LineChart,
  History,
  ShieldCheck,
  Users,
  SlidersHorizontal,
  ChevronRight,
  Building2,
} from "lucide-react"
import { useAdminData } from "@/contexts/AdminDataContext"
import { StatCard } from "@/components/admin/dashboard/shared"

function AreaCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-2xl border border-ink/10 bg-card p-5 transition-colors hover:border-teal/30 hover:bg-teal/[0.03]"
    >
      <span className="grid size-10 flex-none place-items-center rounded-full bg-teal/10 text-teal-deep">
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ink/55">{description}</p>
      </div>
      <ChevronRight size={16} className="mt-2 flex-none text-ink/35" />
    </Link>
  )
}

export default function SuperAdminDashboardPage() {
  const router = useRouter()
  const { role, currentUser, staffDirectory, staffLoading, sites } = useAdminData()

  useEffect(() => {
    // Same pattern as the other three dashboards — reads the effective
    // `role` (previewRole-aware), not currentUser.role, so "Preview as
    // Super Admin" (only meaningful the other direction in practice,
    // but kept consistent) and direct access both behave the same way.
    if (role !== "super_admin") router.replace("/admin/dashboard")
  }, [role, router])

  const activeStaffCount = useMemo(() => staffDirectory.filter((s) => s.status === "active").length, [staffDirectory])
  const managerCount = useMemo(() => staffDirectory.filter((s) => s.role === "manager").length, [staffDirectory])

  if (role !== "super_admin") return null

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1200px] px-6 pb-24 pt-10 lg:px-10">
        <h1 className="font-display text-3xl text-ink">Good to see you, {currentUser.name.split(" ")[0]}</h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
          Full oversight, platform-wide settings, and everything Manager sees.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            icon={<Users size={15} />}
            label="Active staff"
            value={staffLoading ? "…" : activeStaffCount}
            hint={staffLoading ? undefined : `${staffDirectory.length} total, incl. deactivated`}
          />
          <StatCard icon={<ShieldCheck size={15} />} label="Managers" value={staffLoading ? "…" : managerCount} />
          <StatCard icon={<Building2 size={15} />} label="Warehouse sites" value={sites.length} />
        </div>

        <h2 className="mt-10 text-xs font-semibold uppercase tracking-wide text-ink/35">Super Admin</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AreaCard
            href="/admin/super-admin/analytics"
            icon={LineChart}
            title="Analytics"
            description="Revenue, ops, orders, WhatsApp cost, and seller performance."
          />
          <AreaCard
            href="/admin/super-admin/audit-log"
            icon={History}
            title="Audit log"
            description="Every sensitive action taken across the console."
          />
          <AreaCard
            href="/admin/super-admin/roles"
            icon={ShieldCheck}
            title="Roles"
            description="What each role can see and do."
          />
          <AreaCard
            href="/admin/super-admin/staff"
            icon={Users}
            title="All staff"
            description="The full roster, every role included — not just Sales & Warehouse."
          />
          <AreaCard
            href="/admin/super-admin/settings/pricing-engine"
            icon={SlidersHorizontal}
            title="Platform settings"
            description="Pricing engine, message templates, integrations, and the payment gateway."
          />
        </div>
      </div>
    </div>
  )
}