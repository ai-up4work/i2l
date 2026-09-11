// components/admin/admin-sidebar.tsx
"use client"

import { useState } from "react"
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
} from "lucide-react"

// Static sidebar nav — layout only, no auth/role logic wired up yet.
// TODO: active-section logic beyond pathname match, real user in footer row.
//
// Solid parchment-tinted surface, not glass — this panel sits beside flat
// content all day, so it reads as a fixed instrument panel rather than a
// floating card. Active state is a left accent bar + tint, the same idiom
// used for seller-row status in /admin/sellers, so "this is the active
// one" means the same thing everywhere in the product.

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TOP_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Orders", href: "/admin/orders", icon: ClipboardList },
  { label: "Requests", href: "/admin/requests", icon: ClipboardList },
  { label: "Customer chat", href: "/admin/chat", icon: MessageCircle },
]

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Sourcing",
    items: [
      { label: "Sellers", href: "/admin/sellers", icon: Users },
      { label: "Catalogues", href: "/admin/catalogues", icon: BookOpen },
      { label: "Collections", href: "/admin/collections", icon: Layers },
      { label: "Discounts", href: "/admin/discounts", icon: Percent },
    ],
  },
  {
    label: "Purchasing",
    items: [{ label: "Purchases", href: "/admin/purchases", icon: ShoppingCart }],
  },
  {
    label: "Warehouse",
    items: [
      { label: "Quality check", href: "/admin/quality-check", icon: CheckCircle2 },
      { label: "Pack & label", href: "/admin/pack-label", icon: PackageCheck },
      { label: "Export bin", href: "/admin/export-bin", icon: Warehouse },
      { label: "In transit", href: "/admin/in-transit", icon: Truck },
      { label: "Shipped", href: "/admin/shipped", icon: Send },
    ],
  },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href)

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-ink/10 bg-card font-body text-ink transition-[width] duration-200 ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      {/* Brand + collapse toggle */}
      <div className="flex h-16 flex-none items-center justify-between gap-3 border-b border-ink/10 px-4">
        {!collapsed ? (
          <Image
            src="/wish-drop-logo.png"
            alt="WishDrop"
            width={120}
            height={32}
            className="h-9 w-auto object-contain"
          />
        ) : (
          <span className="mx-auto h-2 w-2 rounded-full bg-teal-deep" />
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
            className="grid h-7 w-7 flex-none place-items-center rounded-lg text-ink/35 transition-colors hover:bg-ink/[0.05] hover:text-ink"
          >
            <ChevronsLeft size={15} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          className="mx-auto mt-2 grid h-7 w-7 flex-none place-items-center rounded-lg text-ink/35 transition-colors hover:bg-ink/[0.05] hover:text-ink"
        >
          <ChevronsLeft size={15} className="rotate-180" />
        </button>
      )}

      {/* Nav */}
      <nav className="nav-scroll flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-0.5">
          {TOP_ITEMS.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>

        {GROUPS.map((group) => (
          <div key={group.label} className="mt-6">
            {!collapsed && (
              <p className="px-3 pb-1.5 text-xs font-semibold text-ink/35">{group.label}</p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <SidebarLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Settings + profile, pinned to bottom */}
      <div className="flex-none border-t border-ink/10 px-3 py-3">
        <SidebarLink
          item={{ label: "Settings", href: "/admin/settings", icon: Settings }}
          active={isActive("/admin/settings")}
          collapsed={collapsed}
        />

        <div className={`mt-2 flex items-center gap-2.5 rounded-xl px-3 py-2 ${collapsed ? "justify-center" : ""}`}>
          <div className="h-8 w-8 flex-none overflow-hidden rounded-full bg-teal-deep">
            <Image
              src="/default-avatar.png"
              alt="Manager"
              width={32}
              height={32}
              className="h-full w-full object-cover"
            />
          </div>
          {!collapsed && <span className="truncate text-sm font-semibold text-ink/80">Manager</span>}
        </div>
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
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={`relative flex items-center gap-3 rounded-lg py-2 pr-3 text-sm font-medium transition-colors before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:content-[''] ${
        collapsed ? "justify-center pl-3" : "pl-3.5"
      } ${
        active
          ? "bg-teal/[0.08] text-teal-deep before:bg-teal-deep"
          : "text-ink/55 before:bg-transparent hover:bg-ink/[0.04] hover:text-ink"
      }`}
    >
      <Icon size={18} className="flex-none" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}