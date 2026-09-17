// app/admin/layout.tsx
//
// Deliberately bare. This used to hold the sidebar/header shell
// (AdminDataProvider, AdminSidebar, the RoleSwitcher header bar) — but
// that wrapped every route under /admin, including /admin/login and
// /admin/set-password, which don't have a signed-in staff session yet
// and shouldn't render staff-only chrome (order/request notification
// badges, "Preview as Manager", the full nav) behind their login form.
//
// The real shell now lives in app/admin/(protected)/layout.tsx, which
// only wraps the actual console pages. middleware.ts is what actually
// keeps unauthenticated/non-staff requests out of that group; this
// file just makes sure the pages outside it (login, set-password)
// don't inherit chrome meant for an already-authenticated admin.
import type { ReactNode } from 'react'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}