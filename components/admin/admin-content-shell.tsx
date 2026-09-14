// components/admin/admin-content-shell.tsx
"use client"

import type { ReactNode } from "react"
import { useAdminSidebar } from "@/contexts/AdminSidebarContext"

export function AdminContentShell({ children }: { children: ReactNode }) {
  const { collapsed } = useAdminSidebar()

  return (
    <div
      className={`flex h-screen flex-col overflow-hidden transition-[margin-left] duration-300 ease-out motion-reduce:transition-none ${
        collapsed ? "ml-[76px]" : "ml-64"
      }`}
    >
      {children}
    </div>
  )
}