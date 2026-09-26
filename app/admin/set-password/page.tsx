// app/admin/set-password/page.tsx
"use client"

// Lands here from the invite email Supabase sends when
// /api/admin/staff (POST) calls auth.admin.inviteUserByEmail with
// redirectTo pointing here (see that route's own comment). Public per
// middleware.ts's ADMIN_PUBLIC_PATHS (exact match only — everything
// this page needs happens on this one path, so there's no second
// route to also allowlist), since the person clicking the link has no
// staff session yet, just Supabase's one-time invite token in the URL.
//
// Supabase's invite link can redirect back in one of two shapes
// depending on the project's auth settings — a `?code=...` (PKCE,
// exchanged via exchangeCodeForSession) or `#access_token=...` in the
// hash (the browser client's default detectSessionInUrl already
// consumes that on its own during createClient()). Handling both here
// rather than assuming one, since which shape actually shows up isn't
// something this app's code controls.
//
// After a session exists, one more check via /api/admin/auth/me — same
// route /admin/login already uses — confirms this is genuinely an
// active staff_accounts row (it always should be, since the invite and
// the roster row are only ever created together — see the staff route's
// own comment — but this keeps the same "a valid Supabase session isn't
// automatically a valid STAFF session" discipline that page already
// applies, rather than skipping it just because this session came from
// an invite instead of a password).

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type Stage = "verifying" | "ready" | "invalid" | "success"

const MIN_PASSWORD_LENGTH = 8

export default function SetPasswordPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>("verifying")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()

      // PKCE shape: ?code=... in the query string. The hash shape
      // (#access_token=...) needs no explicit handling — createClient()
      // above already consumed it during initialization if present.
      const code = new URLSearchParams(window.location.search).get("code")
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          if (!cancelled) setStage("invalid")
          return
        }
        // Clean the code out of the URL so a refresh doesn't try to
        // redeem an already-used one-time code a second time.
        window.history.replaceState({}, "", window.location.pathname)
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        if (!cancelled) setStage("invalid")
        return
      }

      // Confirm this session actually belongs to an active staff
      // account, same discipline /admin/login applies to a password
      // sign-in — see the file-level doc comment above.
      const res = await fetch("/api/admin/auth/me")
      if (cancelled) return
      if (!res.ok) {
        await supabase.auth.signOut()
        setStage("invalid")
        return
      }

      setStage("ready")
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && password === confirmPassword

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    setStage("success")
    // Already holds a real session at this point (that's how we got to
    // the "ready" stage at all) — straight into the dashboard rather
    // than bouncing through /admin/login and asking them to type the
    // password they just set a second time.
    router.push("/admin/dashboard")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment px-4">
      <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-card p-8 shadow-lg">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={22} className="text-teal-deep" />
          <h1 className="font-display text-xl text-ink">Wishdrop Admin</h1>
        </div>

        {stage === "verifying" && (
          <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 size={20} className="animate-spin text-teal-deep" />
            <p className="text-sm text-ink/55">Verifying your invite…</p>
          </div>
        )}

        {stage === "invalid" && (
          <div className="mt-6">
            <p className="text-sm text-ink/70">
              This invite link is invalid or has already been used. Ask whoever invited you to send a new one.
            </p>
            <button
              type="button"
              onClick={() => router.push("/admin/login")}
              className="mt-4 text-sm font-semibold text-teal-deep hover:underline"
            >
              Go to sign in
            </button>
          </div>
        )}

        {stage === "ready" && (
          <>
            <p className="mt-2 text-sm text-ink/55">Set a password for your staff account.</p>

            <div className="mt-6 flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-ink/50">New password</label>
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
                  <p className="mt-1.5 text-xs text-red-700">Passwords don&apos;t match.</p>
                )}
                {password && password.length < MIN_PASSWORD_LENGTH && (
                  <p className="mt-1.5 text-xs text-ink/40">
                    At least {MIN_PASSWORD_LENGTH} characters.
                  </p>
                )}
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
                className="rounded-lg bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
              >
                {submitting ? "Setting password…" : "Set password & continue"}
              </button>
            </div>
          </>
        )}

        {stage === "success" && (
          <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 size={20} className="animate-spin text-teal-deep" />
            <p className="text-sm text-ink/55">Password set — taking you to your dashboard…</p>
          </div>
        )}
      </div>
    </div>
  )
}