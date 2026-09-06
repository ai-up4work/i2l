// components/stores/ProductRequestButton.tsx
'use client'

import { useDashboard } from '@/contexts/DashboardContext'

/**
 * Drop-in replacement for the old `<Link href={requestHref}>Request this
 * item</Link>` on the marketplace product page. Instead of sending the
 * shopper through /login → /account/requests/new, this calls
 * beginRequestForUrl() — the same raw-URL entry point DashboardContext
 * already exposes for the landing-page redirect handoff — pre-filled with
 * this product's own URL instead of asking the shopper to paste one. That
 * opens ItemInfoModal right here on the product page, "like usual".
 */
export default function ProductRequestButton({
  productUrl,
  className,
  children,
}: {
  productUrl: string
  className?: string
  children: React.ReactNode
}) {
  const { beginRequestForUrl, resetDraft } = useDashboard()

  function handleClick() {
    if (!productUrl) return
    resetDraft()
    beginRequestForUrl(productUrl)
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  )
}