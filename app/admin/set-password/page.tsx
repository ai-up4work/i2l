// app/admin/set-password/page.tsx
//
// Where every invite/recovery link (from the staff invite route and
// the resend-invite route above) lands. Establishes a session from the
// link's token, then lets the person set a password and continues into
// /admin/dashboard — mirrors the login page's styling and redirect
// pattern.
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type Status = "verifying" | "ready" | "invalid" | "submitting" | "done"

export default function SetPasswordPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("verifying")
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")

  useEffect(() => {
    const supabase = createClient()

    async function establishSession() {
      const url = new URL(window.location.href)
      const code = url.searchParams.get("code")

      // Current default (PKCE): ?code=... needs exchanging for a session.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setError("This link has expired or was already used.")
          setStatus("invalid")
          return
        }
        setStatus("ready")
        return
      }

      // Older/implicit flow: #access_token=...&refresh_token=...
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""))
      const accessToken = hash.get("access_token")
      const refreshToken = hash.get("refresh_token")
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          setError("This link has expired or was already used.")
          setStatus("invalid")
          return
        }
        setStatus("ready")
        return
      }

      // No token present, or the person just navigated here directly.
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        setStatus("ready")
      } else {
        setError("This link is invalid, expired, or was already used. Ask an admin to resend your invite.")
        setStatus("invalid")
      }
    }

    establishSession()
  }, [])

  const handleSubmit = async () => {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }

    setStatus("submitting")
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setStatus("ready")
      return
    }

    setStatus("done")
    router.push("/admin/dashboard")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment px-4">
      <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-card p-8 shadow-lg">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={22} className="text-teal-deep" />
          <h1 className="font-display text-xl text-ink">Set your password</h1>
        </div>

        {status === "verifying" && (
          <div className="mt-8 flex items-center gap-2 text-sm text-ink/55">
            <Loader2 size={16} className="animate-spin" /> Verifying your invite…
          </div>
        )}

        {status === "invalid" && (
          <p className="mt-6 rounded-lg bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
            {error}
          </p>
        )}

        {(status === "ready" || status === "submitting") && (
          <div className="mt-6 flex flex-col gap-4">
            <p className="text-sm text-ink/55">Choose a password to finish setting up your staff account.</p>
            <div>
              <label className="text-xs font-semibold text-ink/50">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink/50">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              disabled={status === "submitting" || !password || !confirm}
              className="rounded-lg bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
            >
              {status === "submitting" ? "Setting password…" : "Set password & continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}