// components/admin/AdminSignOutButton.tsx
"use client"

// There was no way to sign out of the admin panel anywhere before this
// — not the header, not the sidebar's bottom profile row, nowhere. A
// staff member had no choice but to clear cookies by hand to end their
// session. Admin auth is just a plain Supabase session (no separate
// staff token system — see /api/admin/auth/me), so signing out is the
// same supabase.auth.signOut() every other part of the app uses; this
// just needed a real button wired to it.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export function AdminSignOutButton() {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/admin/login")
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      title="Sign out"
      aria-label="Sign out"
      className="flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white px-3 py-2 text-xs font-semibold text-ink/60 transition-colors hover:border-red-600/25 hover:bg-red-600/5 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <LogOut size={13} />
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  )
}