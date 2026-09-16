// app/admin/login/page.tsx
"use client"

// Real staff login — replaces the previous `return <div>Admin login</div>`
// stub. Signs in with Supabase, then confirms via /api/admin/auth/me
// that this session actually belongs to an active staff_accounts row
// before letting them in — a valid Supabase password (a customer
// account, say) isn't enough on its own. On success, redirects into
// /admin; AdminDataProvider picks the real session back up from there
// (see its own "real session" effect) rather than this page needing to
// pass anything along explicitly.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!email.trim() || !password) return
    setSubmitting(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) {
      setSubmitting(false)
      setError("Incorrect email or password.")
      return
    }

    // A valid Supabase login isn't the same thing as a valid STAFF
    // login — this could be a customer account that happens to share
    // credentials the person tried. /api/admin/auth/me is the actual
    // staff check; sign back out immediately if it fails, so a
    // non-staff session never lingers just because sign-in itself
    // technically succeeded.
    const res = await fetch("/api/admin/auth/me")
    setSubmitting(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      await supabase.auth.signOut()
      setError(body.error ?? "This account isn't set up for admin access.")
      return
    }

    router.push("/admin/dashboard")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment px-4">
      <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-card p-8 shadow-lg">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={22} className="text-teal-deep" />
          <h1 className="font-display text-xl text-ink">WishDrop Admin</h1>
        </div>
        <p className="mt-2 text-sm text-ink/55">Sign in with your staff account.</p>

        <div className="mt-6 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-ink/50">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="name@wishdrop.lk"
              className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink/50">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !email.trim() || !password}
            className="rounded-lg bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  )
}