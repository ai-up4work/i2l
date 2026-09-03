'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/* ============================================================================
 * IntroSnapScroll
 *
 * Wraps exactly two full-height sections (e.g. Hero and ViewportTwo) and
 * gives them a hand-animated snap transition — eased with requestAnimationFrame
 * rather than relying on the browser's native `scroll-behavior: smooth`,
 * which tends to feel abrupt/linear and varies across browsers.
 *
 * Behavior:
 *  - While the user is within these two sections, wheel/touch/arrow-key
 *    scroll input is intercepted and converted into a single eased animated
 *    scroll to whichever section is next.
 *  - Once the user has moved past section two, the listeners detach and
 *    scrolling reverts to completely normal native behavior for the rest of
 *    the page. Scrolling back up above section two re-engages it.
 *  - Respects prefers-reduced-motion by skipping animation and just jumping.
 * ==========================================================================*/

const ANIMATION_MS = 850
const WHEEL_LOCK_MS = ANIMATION_MS + 150
const WHEEL_THRESHOLD = 8

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function IntroSnapScroll({ sections }: { sections: [ReactNode, ReactNode] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([null, null])
  const activeIndex = useRef(0)
  const isAnimating = useRef(false)
  const lastWheelAt = useRef(0)
  const touchStartY = useRef<number | null>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return

    function sectionTop(index: number) {
      return sectionRefs.current[index]?.getBoundingClientRect().top ?? 0
    }

    function animateTo(index: number) {
      const target = sectionRefs.current[index]
      if (!target || isAnimating.current) return

      isAnimating.current = true
      activeIndex.current = index

      const startY = window.scrollY
      const endY = startY + target.getBoundingClientRect().top
      const distance = endY - startY
      const startTime = performance.now()

      function step(now: number) {
        const elapsed = now - startTime
        const progress = Math.min(elapsed / ANIMATION_MS, 1)
        const eased = easeInOutCubic(progress)
        window.scrollTo(0, startY + distance * eased)

        if (progress < 1) {
          requestAnimationFrame(step)
        } else {
          isAnimating.current = false
        }
      }

      requestAnimationFrame(step)
    }

    function withinIntroRange() {
      // Engaged while section two hasn't fully scrolled past the top yet.
      const secondTop = sectionTop(1)
      return secondTop > -window.innerHeight * 0.5
    }

    function handleWheel(event: WheelEvent) {
      if (!withinIntroRange()) return

      const now = performance.now()
      if (now - lastWheelAt.current < WHEEL_LOCK_MS) {
        event.preventDefault()
        return
      }
      if (Math.abs(event.deltaY) < WHEEL_THRESHOLD) return

      event.preventDefault()
      lastWheelAt.current = now

      if (event.deltaY > 0 && activeIndex.current === 0) {
        animateTo(1)
      } else if (event.deltaY < 0 && activeIndex.current === 1) {
        animateTo(0)
      }
    }

    function handleTouchStart(event: TouchEvent) {
      if (!withinIntroRange()) return
      touchStartY.current = event.touches[0]?.clientY ?? null
    }

    function handleTouchMove(event: TouchEvent) {
      if (!withinIntroRange() || touchStartY.current === null) return

      const currentY = event.touches[0]?.clientY ?? touchStartY.current
      const delta = touchStartY.current - currentY

      if (Math.abs(delta) < 40) return
      event.preventDefault()

      const now = performance.now()
      if (now - lastWheelAt.current < WHEEL_LOCK_MS) return
      lastWheelAt.current = now
      touchStartY.current = null

      if (delta > 0 && activeIndex.current === 0) {
        animateTo(1)
      } else if (delta < 0 && activeIndex.current === 1) {
        animateTo(0)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!withinIntroRange()) return
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        if (activeIndex.current === 0) {
          event.preventDefault()
          animateTo(1)
        }
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        if (activeIndex.current === 1) {
          event.preventDefault()
          animateTo(0)
        }
      }
    }

    // Keep activeIndex in sync if the user scrolls here via other means
    // (e.g. anchor link, browser back/forward) so the next wheel tick knows
    // which direction it's allowed to animate.
    function handleScroll() {
      if (isAnimating.current) return
      activeIndex.current = sectionTop(1) <= window.innerHeight * 0.5 ? 1 : 0
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <div ref={containerRef}>
      <div ref={(el) => { sectionRefs.current[0] = el }} className="min-h-screen">
        {sections[0]}
      </div>
      <div ref={(el) => { sectionRefs.current[1] = el }} className="min-h-screen">
        {sections[1]}
      </div>
    </div>
  )
}