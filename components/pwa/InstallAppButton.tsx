'use client'

// components/pwa/InstallAppButton.tsx
//
// The account sidebar's "Install app" row (replaces the disabled
// "Download App (Soon)" label).
//
//   - Chrome / Edge / Samsung Internet with a prompt ready: opens the
//     browser's native install dialog.
//   - Everything else (Safari on iPhone/iPad/Mac, Firefox, or Chromium
//     before it has offered a prompt): opens step-by-step instructions for
//     that browser.
//   - Already running as the installed app: shows a quiet confirmation
//     instead of a button.

import { useCallback, useState } from 'react'
import { Check } from 'lucide-react'
import { usePwaInstall } from '@/lib/pwa/install'
import InstallInstructions from './InstallInstructions'

export default function InstallAppButton({ className = '' }: { className?: string }) {
  const { installed, canPrompt, platform, promptInstall } = usePwaInstall()
  const [guideOpen, setGuideOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const closeGuide = useCallback(() => setGuideOpen(false), [])

  const platformIcons = (
    <span className="ml-auto flex items-center gap-2.5" aria-hidden="true">
      <i className="sidebar__icon sidebar__icon--downloadApp_IOS_icon" />
      <i className="sidebar__icon sidebar__icon--downloadApp_Android_icon" />
    </span>
  )

  if (installed) {
    return (
      <div className={`flex items-center gap-3 font-body text-sm font-semibold text-ink/60 ${className}`}>
        <Check size={16} strokeWidth={2.2} className="text-teal" aria-hidden="true" />
        App installed
      </div>
    )
  }

  const onClick = async () => {
    if (!canPrompt) {
      setGuideOpen(true)
      return
    }
    setBusy(true)
    const outcome = await promptInstall()
    setBusy(false)
    if (outcome === 'unavailable') setGuideOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-haspopup="dialog"
        className={`group flex w-full items-center gap-3 text-left font-body text-sm font-semibold text-ink transition-colors hover:text-teal-deep focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal disabled:opacity-60 ${className}`}
      >
        <span>
          Install app
          <span className="block text-xs font-medium text-ink/50 group-hover:text-teal-deep/80">
            Phone or computer, no app store needed
          </span>
        </span>
        {platformIcons}
      </button>
      <InstallInstructions open={guideOpen} platform={platform} onClose={closeGuide} />
    </>
  )
}
