// app/admin/(protected)/super-admin/layout.tsx
//
// Bare passthrough, same as the sibling (manager)/(sales)/(warehouse)
// layouts — the actual role check (must be role === 'super_admin', on
// top of the normal /admin/** "must be some active staff member"
// check) lives in middleware.ts, which runs before any page under this
// folder renders. This file exists mainly so a reader browsing the
// folder tree sees the same layout.tsx-per-section pattern as every
// other role area, and so there's an obvious place to add real
// super-admin-only chrome later (e.g. a "Super Admin" banner) without
// having to first figure out where the gating happens.
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}