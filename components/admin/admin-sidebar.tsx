// components/admin/admin-sidebar.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image"

import {
  Menu,
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
  ChevronLeft,
} from "lucide-react"

// Static sidebar nav — layout only, no auth/role logic wired up yet.
// TODO: active-section logic beyond pathname match, real user in footer row.
//
// Light parchment surface (matches the rest of /admin) rather than a dark
// panel — the WishDrop wordmark has a solid white background and dark
// navy lettering, so it only reads cleanly on a light surface anyway.

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TOP_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Orders", href: "/admin/orders", icon: ClipboardList },
  { label: "Requests", href: "/admin/requests", icon: ClipboardList },
  { label: "Customer Chat", href: "/admin/chat", icon: MessageCircle },
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
      { label: "Quality Check", href: "/admin/quality-check", icon: CheckCircle2 },
      { label: "Pack & Label", href: "/admin/pack-label", icon: PackageCheck },
      { label: "Export Bin", href: "/admin/export-bin", icon: Warehouse },
      { label: "In Transit", href: "/admin/in-transit", icon: Truck },
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
      className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-ink/10 bg-card font-body text-ink shadow-[8px_0_30px_-20px_rgba(32,36,43,0.25)] transition-all duration-200 ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      {/* Brand + collapse toggle */}
      <div className="flex h-16 flex-none items-center gap-3 border-b border-ink/[0.06] px-4">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="grid h-8 w-8 flex-none place-items-center rounded-lg text-ink/50 transition-colors hover:bg-ink/[0.06] hover:text-ink"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
        </button>
        {!collapsed && (
          <Image
            src="/wish-drop-logo.png"
            alt="WishDrop"
            width={120}
            height={32}
            className="h-10 w-auto object-contain"
          />
        )}
      </div>

      {/* Nav */}
      <nav className="nav-scroll flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-1">
          {TOP_ITEMS.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>

        {GROUPS.map((group) => (
          <div key={group.label} className="mt-6">
            {!collapsed && (
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink/35">
                {group.label}
              </p>
            )}
            <div className="flex flex-col gap-1">
              {group.items.map((item) => (
                <SidebarLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Settings + profile, pinned to bottom */}
      <div className="flex-none border-t border-ink/[0.06] px-3 py-3">
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
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
        collapsed ? "justify-center" : ""
      } ${
        active
          ? "bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25"
          : "text-ink/55 hover:bg-ink/[0.05] hover:text-ink"
      }`}
    >
      <Icon size={18} className="flex-none" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}