"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"

type AdminSidebarContextValue = {
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  toggle: () => void
  isMobile: boolean
}

const AdminSidebarContext = createContext<AdminSidebarContextValue | null>(null)
const MOBILE_BREAKPOINT = 768 // matches Tailwind's `md`

export function AdminSidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)

    const applyMatch = (matches: boolean) => {
      setIsMobile(matches)
      if (matches) setCollapsedState(true) // mobile is always closed
    }

    applyMatch(mql.matches)
    const listener = (e: MediaQueryListEvent) => applyMatch(e.matches)
    mql.addEventListener("change", listener)
    return () => mql.removeEventListener("change", listener)
  }, [])

  const setCollapsed = useCallback(
    (value: boolean) => {
      if (isMobile) return // no manual override on mobile
      setCollapsedState(value)
    },
    [isMobile]
  )

  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed])

  return (
    <AdminSidebarContext.Provider value={{ collapsed, setCollapsed, toggle, isMobile }}>
      {children}
    </AdminSidebarContext.Provider>
  )
}

export function useAdminSidebar() {
  const ctx = useContext(AdminSidebarContext)
  if (!ctx) throw new Error("useAdminSidebar must be used within an AdminSidebarProvider")
  return ctx
}