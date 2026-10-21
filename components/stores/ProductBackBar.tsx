'use client'

// components/stores/ProductBackBar.tsx
//
// Phones only: the desktop breadcrumb bar is hidden under `sm`, so this
// gives the product page a way back: "‹ Store name".
// Goes back in history when the shopper came from inside Wishdrop (keeps
// their scroll and filters), otherwise opens the store page.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

export default function ProductBackBar({ storeName, storeHref }: { storeName: string; storeHref: string }) {
  const router = useRouter()

  function back(event: React.MouseEvent) {
    let internal = false
    try {
      internal = !!document.referrer && new URL(document.referrer).origin === window.location.origin
    } catch {}
    if (internal && window.history.length > 1) {
      event.preventDefault()
      router.back()
    }
  }

  return (
    <nav aria-label="Breadcrumb" className="mx-auto flex max-w-6xl items-center gap-2 px-4 pt-3 sm:hidden">
      <Link
        href={storeHref}
        onClick={back}
        className="inline-flex h-9 min-w-0 items-center gap-1 rounded-full border border-ink/10 bg-card/80 pl-1.5 pr-3.5 text-sm font-semibold text-ink shadow-sm active:scale-95"
      >
        <ChevronLeft size={18} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{storeName}</span>
      </Link>
    </nav>
  )
}
