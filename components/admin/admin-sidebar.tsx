// components/admin/admin-sidebar.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image"

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
  PackageCheck,
  Warehouse,
  Truck,
  Send,
  Settings,
  ChevronsLeft,
  ChevronsUpDown,
  BarChart3,
  UserCog,
  Building2,
} from "lucide-react"

import { useAdminSidebar } from "@/contexts/AdminSidebarContext"
import { useAdminData } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"

// Static sidebar nav — layout only, no auth/role logic wired up yet.
// TODO: active-section logic beyond pathname match, real user in footer row.
//
// Solid parchment-tinted surface, not glass — this panel sits beside flat
// content all day, so it reads as a fixed instrument panel rather than a
// floating card. Active state is a left accent bar + tint, the same idiom
// used for seller-row status in /admin/sellers, so "this is the active
// one" means the same thing everywhere in the product.
//
// Collapse toggle lives as a single small button pinned to the sidebar's
// own edge, at a fixed height, whether expanded or collapsed — one control
// with one location, rather than two different buttons appearing in two
// different places depending on state. Collapsed nav items get a real
// tooltip (not just a native title attribute) since an icon alone is
// often genuinely ambiguous — Requests vs Purchases vs Quality check all
// read as "a clipboard" at 18px.
//
// Collapsed state is lifted into AdminSidebarContext so the layout can
// react to it (shifting content margin) and so mobile can force it closed
// without the sidebar and layout drifting out of sync.
//
// Role-awareness: every item declares which role(s) can see it. Nothing
// is hidden by CSS — items simply aren't in the filtered array, same
// principle as "Sales & Purchase gets no mutation controls rendered at
// all (not disabled — absent)" from the orders page spec, applied here
// to nav visibility instead of row actions.
//
// ⚠️ DEVIATION FROM v2 ROUTE SPEC: the spec scopes Sourcing/Purchasing to
// (sales) and Warehouse-ops to (warehouse) only — Manager isn't listed
// under either group. Manager has been added to every item's roles[]
// here on request, so Manager now sees Sourcing, Purchasing, and
// Warehouse nav in addition to their own Manager group. This gives
// Manager sidebar *visibility* into every page; it does NOT by itself
// grant Manager the mutation rights described for Sales/Warehouse roles
// on those pages (e.g. running QC, editing a catalogue price) — that's
// page-level logic the spec never defined for Manager and still needs
// a decision (view-only oversight vs. full write access) before those
// pages are built out.

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
  roles: Role[]
}

const ROLE_LABELS: Record<Role, string> = {
  manager: "Manager",
  sales: "Sales & Purchase",
  warehouse: "Warehouse",
}

const DASHBOARD_HREF: Record<Role, string> = {
  manager: "/admin/manager-dashboard",
  sales: "/admin/sales-dashboard",
  warehouse: "/admin/warehouse-dashboard",
}

// Items shared by every role get all three; items scoped to one or two
// roles per the spec only list those.
function getTopItems(role: Role): NavItem[] {
  const items: NavItem[] = [
    { label: "Dashboard", href: DASHBOARD_HREF[role], icon: LayoutDashboard, roles: ["manager", "sales", "warehouse"] },
    { label: "Orders", href: "/admin/orders", icon: ClipboardList, roles: ["manager", "sales", "warehouse"] },
    { label: "Requests", href: "/admin/requests", icon: ClipboardList, roles: ["manager", "sales"] },
    { label: "Customer chat", href: "/admin/chat", icon: MessageCircle, roles: ["manager", "sales"] },
  ]
  return items.filter((item) => item.roles.includes(role))
}

type Group = { label: string; items: NavItem[] }

