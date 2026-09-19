// app/admin/invite/page.tsx
"use client"

// ROOT CAUSE of "This invite link is invalid or has already been used"
// / otp_expired showing up even on a staff member's very first tap:
//
// The actual invite/recovery link Supabase generates (generateLink's
// action_link) is a ONE-TIME-USE URL — the first request that hits it
// consumes the token, whoever or whatever made that request. Sharing
// that raw link as plain text — over WhatsApp, email, Slack, iMessage,
// anywhere — runs straight into the fact that most of those clients
// auto-fetch a URL the moment a message is sent or opened, purely to
// build a link-preview card (title/thumbnail). That fetch hits
// Supabase's own /auth/v1/verify endpoint and burns the one-time token
// before the staff member ever taps it themselves. From their side it
// looks like their first click failed instantly; it's actually their
// first click landing on an already-dead link.
//
// FIX: never expose the real Supabase link directly. This page is a
// same-domain landing page that takes the real link as its own `to`
// query param and does NOT follow it automatically — it only navigates
// there on an actual button click (a real user gesture), which a
// preview-crawler's background GET can never produce. A crawler fetching
// THIS url just renders inert HTML; the real Supabase link is only ever
// requested when a human presses the button.
//
// Public per middleware.ts's ADMIN_PUBLIC_PATHS — same reasoning as
// /admin/set-password: whoever's here has no staff session yet, just an
// invite token.

import { useEffect, useState } from "react"
import { ShieldCheck } from "lucide-react"

export default function InviteLandingPage() {
  const [target, setTarget] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    const to = new URLSearchParams(window.location.search).get("to")
    if (!to) {
      setMissing(true)
      return
    }
    try {
      setTarget(decodeURIComponent(to))
    } catch {
      setMissing(true)
    }
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment px-4">
      <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-card p-8 text-center shadow-lg">
        <div className="flex items-center justify-center gap-2.5">
          <ShieldCheck size={22} className="text-teal-deep" />
          <h1 className="font-display text-xl text-ink">WishDrop Admin</h1>
        </div>

        {missing ? (
          <div className="mt-6">
            <p className="text-sm text-ink/70">
              This invite link is missing its token. Ask whoever invited you to send a new one.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-ink/60">
              You've been invited to the WishDrop admin team. Tap below to set your password and sign in.
            </p>
            <button
              type="button"
              disabled={!target}
              onClick={() => {
                if (target) window.location.href = target
              }}
              className="mt-6 w-full rounded-xl bg-teal-deep px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continue to set your password
            </button>
            <p className="mt-4 text-xs text-ink/40">
              This link only works once — if it doesn't work, ask whoever invited you to resend it rather than
              opening it again.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
