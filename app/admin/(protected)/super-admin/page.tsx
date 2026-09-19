// app/admin/(protected)/super-admin/page.tsx
//
// Why this page exists: /admin/dashboard sends a super_admin to
// DASHBOARD_HREF["super_admin"], which used to point at /admin/manager-dashboard
// (super_admin shares MANAGER_PERMISSIONS). But manager-dashboard guards with
// `if (role !== "manager") router.replace("/admin/dashboard")`, which bounced a
// real super_admin straight back, and the two redirected each other forever.
// This dedicated landing page has no other role's guard to collide with.
//
// Content: the super-admin-only areas (see the "Super Admin" nav group in
// components/admin/admin-sidebar.tsx) plus the summary figures useAdminData()
// really has (staffDirectory, sites). No charts for data this app doesn't
// track yet; revenue, WhatsApp cost and the rest live under
// /admin/super-admin/analytics/*, which are still stubs.
"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, History, LayoutDashboard, LineChart, ShieldCheck, SlidersHorizontal, Users } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"

type AreaIcon = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

const AREAS: { href: string; icon: AreaIcon; title: string; description: string }[] = [
  {
    href: "/admin/super-admin/analytics",
    icon: LineChart,
    title: "Analytics",
    description: "Revenue, ops, orders, WhatsApp cost, and seller performance.",
  },
  {
    href: "/admin/super-admin/audit-log",
    icon: History,
    title: "Audit log",
    description: "Every sensitive action taken across the console.",
  },
  {
    href: "/admin/super-admin/roles",
    icon: ShieldCheck,
    title: "Roles",
    description: "What each role can see and do.",
  },
  {
    href: "/admin/super-admin/staff",
    icon: Users,
    title: "All staff",
    description: "The full roster, every role included, not just Sales and Warehouse.",
  },
  {
    href: "/admin/super-admin/settings/pricing-engine",
    icon: SlidersHorizontal,
    title: "Platform settings",
    description: "Pricing engine, message templates, integrations, and the payment gateway.",
  },
]

export default function SuperAdminDashboardPage() {
  const router = useRouter()
  const { role, currentUser, staffDirectory, staffLoading, sites } = useAdminData()

  useEffect(() => {
    // Reads the effective `role` (previewRole-aware), not currentUser.role, so
    // previewing another role and direct access behave the same way.
    if (role !== "super_admin") router.replace("/admin/dashboard")
  }, [role, router])

  const activeStaffCount = useMemo(() => staffDirectory.filter((s) => s.status === "active").length, [staffDirectory])
  const managerCount = useMemo(() => staffDirectory.filter((s) => s.role === "manager").length, [staffDirectory])

  if (role !== "super_admin") return null

  const stat = (n: number) => (staffLoading ? "\u2014" : n)

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-24 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <LayoutDashboard size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">
                Good to see you, {currentUser.name.split(" ")[0]}
              </h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Full oversight, platform-wide settings, and everything Manager sees.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3" title="Active staff, out of everyone on the roster including deactivated accounts">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Active staff</dt>
              <dd className="mt-0.5 whitespace-nowrap font-display text-xl text-ink">
                {stat(activeStaffCount)}
                {!staffLoading && <span className="ml-1.5 font-body text-xs text-ink/40">of {staffDirectory.length}</span>}
              </dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Managers</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{stat(managerCount)}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Warehouse sites</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{sites.length}</dd>
            </div>
          </dl>
        </div>

        {/* ── Super Admin areas ── */}
        <nav aria-label="Super Admin areas" className="mt-9 overflow-clip rounded-2xl border border-ink/10 bg-card">
          {AREAS.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 border-b border-ink/[0.06] px-5 py-4 outline-none transition-colors last:border-b-0 hover:bg-ink/[0.02] focus-visible:bg-teal/[0.06] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40"
            >
              <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="mt-0.5 block text-xs text-ink/55">{description}</span>
              </span>
              <ChevronRight size={16} className="flex-none text-ink/25" aria-hidden />
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}