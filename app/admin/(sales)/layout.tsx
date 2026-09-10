// app/admin/layout.tsx
import type { ReactNode } from 'react'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

// TODO: role/auth guard for Sales & Purchase Executive
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="min-w-0 flex-1 pl-64">{children}</div>
    </div>
  )
}