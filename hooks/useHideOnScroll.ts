// hooks/useHideOnScroll.ts
//
// Phones only: the header and the bottom bar slide away while the shopper
// scrolls down, and come back as soon as they scroll up (or reach the
// top), so the page gets the whole screen. One shared listener for the
// whole app, so the header and the bar always move together.
//
// Works for the window (public pages) and for inner scroll areas such as
// the account area's content column, by listening to scroll events in the
// capture phase. Scrolling inside dialogs and sheets is ignored.

'use client'

import { useSyncExternalStore } from 'react'

const MOBILE_QUERY = '(max-width: 1023.98px)'
/** Pixels of movement before the direction counts (stops jitter). */
const THRESHOLD = 8
/** Always shown this close to the top. */
const TOP_ZONE = 64

let hidden = false
const listeners = new Set<() => void>()
const lastTop = new WeakMap<EventTarget, number>()
let installed = false

function set(next: boolean) {
  if (hidden === next) return
  hidden = next
  listeners.forEach((l) => l())
}

function topOf(target: EventTarget | null): number {
  if (!target || target === document || target === window) return window.scrollY
  return (target as HTMLElement).scrollTop ?? 0
}

function onScroll(e: Event) {
  const target = e.target === document ? window : e.target
  if (!target) return
  if (target !== window) {
    const el = target as HTMLElement
    // Only vertical scroll areas that are a real part of the page.
    if (!(el instanceof HTMLElement) || el.scrollHeight - el.clientHeight < 40) return
    if (el.closest('[role="dialog"], [aria-modal="true"]')) return
  }
  if (!window.matchMedia(MOBILE_QUERY).matches) {
    set(false)
    return
  }
  const top = topOf(target)
  const prev = lastTop.get(target)
  if (prev === undefined) {
    lastTop.set(target, top)
    if (top <= TOP_ZONE) set(false)
    return
  }
  const delta = top - prev
  if (Math.abs(delta) < THRESHOLD && top > TOP_ZONE) return
  lastTop.set(target, top)
  if (top <= TOP_ZONE) set(false)
  else if (delta > 0) set(true)
  else if (delta < 0) set(false)
}

function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  window.addEventListener('resize', () => {
    if (!window.matchMedia(MOBILE_QUERY).matches) set(false)
  })
}

function subscribe(cb: () => void) {
  install()
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Show the header and bar again (e.g. after navigating). */
export function revealChrome() {
  set(false)
}

/** True while the phone header and bottom bar should be tucked away. */
export function useHideOnScroll(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hidden,
    () => false,
  )
}
