// components/admin/admin-sidebar.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image"
import { useMemo } from "react"

import {
  LayoutDashboard,
  ClipboardList,
  MessageCircle,
  Users,
  BookOpen,
  Layers,
  Percent,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  PackageCheck,
  Warehouse,
  Truck,
  Send,
  PartyPopper,
  Settings,
  ChevronsLeft,
  ChevronsUpDown,
  BarChart3,
  UserCog,
  Building2,
  LineChart,
  History,
  ShieldCheck,
  Plug,
  CreditCard,
  SlidersHorizontal,
  FileText,
  Lock,
} from "lucide-react"

import { useAdminSidebar } from "@/contexts/AdminSidebarContext"
import { useAdminData } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"
import { DASHBOARD_HREF } from "@/lib/admin/dashboard-routes"
import { ROLE_LABEL as ROLE_LABELS, RolePreviewPopover } from "@/components/admin/Rolepreviewmenu"

// Static sidebar nav — layout only, no auth/role logic wired up yet.
// TODO: active-section logic beyond pathname match, real user in footer row.
//
// ... (unchanged header comments) ...
//
// UNNOTICED-DATA SIGNAL: each nav item can carry a small badge — a dot
// when the sidebar is collapsed, a count pill when expanded — showing
// how many things in that section need a look. This is intentionally
// NOT wired to a separate "notifications" table: every count below is
// derived from data useAdminData() already fetches/subscribes to (see
// AdminDataContext's realtime section), so the badge updates on the
// same debounced refetch as the rest of the page, with zero extra
// requests. The `badgeCounts` useMemo below is the one place that decides what counts
// as "unnoticed" per section — change the predicate there, not at each
// call site, if the definition of "needs attention" for a queue changes.

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
  roles: Role[]
  /** Shown, but not a real link — no route/backing feature exists yet.
   * See the "Super Admin" group below: everything there except "All
   * staff" is still a stub page (2-line placeholders from the initial
   * /super-admin -> /admin/super-admin move), so linking to them would
   * just be a dead end dressed up as a real feature. Locked items stay
   * visible (so it's clear what's coming and roughly how it's grouped)
   * but aren't clickable — flip this off one at a time as each one
   * actually gets built, rather than adding the nav item back in later. */
  locked?: boolean
}

// super_admin isn't listed in any nav item's own `roles` array below —
// every single one only lists manager/sales/warehouse, and there was
// nothing making super_admin see any of them. Combined with
// MANAGER_PERMISSIONS being shared 1:1 with manager (see
// AdminDataContext.tsx: `super_admin: MANAGER_PERMISSIONS`), a
// super_admin could pass every auth check, land in /admin, and see a
// completely empty sidebar — full permissions, nothing to click.
// Centralizing the exception here (rather than appending "super_admin"
// to every roles array by hand) means a new nav item added later with
// just `roles: ["manager"]` still correctly includes super_admin
// without anyone needing to remember it.
function canSeeNavItem(item: NavItem, role: Role): boolean {
  return role === "super_admin" || item.roles.includes(role)
}

function getTopItems(role: Role): NavItem[] {
  const items: NavItem[] = [
    { label: "Dashboard", href: DASHBOARD_HREF[role], icon: LayoutDashboard, roles: ["manager", "sales", "warehouse"] },
    { label: "Orders", href: "/admin/orders", icon: ClipboardList, roles: ["manager", "sales", "warehouse"] },
    { label: "Requests", href: "/admin/requests", icon: ClipboardList, roles: ["manager", "sales"] },
    { label: "Customer chat", href: "/admin/chat", icon: MessageCircle, roles: ["manager", "sales"] },
    { label: "quote", href: "/admin/quote", icon: ClipboardList, roles: ["manager", "sales"] },
  ]
  return items.filter((item) => canSeeNavItem(item, role))
}

type Group = { label: string; items: NavItem[] }

