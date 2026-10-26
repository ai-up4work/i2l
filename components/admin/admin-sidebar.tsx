// components/admin/admin-sidebar.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

import {
  LayoutDashboard,
  ClipboardList,
  MessageCircle,
  Users,
  BookOpen,
  Images,
  HardDrive,
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
  Calculator,
  FileText,
  Lock,
  Megaphone,
  Ticket,
  Gift,
  BadgeCheck,
  Store,
} from "lucide-react"

import { useAdminSidebar } from "@/contexts/AdminSidebarContext"
import { useAdminData } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"
import { DASHBOARD_HREF } from "@/lib/admin/dashboard-routes"
import { ROLE_LABEL as ROLE_LABELS, RolePreviewPopover } from "@/components/admin/Rolepreviewmenu"
import Flag from "@/components/ui/Flag"
import AirmailStripe from "@/components/shared/AirmailStripe"

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
//
// COUNTRY SIGNAL: the Warehouse group's stages happen on two different
// sides of the pipeline — QC / QC Issues / Pack & label / Export bin are
// still physically at the India warehouse, Shipped / Delivered have
// already landed in Sri Lanka, and In transit is the gap between the
// two. `country` on a NavItem drives a colored left accent + background
// tint on that item's sidebar row (see COUNTRY_COLOR / getCountryStyle
// below) so it's visible at a glance which side of the border a stage's
// orders are on. This is purely a visual label on the nav item itself —
// it doesn't read any per-order data, so it doesn't change if a
// specific order is delayed crossing over; it just marks where the
// *stage* normally sits.

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
  /** Which side of the pipeline this stage physically happens in.
   * "IN" = still at the India warehouse, "SL" = arrived in Sri Lanka,
   * "both" = in transit between the two. Drives the sidebar's colored
   * left accent + background tint. Omit for anything outside the
   * India->Sri Lanka warehouse pipeline. */
  country?: "IN" | "SL" | "both"
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

// Stages where an order is finished, so there's nothing left to deliver
// and it shouldn't count toward the Orders badge. Typed as Set<string>
// so this compiles whether or not "Completed" is one of your stage
// values. If "completed" is tracked as a separate field instead of a
// stage, add that check next to FINISHED_STAGES in badgeCounts below.
const FINISHED_STAGES = new Set<string>(["Delivered", "Completed"])

