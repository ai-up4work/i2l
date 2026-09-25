'use client'

// components/pwa/InstallPrompt.tsx
//
// A small, dismissible "add to home screen" card.
//
// - Chrome/Edge/Samsung (Android + desktop): captures the browser's
//   `beforeinstallprompt` event and shows our own card with an Install
//   button that triggers the native dialog.
// - iOS Safari: has no install API, so the card explains the two taps
//   (Share → Add to Home Screen) instead.
// - Never shown: when already running as an installed app, in staff/seller/
//   internal areas, on auth pages, before the visitor has seen at least
//   two pages this session, or for 30 days after "Not now".

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Share, X } from 'lucide-react'
import { PWA_ICONS, SITE } from '@/lib/seo'
import { usePwaInstall } from '@/lib/pwa/install'

const DISMISS_KEY = 'wd-install-dismissed-at'
const VIEWS_KEY = 'wd-install-pageviews'
const DISMISS_DAYS = 30
const MIN_PAGEVIEWS = 2
const HIDDEN_PREFIXES = ['/admin', '/seller', '/catalogue', '/demo', '/auth', '/offline']

function isIosSafari() {
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return iOS && !otherBrowser
}

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0)
    return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

export default function InstallPrompt() {
  const pathname = usePathname() || '/'
  // The captured browser prompt lives in lib/pwa/install.ts so the account
  // sidebar's Install app button can use the same one.
  const { canPrompt, installed, promptInstall } = usePwaInstall()
  const [showIos, setShowIos] = useState(false)
  const [engaged, setEngaged] = useState(false)
  const [hidden, setHidden] = useState(true)

  const onHiddenRoute = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  // Count page views this session; the card waits until the visitor has
  // looked around a little instead of interrupting the first page.
  useEffect(() => {
    try {
      const views = Number(sessionStorage.getItem(VIEWS_KEY) || 0) + 1
      sessionStorage.setItem(VIEWS_KEY, String(views))
      if (views >= MIN_PAGEVIEWS) setEngaged(true)
    } catch {
      setEngaged(true)
    }
  }, [pathname])

  useEffect(() => {
    if (recentlyDismissed()) return
    setHidden(false)
    if (isIosSafari()) setShowIos(true)
  }, [])

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {}
    setHidden(true)
  }

  const install = async () => {
    const outcome = await promptInstall()
    if (outcome === 'dismissed') dismiss()
    else setHidden(true)
  }

  const canShow = !hidden && !installed && engaged && !onHiddenRoute && (canPrompt || showIos)
  if (!canShow) return null

  return (
    <div
      role="dialog"
      aria-labelledby="wd-install-title"
      aria-describedby="wd-install-body"
      // Mobile: full width, lifted above the chat button and the account
      // area's bottom nav. Desktop: bottom-left, clear of the chat button.
      className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-2xl bg-indigo p-4 text-parchment shadow-[0_24px_48px_-20px_rgba(8,18,40,0.55)] motion-safe:animate-[fadeUp_240ms_ease-out] sm:inset-x-auto sm:bottom-6 sm:left-6 sm:mx-0"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PWA_ICONS.icon192}
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1 font-body">
          <p id="wd-install-title" className="text-[15px] font-semibold leading-snug">
            Add {SITE.shortName} to your home screen
          </p>
          <p id="wd-install-body" className="mt-1 text-[13px] leading-relaxed text-parchment/75">
            {canPrompt
              ? 'Open your orders and requests in one tap, even on a slow connection.'
              : (
                <>
                  Tap <Share aria-label="Share" className="inline size-3.5 -translate-y-px" /> Share in
                  Safari, then choose <span className="font-semibold text-parchment">Add to Home Screen</span>.
                </>
              )}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-m-1 rounded-lg p-1 text-parchment/60 transition-colors hover:text-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          <X className="size-4" />
        </button>
      </div>

      {canPrompt && (
        <div className="mt-3 flex justify-end gap-2 font-body">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-3 py-2 text-sm font-medium text-parchment/80 transition-colors hover:text-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={install}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Install app
          </button>
        </div>
      )}
    </div>
  )
}