function getGroups(role: Role): Group[] {
  const allGroups: Group[] = [
    {
      label: "Sourcing",
      items: [
        { label: "Sellers", href: "/admin/sellers", icon: Users, roles: ["manager", "sales"] },
        { label: "Scrape health", href: "/admin/scrape-health", icon: ClipboardList, roles: ["manager", "sales"] },
      ],
    },
    {
      label: "Purchasing",
      items: [{ label: "Purchases", href: "/admin/purchases", icon: ShoppingCart, roles: ["manager", "sales"] }],
    },
    {
      label: "Warehouse",
      items: [
        { label: "Quality check", href: "/admin/qc", icon: CheckCircle2, roles: ["manager", "warehouse"] },
        { label: "QC Issues", href: "/admin/qc-issues", icon: AlertTriangle, roles: ["manager", "warehouse"] },
        { label: "Pack & label", href: "/admin/pack-label", icon: PackageCheck, roles: ["manager", "warehouse"] },
        { label: "Export bin", href: "/admin/export-bin", icon: Warehouse, roles: ["manager", "warehouse"] },
        { label: "In transit", href: "/admin/in-transit", icon: Truck, roles: ["manager", "warehouse"] },
        { label: "Shipped", href: "/admin/shipped", icon: Send, roles: ["manager", "warehouse"] },
        { label: "Delivered", href: "/admin/delivered", icon: PartyPopper, roles: ["manager", "warehouse"] },
      ],
    },
    {
      label: "Manager",
      items: [
        { label: "Reports", href: "/admin/reports", icon: BarChart3, roles: ["manager"] },
        { label: "Staff", href: "/admin/staff", icon: UserCog, roles: ["manager"] },
        { label: "Warehouse Sites", href: "/admin/warehouses", icon: Building2, roles: ["manager"] },
      ],
    },
    {
      // Only ever visible to super_admin — see canSeeNavItem above.
      // These used to live under a separate, unstyled /super-admin
      // route with no shared navigation at all; now they're just
      // another group in the same sidebar, gated the same way
      // everything else here is. "All staff" is distinct from the
      // Manager group's "Staff" above: that one excludes Manager/Super
      // Admin rows entirely (Manager account creation is Super
      // Admin-only, per the roster page's own comment) — this one is
      // the full roster, every role included.
      label: "Super Admin",
      items: [
        { label: "Analytics", href: "/admin/super-admin/analytics", icon: LineChart, roles: ["super_admin"] },
        { label: "Audit log", href: "/admin/super-admin/audit-log", icon: History, roles: ["super_admin"], locked: true },
        { label: "Roles", href: "/admin/super-admin/roles", icon: ShieldCheck, roles: ["super_admin"], locked: true },
        { label: "All staff", href: "/admin/super-admin/staff", icon: Users, roles: ["super_admin"] },
        {
          label: "Pricing engine",
          href: "/admin/super-admin/settings/pricing-engine",
          icon: SlidersHorizontal,
          roles: ["super_admin"],
          locked: true,
        },
        {
          label: "Templates",
          href: "/admin/super-admin/settings/templates",
          icon: FileText,
          roles: ["super_admin"],
          locked: true,
        },
        {
          label: "Integrations",
          href: "/admin/super-admin/settings/integrations",
          icon: Plug,
          roles: ["super_admin"],
          locked: true,
        },
        {
          label: "Payment gateway",
          href: "/admin/super-admin/settings/payment-gateway",
          icon: CreditCard,
          roles: ["super_admin"],
          locked: true,
        },
      ],
    },
  ]

  return allGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => canSeeNavItem(item, role)) }))
    .filter((group) => group.items.length > 0)
}

