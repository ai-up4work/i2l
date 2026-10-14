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
// After the header/bar move, the page can shift by itself (the account
// area's content moves up into the freed space, and the browser then
// nudges the scroll position). Those shifts are not the shopper
// scrolling, so they're ignored until the slide has finished.
const SETTLE_MS = 450
let settleUntil = 0
const listeners = new Set<() => void>()
const lastTop = new WeakMap<EventTarget, number>()
let installed = false

function set(next: boolean) {
  if (hidden === next) return
  hidden = next
  settleUntil = Date.now() + SETTLE_MS
  listeners.forEach((l) => l())
}

function topOf(target: EventTarget | null): number {
  if (!target || target === document || target === window) return window.scrollY
  return (target as HTMLElement).scrollTop ?? 0
}

/** Furthest the target can scroll. */
function maxOf(target: EventTarget): number {
  if (target === window) return document.documentElement.scrollHeight - window.innerHeight
  const el = target as HTMLElement
  return el.scrollHeight - el.clientHeight
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
  const max = maxOf(target)
  // Rubber-band bounce past either end (phones), and the last few pixels
  // at the bottom where the page settles: remember the position but don't
  // treat it as a change of direction.
  if (top <= 0) {
    lastTop.set(target, 0)
    set(false)
    return
  }
  if (top >= max - 4) {
    lastTop.set(target, Math.max(0, Math.min(top, max)))
    return
  }
  // The header/bar are still sliding and the page is settling.
  if (Date.now() < settleUntil) {
    lastTop.set(target, top)
    return
  }
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
