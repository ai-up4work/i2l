// app/admin/register/page.tsx
"use client"

// Public — no session required, same reasoning as /admin/login. Creates
// a real Supabase Auth account immediately (see /api/admin/register),
// but the resulting staff_accounts row starts as status='pending' with
// no role, so signing in right after registering still won't get past
// /api/admin/auth/me until a Manager or Super Admin approves the
// request (see that route and middleware.ts's getStaffRole). This is
// deliberately not a "you're in" flow — it's a request.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, UserCog, ShoppingBag, Warehouse, Crown } from "lucide-react"

type RequestedRole = "manager" | "sales" | "warehouse" | "super_admin"

const ROLE_OPTIONS: { role: RequestedRole; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { role: "sales", label: "Sales & Purchase", icon: ShoppingBag },
  { role: "warehouse", label: "Warehouse", icon: Warehouse },
  { role: "manager", label: "Manager", icon: UserCog },
  { role: "super_admin", label: "Super Admin", icon: Crown },
]

const MIN_PASSWORD_LENGTH = 8

export default function AdminRegisterPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("sales")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const canSubmit =
    name.trim() && email.trim() && password.length >= MIN_PASSWORD_LENGTH && password === confirmPassword

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/admin/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, requestedRole }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "Couldn't submit your request.")
        setSubmitting(false)
        return
      }
      setSubmitted(true)
    } catch {
      setError("Couldn't reach the server. Try again.")
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-parchment px-4">
        <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-card p-8 text-center shadow-lg">
          <div className="flex items-center justify-center gap-2.5">
            <ShieldCheck size={22} className="text-teal-deep" />
            <h1 className="font-display text-xl text-ink">WishDrop Admin</h1>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ink/60">
            Your request has been sent. A Manager or Super Admin needs to review and approve it before you can
            sign in — you'll be able to sign in with the password you just set as soon as that happens.
          </p>
          <button
            type="button"
            onClick={() => router.push("/admin/login")}
            className="mt-6 w-full rounded-xl bg-teal-deep px-4 py-3 text-sm font-semibold text-white hover:bg-teal-deep/90"
          >
            Go to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-card p-8 shadow-lg">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={22} className="text-teal-deep" />
          <h1 className="font-display text-xl text-ink">WishDrop Admin</h1>
        </div>
        <p className="mt-2 text-sm text-ink/55">Request staff access. A Manager or Super Admin approves every request.</p>

        <div className="mt-6 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-ink/50">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink/50">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@wishdrop.shop"
              className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink/50">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink/50">Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="mt-1 text-xs text-red-600">Passwords don't match.</p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-ink/50">Role you're requesting</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map(({ role, label, icon: Icon }) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRequestedRole(role)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                    requestedRole === role
                      ? "border-teal-deep bg-teal-deep/10 text-teal-deep"
                      : "border-ink/15 bg-white text-ink/60 hover:border-ink/25"
                  }`}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink/40">
              This is a request, not a grant — whoever approves you chooses the role you actually get.
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="rounded-lg bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
          >
            {submitting ? "Submitting…" : "Request access"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/admin/login")}
            className="text-xs font-semibold text-ink/50 hover:text-ink/80"
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  )
}
