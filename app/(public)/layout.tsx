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

      {/* FIX: positionClassName now matches AccountShell's exactly
          (`bottom-24 right-6 lg:bottom-8` — see app/account/layout.tsx),
          instead of being left unset and falling back to ChatPanel's own
          default of `'bottom-24 right-6'` with no `lg:` override. Two
          reasons this needs to match, not just look similar:

          1. Consistency — the bubble/panel sat at a different height on
             desktop here than in the account area, for no functional
             reason; same widget, same product, should anchor the same
             way everywhere it appears.

          2. Correctness — ChatPanel's own `max-h-[calc(100vh-7rem)]
             lg:max-h-[calc(100vh-4rem)]` (see that file) is a height
             BUDGET computed from a specific assumed bottom offset at
             each breakpoint: 6rem base, 2rem at `lg:` — i.e. exactly
             `bottom-24` / `lg:bottom-8`. If this layout kept the panel
             pinned at `bottom-24` all the way through `lg:` while the
             max-height budget assumed the tighter `lg:bottom-8` gap, the
             cap would be too generous for the actual (larger) offset in
             use here — the panel could grow tall enough that its TOP
             edge pushes back off the top of the viewport at `lg:` sizes,
             reintroducing the exact overflow bug the max-h change was
             meant to fix, just on this layout instead of the account
             one. Passing the identical positionClassName keeps the two
             fixes in lockstep. */}
      <ChatButton positionClassName="bottom-24 right-6 lg:bottom-8" />
      <ChatPanel positionClassName="bottom-24 right-6 lg:bottom-8" />
    </div>
  )
}