function getTopItems(role: Role): NavItem[] {
  const items: NavItem[] = [
    { label: "Dashboard", href: DASHBOARD_HREF[role], icon: LayoutDashboard, roles: ["manager", "sales", "warehouse"] },
    { label: "Requests", href: "/admin/requests", icon: ClipboardList, roles: ["manager", "sales"] },
    { label: "Orders", href: "/admin/orders", icon: ClipboardList, roles: ["manager", "sales", "warehouse"] },
    { label: "Customer chat", href: "/admin/chat", icon: MessageCircle, roles: ["manager", "sales"] },
    { label: "WhatsApp verification", href: "/admin/whatsapp-verifications", icon: BadgeCheck, roles: ["manager", "sales"] },
    { label: "Quote calculator", href: "/admin/quote", icon: Calculator, roles: ["manager", "sales", "super_admin"] },
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
        // Products custom sellers add themselves in the seller portal —
        // app/admin/(protected)/(sales)/catalogues. BookOpen was already
        // imported for this and never used.
        { label: "Social Stores", href: "/admin/catalogues", icon: Images, roles: ["manager", "sales"] },
        { label: "Scrape health", href: "/admin/scrape-health", icon: ClipboardList, roles: ["super_admin"] },
      ],
    },
    {
      label: "Purchasing",
      items: [{ label: "Purchases", href: "/admin/purchases", icon: ShoppingCart, roles: ["manager", "sales"] }],
    },
    {
      label: "Warehouse",
      items: [
        { label: "Quality check", href: "/admin/qc", icon: CheckCircle2, roles: ["manager", "warehouse"], country: "IN" },
        { label: "QC Issues", href: "/admin/qc-issues", icon: AlertTriangle, roles: ["manager", "warehouse"], country: "IN" },
        { label: "Pack & label", href: "/admin/pack-label", icon: PackageCheck, roles: ["manager", "warehouse"], country: "IN" },
        { label: "Export bin", href: "/admin/export-bin", icon: Warehouse, roles: ["manager", "warehouse"], country: "IN" },
        { label: "In transit", href: "/admin/in-transit", icon: Truck, roles: ["manager", "warehouse"], country: "both" },
        { label: "Shipped", href: "/admin/shipped", icon: Send, roles: ["manager", "warehouse"], country: "SL" },
        { label: "Delivered", href: "/admin/delivered", icon: PartyPopper, roles: ["manager", "warehouse"], country: "SL" },
      ],
    },
    {
      label: "Manager",
      items: [
        { label: "Reports", href: "/admin/reports", icon: BarChart3, roles: ["manager"] },
        { label: "Staff", href: "/admin/staff", icon: UserCog, roles: ["manager"] },
        { label: "Broadcasts", href: "/admin/broadcasts", icon: Megaphone, roles: ["manager"] },
        { label: "Coupons", href: "/admin/coupons", icon: Ticket, roles: ["manager"] },
        { label: "Referrals", href: "/admin/referrals", icon: Gift, roles: ["manager"] },
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
        // Wishdrop's own store — run by the super admin. See
        // app/admin/(protected)/super-admin/wishdrop-mall/page.tsx.
        { label: "Wishdrop Mall", href: "/admin/super-admin/wishdrop-mall", icon: Store, roles: ["super_admin"] },
        { label: "Analytics", href: "/admin/super-admin/analytics", icon: LineChart, roles: ["super_admin"] },
        { label: "Audit log", href: "/admin/super-admin/audit-log", icon: History, roles: ["super_admin"] },
        { label: "Roles", href: "/admin/super-admin/roles", icon: ShieldCheck, roles: ["super_admin"], locked: true },
        { label: "All staff", href: "/admin/super-admin/staff", icon: Users, roles: ["super_admin"] },
        { label: "Warehouse Sites", href: "/admin/super-admin/warehouses", icon: Building2, roles: ["super_admin"] },
        { label: "Media cleanup", href: "/admin/super-admin/media-cleanup", icon: HardDrive, roles: ["super_admin"] },
        {
          // Every rate and fee the prices are built from — see
          // app/admin/(protected)/super-admin/settings/pricing-engine/page.tsx.
          label: "Pricing engine",
          href: "/admin/super-admin/settings/pricing-engine",
          icon: SlidersHorizontal,
          roles: ["super_admin"],
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

// Country is shown only as the small flag chip (same treatment the
// admin pages use for India / Sri Lanka) — the rows themselves stay on
// the shared palette. The old full-row flag-stripe backgrounds were the
// only place in the console painting raw saffron/green/maroon fills,
// which made the sidebar read as a different app from the pages beside it.

const COUNTRY_TITLE = {
  IN: "India",
  SL: "Sri Lanka",
  both: "In transit: India → Sri Lanka",
} as const

// Feeds the shared <Flag> component, which converts an emoji into a
// real flagcdn.com image (see components/ui/Flag.tsx) — sidesteps the
// Windows/Chrome-Edge issue where flag emoji silently render as plain
// "IN"/"SL" text instead of a flag, since there's no reliance on the
// OS's emoji font at all.
const COUNTRY_EMOJI = {
  IN: "🇮🇳",
  SL: "🇱🇰",
} as const

function CountryFlagIcon({ country, className }: { country: NavItem["country"]; className?: string }) {
  if (!country) return null
  if (country === "both") {
    return (
      <span className="inline-flex items-center gap-1">
        <Flag flag={COUNTRY_EMOJI.IN} className={className} />
        <span className="text-[9px] leading-none text-parchment/50">→</span>
        <Flag flag={COUNTRY_EMOJI.SL} className={className} />
      </span>
    )
  }
  return <Flag flag={COUNTRY_EMOJI[country]} className={className} />
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
    visibleShippedLines,
    requestLines,
    chatThreads,
  } = useAdminData()

  const topItems = getTopItems(role)

  // Waiting WhatsApp verification requests — not part of AdminDataContext,
  // so fetched here. Refreshes every minute, and immediately when the
  // verification page announces a decision.
  const [waPending, setWaPending] = useState(0)
  useEffect(() => {
    if (!["manager", "sales", "super_admin"].includes(role)) return
    const load = () =>
      fetch("/api/admin/whatsapp-verifications?countOnly=1", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setWaPending(d.pending ?? 0))
        .catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    window.addEventListener("wd:wa-verifications-changed", load)
    return () => {
      clearInterval(t)
      window.removeEventListener("wd:wa-verifications-changed", load)
    }
  }, [role])
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
  const badgeCounts = useMemo(() => {
    const counts: Record<string, number> = {}

    // Orders that are still in progress — i.e. NOT yet Delivered or
    // Completed (see FINISHED_STAGES). Once an order reaches either of
    // those there's nothing left to deliver, so it drops out of the
    // badge. Reads from visibleOrders, so it follows the same role/site
    // scoping as every other queue here.
    counts["/admin/orders"] = visibleOrders.filter((o) => !FINISHED_STAGES.has(o.stage)).length

    counts["/admin/requests"] = requestLines.filter(
      (r) => r.slaBreached || r.status === "sent_for_review"
    ).length

    counts["/admin/chat"] = chatThreads.filter((t) => t.unread).length

    counts["/admin/whatsapp-verifications"] = waPending

    counts["/admin/purchases"] = visiblePurchaseLines.filter((l) => l.status === "needs_purchase").length

    counts["/admin/qc"] = visibleQcLines.filter((l) => l.status === "pending").length
    counts["/admin/qc-issues"] = visibleQcLines.filter((l) => l.status === "flagged").length

    counts["/admin/pack-label"] = visiblePackLines.filter((l) => l.status === "awaiting_pack").length

    counts["/admin/export-bin"] = visibleExportBinLines.length

    counts["/admin/in-transit"] = visibleInTransitLines.filter((l) => l.deliveryStatus === "overdue").length

    // FIX: this key was missing entirely, so Shipped could never show a
    // badge no matter how much was sitting in the queue — every other
    // Warehouse-group stage has one, this one just got left out. Reuses
    // the same 48h threshold /admin/shipped's own ageTone() already
    // marks red/urgent with, rather than inventing a separate number.
    counts["/admin/shipped"] = visibleShippedLines.filter((l) => l.shippedAgeHours >= 48).length

    return counts
  }, [
    visibleOrders,
    requestLines,
    chatThreads,
    waPending,
    visiblePurchaseLines,
    visibleQcLines,
    visiblePackLines,
    visibleExportBinLines,
    visibleInTransitLines,
    visibleShippedLines,
  ])

  // Separate from badgeCounts above on purpose: those are backlog SIZES
  // (numeric — "how much is in this queue"), this is a "does
  // anything here need a reply" flag (gold, a dot, not a number) — see
  // Order.hasUnrepliedMessage / RequestLine.hasUnrepliedMessage and
  // data/Wishdrop-orders-requests-unreplied-flag.sql. The two are
  // independent: an order can have zero backlog concerns and still be
  // sitting on an unanswered customer message, or vice versa.
  const attentionFlags = useMemo(() => {
    const flags: Record<string, boolean> = {}
    flags["/admin/orders"] = visibleOrders.some((o) => o.hasUnrepliedMessage)
    flags["/admin/requests"] = requestLines.some((r) => r.hasUnrepliedMessage)
    // Customer chat's own unread signal already exists (chatThreads
    // .unread, feeding the count above) and is a superset of this
    // — every unreplied order/request message is also a thread-level
    // unread, so no separate dot is needed there.
    return flags
  }, [visibleOrders, requestLines])

  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-indigo font-body text-parchment shadow-[12px_0_28px_-20px_rgba(8,18,40,0.55)] transition-[width] duration-300 ease-out motion-reduce:transition-none ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      {!isMobile && (
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-7 z-10 grid h-6 w-6 place-items-center rounded-full border border-ink/10 bg-card text-ink/40 shadow-[0_2px_6px_rgba(32,36,43,0.14)] transition-all hover:text-teal-deep hover:shadow-[0_4px_12px_rgba(32,36,43,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
        >
          <ChevronsLeft
            size={13}
            className={`transition-transform duration-300 ease-out motion-reduce:transition-none ${collapsed ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {/* Same indigo rail + airmail stripe as the seller portal
          (app/seller/(dashboard)/layout.tsx), so both consoles read as one
          family. */}
      <AirmailStripe />
      <div className="flex h-[58px] flex-none items-center border-b border-parchment/10 px-4">
        {collapsed ? (
          <span className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-teal-deep font-display text-sm font-semibold leading-none text-parchment">
            <img src="/wishMall-transparent.png" alt="Wishdrop" className="h-10 w-auto object-contain rounded-lg" />
          </span>
        ) : (
          <Link href="/admin" className="flex min-w-0 items-center gap-2 px-1">
            <Image
              src="/wish-drop-logo-dark-bg.png"
              alt="Wishdrop"
              width={120}
              height={32}
              className="h-9 w-auto flex-none object-contain"
            />
            <span className="font-body text-xs font-medium text-parchment/50">admin</span>
          </Link>
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
              attention={attentionFlags[item.href]}
            />
          ))}
        </div>

        {groups.map((group, i) => (
          <div key={group.label} className={`${i === 0 ? "mt-5" : "mt-6"} ${!collapsed ? "" : "border-t border-parchment/10 pt-5"}`}>
            {!collapsed && (
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.01em] text-parchment/40">{group.label}</p>
            )}
            <div className="flex flex-col gap-1">
              {group.items.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  collapsed={collapsed}
                  count={badgeCounts[item.href]}
                  attention={attentionFlags[item.href]}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-none border-t border-parchment/10 px-3 py-3">
        <SidebarLink
          item={{ label: "Settings", href: "/admin/settings", icon: Settings, roles: ["manager", "sales", "warehouse"] }}
          active={isActive("/admin/settings")}
          collapsed={collapsed}
        />

        <RolePreviewPopover>
          <div
            className={`mt-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-parchment/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <span className="relative flex-none">
              <span className="block h-8 w-8 overflow-hidden rounded-full bg-parchment/10 ring-1 ring-parchment/20">
                <Image src="/default-avatar.png" alt="" width={32} height={32} className="h-full w-full object-cover" />
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-indigo" />
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-parchment">{currentUser.name}</span>
                  <span className="block truncate text-xs text-parchment/55">{ROLE_LABELS[role]}</span>
                </span>
                <ChevronsUpDown size={13} className="flex-none text-parchment/40" />
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
  attention,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
  count?: number
  /** A gold pulsing dot, separate from the numeric `count` pill/dot
   * above (which means "backlog size") — this means
   * "something in this list is waiting on a reply" specifically. See
   * badgeCounts' sibling `attentionFlags` below. The two can be true at
   * once, so they're rendered at different corners/positions rather
   * than sharing one. */
  attention?: boolean
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
          className={`relative flex cursor-not-allowed items-center gap-3 rounded-xl py-2.5 pr-3 text-sm font-medium text-parchment/30 ${
            collapsed ? "justify-center pl-3" : "pl-3.5"
          }`}
        >
          <Icon size={18} strokeWidth={1.75} />
          {!collapsed && <span className="truncate flex-1">{item.label}</span>}
          {!collapsed && <Lock size={13} strokeWidth={2} className="flex-none text-parchment/25" />}
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
        title={item.country ? COUNTRY_TITLE[item.country] : undefined}
        className={`relative flex items-center gap-3 rounded-xl py-2.5 pr-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${
          collapsed ? "justify-center pl-3" : "pl-3.5"
        } ${
          active
            ? "bg-parchment/12 text-parchment"
            : "text-parchment/65 hover:bg-parchment/5 hover:text-parchment"
        }`}
      >
        <span className="relative flex-none">
          <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
          {/* Collapsed: country flag badges the icon corner when this
              row has one (real flagcdn image via CountryFlagIcon, so it
              renders correctly even on Windows); otherwise the plain
              unread dot shows instead — the two never both apply since
              a country row's own background already signals activity. */}
          {collapsed && item.country && (
            <span className="absolute -right-1.5 -top-1.5 overflow-hidden rounded-[2px] shadow-sm ring-1 ring-indigo">
              <CountryFlagIcon country={item.country === "both" ? "IN" : item.country} className="h-2 w-3 object-cover" />
            </span>
          )}
          {collapsed && !item.country && hasSignal && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-parchment ring-2 ring-indigo" />
          )}
          {collapsed && attention && (
            <span className="absolute -left-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-gold ring-2 ring-indigo" />
          )}
        </span>
        {!collapsed && <span className="truncate flex-1">{item.label}</span>}
        {/* Expanded: the literal flag(s), rendered as real images via
            the shared Flag component — sits before the count pill so
            neither crowds out the label truncation. This chip is the
            only country signal on the row. */}
        {!collapsed && item.country && (
          <span className="flex-none">
            <CountryFlagIcon country={item.country} className="h-2.5 w-4 rounded-[1px] object-cover shadow-sm" />
          </span>
        )}
        {/* Expanded: a small pulsing dot before the count pill — same
            "needs a reply" signal as the collapsed corner dot above. */}
        {!collapsed && attention && (
          <span
            title="Something here is waiting on a reply"
            className="ml-auto h-2 w-2 flex-none animate-pulse rounded-full bg-gold"
          />
        )}
        {/* Expanded: a count pill, right-aligned. Capped at "99+" so a
            very large backlog doesn't blow out the row width. */}
        {!collapsed && hasSignal && (
          <span
            className={`ml-auto flex-none rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
              active ? "bg-gold text-indigo" : "bg-parchment/15 text-parchment"
            }`}
          >
            {count! > 99 ? "99+" : count}
          </span>
        )}
      </Link>

      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-parchment opacity-0 shadow-[0_8px_20px_-8px_rgba(32,36,43,0.45)] transition-all duration-150 group-hover/nav:translate-x-0 group-hover/nav:opacity-100"
        >
          {item.label}
          {item.country ? ` · ${COUNTRY_TITLE[item.country]}` : ""}
          {hasSignal ? ` · ${count! > 99 ? "99+" : count}` : ""}
        </span>
      )}
    </div>
  )
}