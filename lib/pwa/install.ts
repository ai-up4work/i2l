// lib/pwa/install.ts
//
// Shared install state for every "install the app" surface (the floating
// InstallPrompt card and the account sidebar's Install app button).
//
// Why a shared module: Chrome/Edge fire `beforeinstallprompt` ONCE per page
// load, and the event object can only be used once. If each component
// listened for it separately, whichever mounted later (the sidebar only
// exists inside /account) would miss it. So the listener is attached here,
// at module load, the moment any importer's JS runs — and components read
// the captured event through usePwaInstall().

import { useSyncExternalStore } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Which install path this browser supports. */
export type InstallPlatform =
  | 'ios' // iPhone/iPad, any browser: Share → Add to Home Screen
  | 'macos-safari' // Safari on Mac: File → Add to Dock
  | 'android' // Android browser without a prompt available: browser menu
  | 'desktop-chromium' // Chrome/Edge/Brave/Opera desktop: address-bar install icon
  | 'firefox-desktop' // No web-app install at all
  | 'unknown'

interface InstallState {
  /** The captured native prompt, if the browser offered one. */
  deferred: BeforeInstallPromptEvent | null
  /** Running as the installed app, or installed during this session. */
  installed: boolean
  platform: InstallPlatform
}

const SERVER_STATE: InstallState = { deferred: null, installed: false, platform: 'unknown' }

let state: InstallState = SERVER_STATE
const listeners = new Set<() => void>()

function emit(next: Partial<InstallState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (isIOS) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  const isFirefox = /Firefox\//.test(ua)
  if (isFirefox) return 'firefox-desktop'
  const isChromium = /Chrome\/|Chromium\/|Edg\//.test(ua)
  if (isChromium) return 'desktop-chromium'
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return 'macos-safari'
  return 'unknown'
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

if (typeof window !== 'undefined') {
  state = { deferred: null, installed: isStandalone(), platform: detectPlatform() }

  window.addEventListener('beforeinstallprompt', (e) => {
    // Stops Chrome's own mini-infobar; our UI decides when to ask.
    e.preventDefault()
    emit({ deferred: e as BeforeInstallPromptEvent, installed: false })
  })

  window.addEventListener('appinstalled', () => {
    emit({ deferred: null, installed: true })
  })

  // Catches the tab being popped out into the installed app window.
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', (e) => {
    if (e.matches) emit({ installed: true })
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

/**
 * Opens the browser's native install dialog if one is available.
 * Returns 'unavailable' when the browser has no prompt to offer (Safari,
 * Firefox, already installed, or Chrome hasn't deemed the site installable
 * yet) — callers should show manual instructions in that case.
 */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = state.deferred
  if (!event) return 'unavailable'
  // A prompt event can only be used once, accepted or not.
  emit({ deferred: null })
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') emit({ installed: true })
    return outcome
  } catch {
    return 'unavailable'
  }
}

export function usePwaInstall() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE)
  return {
    platform: snapshot.platform,
    installed: snapshot.installed,
    /** True when a tap can open the native install dialog directly. */
    canPrompt: snapshot.deferred !== null,
    promptInstall,
  }
}
