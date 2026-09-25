'use client'

// components/pwa/InstallInstructions.tsx
//
// Shown when a browser can't open an install dialog on its own (Safari on
// iPhone/iPad/Mac, Firefox, or Chrome/Edge before they've offered a
// prompt). Explains the exact taps for the visitor's own browser.
// Bottom sheet on phones, centred dialog on larger screens.

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EllipsisVertical, MonitorDown, Share, SquarePlus, X } from 'lucide-react'
import type { InstallPlatform } from '@/lib/pwa/install'
import { PWA_ICONS, SITE } from '@/lib/seo'

interface Guide {
  title: string
  steps: ReactNode[]
  note?: ReactNode
}

const Icon = ({ children }: { children: ReactNode }) => (
  <span className="mx-0.5 inline-flex size-6 -translate-y-px items-center justify-center rounded-md bg-ink/[0.06] align-middle text-ink">
    {children}
  </span>
)

const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>

function guideFor(platform: InstallPlatform): Guide {
  switch (platform) {
    case 'ios':
      return {
        title: `Add ${SITE.shortName} to your Home Screen`,
        steps: [
          <>
            Tap the Share button <Icon><Share className="size-3.5" /></Icon> in the toolbar — at the
            bottom on iPhone, at the top on iPad.
          </>,
          <>
            Scroll down and tap{' '}
            <span className="whitespace-nowrap">
              <B>Add to Home Screen</B> <Icon><SquarePlus className="size-3.5" /></Icon>
            </span>
            .
          </>,
          <>
            Tap <B>Add</B>. {SITE.shortName} now opens from your Home Screen like any other app.
          </>,
        ],
        note: (
          <>
            Using Chrome or another browser on iPhone? The Share button is in the address bar. If
            Add to Home Screen isn&rsquo;t in the list, open this page in Safari.
          </>
        ),
      }
    case 'macos-safari':
      return {
        title: `Add ${SITE.shortName} to your Dock`,
        steps: [
          <>
            In the menu bar, choose <B>File</B>, then <B>Add to Dock</B>.
          </>,
          <>
            Click <B>Add</B>. {SITE.shortName} opens in its own window from the Dock.
          </>,
        ],
        note: <>Needs macOS Sonoma or later.</>,
      }
    case 'android':
      return {
        title: `Install ${SITE.shortName}`,
        steps: [
          <>
            Open the browser menu <Icon><EllipsisVertical className="size-3.5" /></Icon>.
          </>,
          <>
            Tap <B>Install app</B> or <B>Add to Home screen</B>.
          </>,
          <>Confirm, and {SITE.shortName} appears with your other apps.</>,
        ],
        note: <>If neither option is there, the app may already be installed — check your app drawer.</>,
      }
    case 'desktop-chromium':
      return {
        title: `Install ${SITE.shortName}`,
        steps: [
          <>
            Click the install icon <Icon><MonitorDown className="size-3.5" /></Icon> at the right end
            of the address bar.
          </>,
          <>
            Not there? Open the browser menu and choose <B>Install {SITE.shortName}</B>. In Chrome it
            may be under <B>Cast, save and share</B>; in Edge, under <B>Apps</B>.
          </>,
        ],
        note: <>No install option anywhere usually means it&rsquo;s already installed — check your apps.</>,
      }
    case 'firefox-desktop':
      return {
        title: 'Installing isn’t available in Firefox',
        steps: [],
        note: (
          <>
            Firefox on desktop can&rsquo;t install web apps. Open {SITE.shortName} in Chrome, Edge or
            Safari to install it, or keep using it here — everything works the same in the browser.
          </>
        ),
      }
    default:
      return {
        title: `Install ${SITE.shortName}`,
        steps: [
          <>Open your browser&rsquo;s menu or Share button.</>,
          <>
            Look for <B>Install app</B>, <B>Add to Home Screen</B> or <B>Add to Dock</B>.
          </>,
        ],
      }
  }
}

export default function InstallInstructions({
  open,
  platform,
  onClose,
}: {
  open: boolean
  platform: InstallPlatform
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      ;(returnFocusRef.current as HTMLElement | null)?.focus?.()
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null
  const guide = guideFor(platform)

  // Portalled to <body> so the sidebar's own overflow/z-index can't clip it.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-indigo-deep/50 backdrop-blur-[2px] motion-safe:animate-[fadeUp_160ms_ease-out]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wd-install-guide-title"
        className="relative w-full max-w-md rounded-t-3xl bg-parchment px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 text-ink shadow-[0_-12px_40px_-12px_rgba(8,18,40,0.4)] motion-safe:animate-[fadeUp_220ms_ease-out] sm:rounded-3xl sm:pb-6"
      >
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PWA_ICONS.icon192} alt="" width={48} height={48} className="size-12 shrink-0 rounded-2xl" />
          <h2
            id="wd-install-guide-title"
            className="flex-1 pt-1 font-display text-xl leading-snug tracking-tight text-indigo"
          >
            {guide.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 rounded-lg p-2 text-ink/50 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
          >
            <X className="size-5" />
          </button>
        </div>

        {guide.steps.length > 0 && (
          <ol className="mt-6 space-y-4 font-body text-[15px] leading-relaxed text-ink/75">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="pt-px">{step}</span>
              </li>
            ))}
          </ol>
        )}

        {guide.note && (
          <p
            className={`font-body text-[13px] leading-relaxed text-ink/60 ${
              guide.steps.length ? 'mt-5 border-t border-ink/10 pt-4' : 'mt-5'
            }`}
          >
            {guide.note}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-indigo py-3 font-body text-sm font-semibold text-parchment transition-colors hover:bg-indigo-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  )
}
