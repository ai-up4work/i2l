'use client'

// components/pwa/PushOptIn.tsx
//
// A slim prompt asking to turn on notifications for replies. Shown on the
// customer's Messages page — the moment the value is obvious ("tell me
// when they answer"), instead of an out-of-context permission popup.
//
// Hidden when: already on, blocked, unsupported, push not configured, or
// dismissed in the last 14 days. On iPhone/iPad outside the Home Screen
// app it explains that installing comes first (iOS only allows push there).

import { useEffect, useRef, useState } from 'react'
import { BellRing, Check, X } from 'lucide-react'
import { usePushNotifications } from '@/lib/pwa/push'
import InstallInstructions from './InstallInstructions'

const DISMISS_KEY = 'wd-push-optin-dismissed-at'
const DISMISS_DAYS = 14

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0)
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}

export default function PushOptIn({ className = '' }: { className?: string }) {
  const { status, busy, error, enable } = usePushNotifications()
  const [dismissed, setDismissed] = useState(true)
  const [justEnabled, setJustEnabled] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const requested = useRef(false)

  useEffect(() => setDismissed(recentlyDismissed()), [])

  // Flip to the confirmation only when THIS prompt turned it on.
  useEffect(() => {
    if (requested.current && status === 'on') {
      requested.current = false
      setJustEnabled(true)
    }
  }, [status])

  // Show a short confirmation after turning on, then get out of the way.
  useEffect(() => {
    if (!justEnabled) return
    const t = setTimeout(() => setJustEnabled(false), 4000)
    return () => clearTimeout(t)
  }, [justEnabled])

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {}
    setDismissed(true)
  }

  if (justEnabled) {
    return (
      <div
        role="status"
        className={`flex items-center gap-2 rounded-xl bg-teal/10 px-4 py-3 font-body text-sm font-semibold text-teal-deep ${className}`}
      >
        <Check size={16} strokeWidth={2.4} aria-hidden="true" />
        Notifications are on. We&rsquo;ll let you know when we reply.
      </div>
    )
  }

  if (dismissed || (status !== 'off' && status !== 'needs-install')) return null

  const needsInstall = status === 'needs-install'

  return (
    <>
      <div
        className={`flex items-start gap-3 rounded-xl border border-teal/20 bg-teal/[0.06] px-4 py-3 font-body ${className}`}
      >
        <BellRing size={18} className="mt-0.5 flex-none text-teal-deep" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Get notified when we reply</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink/60">
            {needsInstall
              ? 'On iPhone, notifications work once Wishdrop is on your Home Screen.'
              : 'We’ll send a notification to this device, even when Wishdrop is closed.'}
          </p>
          {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
        </div>
        <div className="flex flex-none items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (needsInstall) return setGuideOpen(true)
              requested.current = true
              await enable()
            }}
            className="rounded-lg bg-teal-deep px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-60"
          >
            {needsInstall ? 'Show me how' : busy ? 'Turning on…' : 'Turn on'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Not now"
            className="rounded-lg p-1.5 text-ink/40 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-teal"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <InstallInstructions open={guideOpen} platform="ios" onClose={() => setGuideOpen(false)} />
    </>
  )
}