export function AdminSidebar() {
  const pathname = usePathname()
  const { collapsed, toggle, isMobile } = useAdminSidebar()
  const {
    role,
    currentUser,
    visibleOrders,
    visiblePurchaseLines,
    visibleQcLines,
    visiblePackLines,
    visibleExportBinLines,
    visibleInTransitLines,
    requestLines,
    chatThreads,
  } = useAdminData()

  const topItems = getTopItems(role)
  const groups = getGroups(role)

  /**
   * href -> count of "unnoticed" items for that section. Every source
   * list here already comes scoped to the current role/site (the
   * `visible*` variants), so a Warehouse user at one site doesn't see a
   * badge for another site's backlog, matching how the queues
   * themselves are already scoped. Only hrefs that actually have a
   * signal are included — everything else (Dashboard, Sellers, Reports,
   * Staff, Settings, ...) simply has no entry, which the lookup below
   * treats the same as zero.
   */
  const badgeCounts = useMemo(() => {    const counts: Record<string, number> = {}

    counts["/admin/orders"] = visibleOrders.filter((o) => o.delayed).length

    counts["/admin/requests"] = requestLines.filter(
      (r) => r.slaBreached || r.status === "sent_for_review"
    ).length

    counts["/admin/chat"] = chatThreads.filter((t) => t.unread).length

    counts["/admin/purchases"] = visiblePurchaseLines.filter((l) => l.status === "needs_purchase").length

    counts["/admin/qc"] = visibleQcLines.filter((l) => l.status === "pending").length
    counts["/admin/qc-issues"] = visibleQcLines.filter((l) => l.status === "flagged").length

    counts["/admin/pack-label"] = visiblePackLines.filter((l) => l.status === "awaiting_pack").length

    counts["/admin/export-bin"] = visibleExportBinLines.length

    counts["/admin/in-transit"] = visibleInTransitLines.filter((l) => l.deliveryStatus === "overdue").length

    return counts
  }, [
    visibleOrders,
    requestLines,
    chatThreads,
    visiblePurchaseLines,
    visibleQcLines,
    visiblePackLines,
    visibleExportBinLines,
    visibleInTransitLines,
  ])

  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-ink/10 bg-card font-body text-ink shadow-[1px_0_0_rgba(32,36,43,0.02),12px_0_28px_-20px_rgba(32,36,43,0.35)] transition-[width] duration-300 ease-out motion-reduce:transition-none ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      {!isMobile && (
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-5 z-10 grid h-6 w-6 place-items-center rounded-full border border-ink/10 bg-card text-ink/40 shadow-[0_2px_6px_rgba(32,36,43,0.14)] transition-all hover:text-teal-deep hover:shadow-[0_4px_12px_rgba(32,36,43,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
        >
          <ChevronsLeft
            size={13}
            className={`transition-transform duration-300 ease-out motion-reduce:transition-none ${collapsed ? "rotate-180" : ""}`}
          />
        </button>
      )}

      <div className="flex h-16 flex-none items-center border-b border-ink/10 px-4">
        {collapsed ? (
          <span className="mx-auto grid h-8 w-8 place-items-center rounded-lg bg-teal-deep font-display text-sm font-semibold leading-none text-parchment">
            W
          </span>
        ) : (
          <Image src="/wish-drop-logo.png" alt="WishDrop" width={120} height={32} className="h-9 w-auto object-contain" />
        )}
      </div>

      <nav className="nav-scroll flex-1 overflow-y-auto overflow-x-visible px-3 py-5">
        <div className="flex flex-col gap-1">
          {topItems.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              collapsed={collapsed}
              count={badgeCounts[item.href]}
            />
          ))}
        </div>

        {groups.map((group, i) => (
          <div key={group.label} className={`${i === 0 ? "mt-5" : "mt-6"} ${!collapsed ? "" : "border-t border-ink/[0.06] pt-5"}`}>
            {!collapsed && (
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.01em] text-ink/35">{group.label}</p>
            )}
            <div className="flex flex-col gap-1">
              {group.items.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  collapsed={collapsed}
                  count={badgeCounts[item.href]}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-none border-t border-ink/10 px-3 py-3">
        <SidebarLink
          item={{ label: "Settings", href: "/admin/settings", icon: Settings, roles: ["manager", "sales", "warehouse"] }}
          active={isActive("/admin/settings")}
          collapsed={collapsed}
        />

        <RolePreviewPopover>
          <div
            className={`mt-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <span className="relative flex-none">
              <span className="block h-8 w-8 overflow-hidden rounded-full bg-teal-deep">
                <Image src="/default-avatar.png" alt="" width={32} height={32} className="h-full w-full object-cover" />
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-teal-deep ring-2 ring-card" />
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink/80">{currentUser.name}</span>
                  <span className="block truncate text-xs text-ink/40">{ROLE_LABELS[role]}</span>
                </span>
                <ChevronsUpDown size={13} className="flex-none text-ink/30" />
              </>
            )}
          </div>
        </RolePreviewPopover>
      </div>
    </aside>
  )
}

function SidebarLink({
  item,
  active,
  collapsed,
  count,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
  count?: number
}) {
  const Icon = item.icon
  const hasSignal = !!count && count > 0

  // Locked: visible so it's clear the section exists and roughly what's
  // planned, but not a real <Link> — there's no page behind it worth
  // navigating to yet (see NavItem's own doc comment on `locked`).
  // Deliberately a <div>, not a disabled <button> or a Link with
  // pointer-events-none: a real anchor tag here would still be
  // keyboard-focusable and "look" like a working link to a screen
  // reader, which is worse than not being a link at all for something
  // that goes nowhere.
  if (item.locked) {
    return (
      <div className="group/nav relative">
        <div
          aria-disabled="true"
          className={`relative flex cursor-not-allowed items-center gap-3 rounded-xl py-2.5 pr-3 text-sm font-medium text-ink/30 ${
            collapsed ? "justify-center pl-3" : "pl-3.5"
          }`}
        >
          <Icon size={18} strokeWidth={1.75} />
          {!collapsed && <span className="truncate flex-1">{item.label}</span>}
          {!collapsed && <Lock size={13} strokeWidth={2} className="flex-none text-ink/25" />}
        </div>

        <span
          role="tooltip"
          className={`pointer-events-none absolute z-20 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-parchment opacity-0 shadow-[0_8px_20px_-8px_rgba(32,36,43,0.45)] transition-all duration-150 group-hover/nav:opacity-100 ${
            collapsed
              ? "left-full top-1/2 ml-2 -translate-x-1 -translate-y-1/2 group-hover/nav:translate-x-0"
              : "left-3.5 top-full mt-1 -translate-y-1 group-hover/nav:translate-y-0"
          }`}
        >
          Coming soon
        </span>
      </div>
    )
  }

  return (
    <div className="group/nav relative">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`relative flex items-center gap-3 rounded-xl py-2.5 pr-3 text-sm font-medium transition-colors before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:transition-colors before:duration-200 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 ${
          collapsed ? "justify-center pl-3" : "pl-3.5"
        } ${
          active
            ? "bg-teal/[0.08] text-teal-deep before:bg-teal-deep"
            : "text-ink/55 before:bg-transparent hover:bg-ink/[0.04] hover:text-ink"
        }`}
      >
        <span className="relative flex-none">
          <Icon size={18} strokeWidth={1.75} />
          {/* Collapsed: a plain dot on the icon corner — enough to say
              "something here", without a number crowding an 18px icon. */}
          {collapsed && hasSignal && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-card" />
          )}
        </span>
        {!collapsed && <span className="truncate flex-1">{item.label}</span>}
        {/* Expanded: a count pill, right-aligned. Capped at "9+" so a
            three-digit backlog doesn't blow out the row width. */}
        {!collapsed && hasSignal && (
          <span className="ml-auto flex-none rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {count! > 9 ? "9+" : count}
          </span>
        )}
      </Link>

      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-parchment opacity-0 shadow-[0_8px_20px_-8px_rgba(32,36,43,0.45)] transition-all duration-150 group-hover/nav:translate-x-0 group-hover/nav:opacity-100"
        >
          {item.label}
          {hasSignal ? ` · ${count! > 9 ? "9+" : count}` : ""}
        </span>
      )}
    </div>
  )
}