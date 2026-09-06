'use client'

import { ShoppingCart } from 'lucide-react'
import RequestActionButton, { type RequestActionButtonProps } from '@/components/stores/RequestActionButton'
import { useDashboard } from '@/contexts/DashboardContext'

/**
 * Drop-in replacement for the old `<Link href={requestHref}>Request this
 * item</Link>` on the marketplace product page. Instead of sending the
 * shopper through /login → /account/requests/new, this calls
 * beginRequestForUrl() — the same raw-URL entry point DashboardContext
 * already exposes for the landing-page redirect handoff — pre-filled with
 * this product's own URL instead of asking the shopper to paste one. That
 * opens ItemInfoModal right here on the product page, "like usual".
 *
 * Visual/state logic (loading, unavailable, icon swap) lives in the
 * shared RequestActionButton — this file only owns the "open a new
 * request" click behavior specific to this button.
 */

type ProductRequestButtonProps = {
  productUrl: string
} & Omit<RequestActionButtonProps, 'onClick'>

export default function ProductRequestButton({
  productUrl,
  disabled,
  icon = <ShoppingCart size={15} />,
  ...rest
}: ProductRequestButtonProps) {
  const { beginRequestForUrl, resetDraft } = useDashboard()

  function handleClick() {
    resetDraft()
    beginRequestForUrl(productUrl)
  }

  return (
    <RequestActionButton
      {...rest}
      icon={icon}
      disabled={disabled || !productUrl}
      onClick={handleClick}
    />
  )
}