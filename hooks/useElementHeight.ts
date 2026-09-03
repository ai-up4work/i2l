// hooks/useElementHeight.ts
'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Measures an element's live rendered height via ResizeObserver, instead
 * of relying on a hardcoded constant that has to be kept in sync by hand.
 * Returns 0 until the ref is attached and the first measurement lands
 * (so callers should treat 0 as "not measured yet", not "zero height").
 */
export function useElementHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setHeight(entry.contentRect.height)
    })
    observer.observe(node)
    setHeight(node.getBoundingClientRect().height)

    return () => observer.disconnect()
  }, [])

  return { ref, height }
}