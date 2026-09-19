// lib/admin/dashboard-routes.ts
//
// Single source of truth for "which page is THIS role's own dashboard",
// used by both components/admin/admin-sidebar.tsx (the sidebar's
// "Dashboard" link) and middleware.ts (redirecting a staff member back
// to their own dashboard when they try to reach a page above their
// level). Previously only existed inside admin-sidebar.tsx, which
// middleware.ts couldn't import from without pulling in a 'use client'
// component — kept here instead as a plain, framework-agnostic map so
// both sides read the exact same routes and can't drift apart.
import type { Role } from '@/types/admin'

export const DASHBOARD_HREF: Record<Role, string> = {
  manager: '/admin/manager-dashboard',
  sales: '/admin/sales-dashboard',
  warehouse: '/admin/warehouse-dashboard',
  // Back to reusing manager-dashboard for now, by request — a dedicated
  // page (app/admin/(protected)/super-admin/page.tsx) still exists and
  // is still correctly gated (role === "super_admin"), just not the
  // default landing anymore; swap this back to '/admin/super-admin'
  // whenever that page is ready to replace this.
  //
  // This is safe now in a way it wasn't before: manager-dashboard's own
  // guard used to be `if (role !== "manager") redirect`, which bounced
  // a real super_admin straight back to /admin/dashboard, which sent
  // them right back here — an actual infinite loop. That guard (and
  // every other Manager-only page's) now reads
  // `role !== "manager" && role !== "super_admin"`, so super_admin
  // passes through cleanly. Don't point this back at manager-dashboard
  // without that fix still in place, or the loop comes back.
  super_admin: '/admin/super-admin',
}