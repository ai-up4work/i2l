'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/shared/Header'
import Footer from '@/components/landing/Footer'
import ChatButton from '@/components/landing/ChatButton'

// Header is `fixed`, so it doesn't reserve space in normal document flow —
// anything rendered below it would otherwise sit underneath it. Rather than
// hardcoding a guess at Header's height (its OUTER_H bar plus AirmailStripe's
// own height, which this file can't see), measure the rendered <header>
// element at runtime and pad content to match. Re-measures on resize, since
// Header's mobile vs. desktop layouts differ.
function useHeaderOffset() {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const headerEl = document.querySelector('header')
    if (!headerEl) return

    const update = () => setOffset(headerEl.getBoundingClientRect().height)
    update()

    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(headerEl)
    window.addEventListener('resize', update)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return offset
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const headerOffset = useHeaderOffset()

  return (
    <div className="bg-parchment">
      <Header />

      {/* paddingTop is measured live from the actual <header> element above,
          so this stays correct regardless of Header's internal height. */}
      <div style={{ paddingTop: headerOffset || undefined }}>{children}</div>

      <Footer />
      <ChatButton />
    </div>
  )
}