function getGroups(role: Role): Group[] {
  const allGroups: Group[] = [
    {
      label: "Sourcing",
      items: [
        { label: "Sellers", href: "/admin/sellers", icon: Users, roles: ["manager", "sales"] },
        { label: "Catalogues", href: "/admin/catalogues", icon: BookOpen, roles: ["manager", "sales"] },
        { label: "Collections", href: "/admin/collections", icon: Layers, roles: ["manager", "sales"] },
        { label: "Discounts", href: "/admin/discounts", icon: Percent, roles: ["manager", "sales"] },
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
        { label: "Pack & label", href: "/admin/pack-label", icon: PackageCheck, roles: ["manager", "warehouse"] },
        { label: "Export bin", href: "/admin/export-bin", icon: Warehouse, roles: ["manager", "warehouse"] },
        { label: "In transit", href: "/admin/in-transit", icon: Truck, roles: ["manager", "warehouse"] },
        { label: "Shipped", href: "/admin/shipped", icon: Send, roles: ["manager", "warehouse"] },
      ],
    },
    {
      // Manager-exclusive group — Reports/Staff/Warehouse Sites still
      // belong to Manager alone, unaffected by the change above.
      label: "Manager",
      items: [
        { label: "Reports", href: "/admin/reports", icon: BarChart3, roles: ["manager"] },
        { label: "Staff", href: "/admin/staff", icon: UserCog, roles: ["manager"] },
        { label: "Warehouse Sites", href: "/admin/staff/warehouses", icon: Building2, roles: ["manager"] },
      ],
    },
  ]

  // Filter items within each group by role, then drop any group that ends
  // up with zero visible items — an empty group header with nothing under
  // it is worse than no header at all.
  return allGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(role)) }))
    .filter((group) => group.items.length > 0)
}

export function AdminSidebar() {
  const pathname = usePathname()
  const { collapsed, toggle, isMobile } = useAdminSidebar()
  const { role, currentUser } = useAdminData()

  const topItems = getTopItems(role)
  const groups = getGroups(role)

  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href)

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-ink/10 bg-card font-body text-ink shadow-[1px_0_0_rgba(32,36,43,0.02),12px_0_28px_-20px_rgba(32,36,43,0.35)] transition-[width] duration-300 ease-out motion-reduce:transition-none ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      {/* Single collapse/expand control, pinned to the sidebar's own edge
          at a fixed height — never relocates depending on state.
          Hidden on mobile: mobile is always forced closed, so there's
          nothing for the user to toggle. */}
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

      {/* Brand */}
      <div className="flex h-16 flex-none items-center border-b border-ink/10 px-4">
        {collapsed ? (
          <span className="mx-auto grid h-8 w-8 place-items-center rounded-lg bg-teal-deep font-display text-sm font-semibold leading-none text-parchment">
            W
          </span>
        ) : (
          <Image
            src="/wish-drop-logo.png"
            alt="WishDrop"
            width={120}
            height={32}
            className="h-9 w-auto object-contain"
          />
        )}
      </div>

      {/* Nav */}
      <nav className="nav-scroll flex-1 overflow-y-auto overflow-x-visible px-3 py-5">
        <div className="flex flex-col gap-1">
          {topItems.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>

        {groups.map((group, i) => (
          <div key={group.label} className={`${i === 0 ? "mt-5" : "mt-6"} ${!collapsed ? "" : "border-t border-ink/[0.06] pt-5"}`}>
            {!collapsed && (
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.01em] text-ink/35">{group.label}</p>
            )}
            <div className="flex flex-col gap-1">
              {group.items.map((item) => (
                <SidebarLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Settings + profile, pinned to bottom. Settings is shared across
          every role (per spec, "shared, outside any group"), so it's
          rendered unconditionally rather than filtered. */}
      <div className="flex-none border-t border-ink/10 px-3 py-3">
        <SidebarLink
          item={{ label: "Settings", href: "/admin/settings", icon: Settings, roles: ["manager", "sales", "warehouse"] }}
          active={isActive("/admin/settings")}
          collapsed={collapsed}
        />

        <button
          type="button"
          className={`mt-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <span className="relative flex-none">
            <span className="block h-8 w-8 overflow-hidden rounded-full bg-teal-deep">
              <Image
                src="/default-avatar.png"
                alt=""
                width={32}
                height={32}
                className="h-full w-full object-cover"
              />
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
        </button>
      </div>
    </aside>
  )
}

function SidebarLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
}) {
  const Icon = item.icon
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
        <Icon size={18} strokeWidth={1.75} className="flex-none" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>

      {/* Custom tooltip for the collapsed rail — a bare icon alone is
          genuinely ambiguous (three clipboard-shaped icons in this nav),
          and native `title` tooltips are slow to appear and unstyled. */}
      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-parchment opacity-0 shadow-[0_8px_20px_-8px_rgba(32,36,43,0.45)] transition-all duration-150 group-hover/nav:translate-x-0 group-hover/nav:opacity-100"
        >
          {item.label}
        </span>
      )}
    </div>
  )
}