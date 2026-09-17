// components/admin/RolePreviewMenu.tsx
//
// super_admin-only "view the console as a different role" — see
// AdminDataContext.tsx's previewRole doc comment for what this does and
// doesn't affect (currentUser/identity never changes, only which
// role's permissions/nav/dashboard renders). Used in two places: the
// sidebar's bottom profile button (RolePreviewPopover, opens on click)
// and the Settings page (RolePreviewOptions, shown inline, no popover
// chrome needed there).
"use client"

import { useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
import { useAdminData } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"

export const ROLE_LABEL: Record<Role, string> = {
  manager: "Manager",
  sales: "Sales & Purchase",
  warehouse: "Warehouse",
  super_admin: "Super Admin",
}

const ALL_ROLES: Role[] = ["manager", "sales", "warehouse", "super_admin"]

/** The list of role buttons itself, with no popover/positioning — drop
 * this inline anywhere (e.g. the Settings page). Renders nothing for
 * anyone who isn't actually super_admin; there's nothing to preview
 * for a role that doesn't already have full access. */
export function RolePreviewOptions({ onSelect }: { onSelect?: () => void }) {
  const { currentUser, role, previewRole, setPreviewRole } = useAdminData()
  if (currentUser.role !== "super_admin") return null

  return (
    <div className="flex flex-col gap-1">
      {ALL_ROLES.map((r) => {
        const isActive = role === r
        const isReal = currentUser.role === r
        return (
          <button
            key={r}
            type="button"
            onClick={() => {
              // Picking your own real role again just clears the
              // preview rather than setting previewRole to itself —
              // same outcome (role === currentUser.role either way),
              // simpler state to reason about.
              setPreviewRole(isReal ? null : r)
              onSelect?.()
            }}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              isActive ? "bg-teal/10 font-semibold text-teal-deep" : "text-ink/70 hover:bg-ink/[0.04]"
            }`}
          >
            <span>
              {ROLE_LABEL[r]}
              {isReal && <span className="ml-1.5 text-xs font-normal text-ink/35">(you)</span>}
            </span>
            {isActive && <Check size={14} />}
          </button>
        )
      })}
      {previewRole && (
        <p className="mt-1 px-3 text-xs text-ink/40">
          Previewing as {ROLE_LABEL[previewRole]} — you&apos;re still signed in as {currentUser.name}.
        </p>
      )}
    </div>
  )
}

/** The sidebar's version — wraps the trigger button (passed as
 * children) with a small upward-opening popover, since this sits at
 * the very bottom of the sidebar. Renders `children` completely
 * un-wrapped (no button behavior added) for anyone who isn't
 * super_admin — the profile row still shows, it just isn't clickable
 * into anything, since there's nothing for them to preview. */
export function RolePreviewPopover({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAdminData()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [open])

  if (currentUser.role !== "super_admin") {
    return <>{children}</>
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="block w-full text-left">
        {children}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-xl border border-ink/10 bg-card p-2 shadow-[0_8px_24px_-8px_rgba(32,36,43,0.25)]">
          <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink/35">
            View console as
          </p>
          <RolePreviewOptions onSelect={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}