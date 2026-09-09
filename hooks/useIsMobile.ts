'use client'

import { useEffect, useState } from 'react'

/** True below Tailwind's `lg` breakpoint (1024px). SSR-safe: starts
 *  false and syncs on mount, so there's no server/client mismatch —
 *  just a possible one-frame flash on load, matching how this hook
 *  behaved before it was removed from the account layout. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)')
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  return isMobile
}