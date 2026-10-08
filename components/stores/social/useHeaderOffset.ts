'use client'

import { useEffect, useState } from 'react'

/** Height of the site's fixed <header>, so sticky bars can sit just under
 *  it. Same measurement app/(public)/layout.tsx uses to pad the page. */
export function useHeaderOffset(): number {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const headerEl = document.querySelector('header')
    if (!headerEl) return
    const update = () => setOffset(headerEl.getBoundingClientRect().height)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(headerEl)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])
  return offset
}
