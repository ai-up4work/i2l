'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/shared/Header'
import Footer from '@/components/landing/Footer'
import ChatButton from '@/components/shared/ChatButton'
import ChatPanel from '@/components/shared/ChatPanel'

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
    // ChatProvider now lives once, in app/layout.tsx (the root) — it
    // also needs to be an ancestor of OrdersProvider's ChatContext
    // dependency, and having every top-level layout (public/account)
    // wrap its own COPY meant a customer's activeOrder pin (see
    // ChatContext.tsx) and even which thread/messages were loaded could
    // silently diverge between "the public site's chat" and "the
    // account area's chat" — two separate live instances of the same
    // customer's conversation, each independently fetching/subscribing.
    // ChatButton/ChatPanel below still just need SOME ChatProvider
    // ancestor, which the root now guarantees regardless of which
    // top-level layout renders them.
    <div className="bg-parchment">
      <Header />

      {/* paddingTop is measured live from the actual <header> element above,
          so this stays correct regardless of Header's internal height. */}
      <div style={{ paddingTop: headerOffset || undefined }}>{children}</div>

      <Footer />
      <ChatButton />
      <ChatPanel />
    </div>
  )
}