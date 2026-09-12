// contexts/AdminSidebarContext.tsx
"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

interface AdminSidebarContextValue {
  collapsed: boolean
  toggle: () => void
  isMobile: boolean
}

const AdminSidebarContext = createContext<AdminSidebarContextValue | undefined>(undefined)

const MOBILE_BREAKPOINT_PX = 768

export function AdminSidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Mobile is always forced closed (per admin-sidebar.tsx's own comment:
  // "nothing for the user to toggle" there), so the layout and the
  // sidebar can't drift out of sync on resize.
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT_PX
      setIsMobile(mobile)
      if (mobile) setCollapsed(true)
    }
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  const toggle = () => {
    if (isMobile) return // no toggle control is rendered on mobile anyway
    setCollapsed((c) => !c)
  }

  return (
    <AdminSidebarContext.Provider value={{ collapsed, toggle, isMobile }}>
      {children}
    </AdminSidebarContext.Provider>
  )
}

export function useAdminSidebar() {
  const ctx = useContext(AdminSidebarContext)
  if (!ctx) throw new Error("useAdminSidebar must be used within AdminSidebarProvider")
  return ctx
}