// hooks/useIsMobile.ts
'use client'

import { useEffect, useState } from 'react'

/** Tracks whether the viewport is below a breakpoint (default: Tailwind's `lg`, 1024px). */
export function useIsMobile(breakpointPx = 1024) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`)
    setIsMobile(mql.matches)

    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [breakpointPx])

  return isMobile
}