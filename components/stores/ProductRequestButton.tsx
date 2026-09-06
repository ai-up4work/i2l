'use client'

import { Loader2, ShoppingCart } from 'lucide-react'
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
 * State-aware like FlipkartCommerceActions' "Add to Cart" / "Get Quote"
 * buttons: swaps icon/label between idle, loading, and unavailable states
 * instead of just a plain static button, and exposes the same
 * disabled-state styling contract (opacity-40, cursor-not-allowed) so it
 * reads consistently next to AddToBagButton or any other commerce action
 * it sits beside.
 *
 * All new props are optional — existing call sites that only pass
 * productUrl/className/children keep working unchanged.
 */

type ProductRequestButtonProps = {
  productUrl: string
  className?: string
  children?: React.ReactNode
  /** Shows a spinner + "loading" label instead of children. Use this while
   * a parent is fetching/refreshing product data before the button should
   * be actionable (mirrors FlipkartCommerceActions' `loading` prop). */
  loading?: boolean
  /** Shows "NOT AVAILABLE" and disables the button — same semantics as
   * FlipkartCommerceActions' `result.unavailable` check. */
  unavailable?: boolean
  /** Extra disable condition on top of the built-in empty-URL guard —
   * e.g. a parent's own `!canAct` check. */
  disabled?: boolean
  /** Text shown while `loading` is true. Defaults to "Loading…". */
  loadingLabel?: React.ReactNode
  /** Text shown while `unavailable` is true. Defaults to "Not available". */
  unavailableLabel?: React.ReactNode
  /** Icon shown in the idle state, left of `children`. Defaults to a cart
   * icon, matching Flipkart's GET QUOTE button. Pass `null` to omit it. */
  icon?: React.ReactNode
}

export default function ProductRequestButton({
  productUrl,
  className,
  children = 'Get Quote',
  loading = false,
  unavailable = false,
  disabled = false,
  loadingLabel = 'Loading…',
  unavailableLabel = 'Not available',
  icon = <ShoppingCart size={15} />,
}: ProductRequestButtonProps) {
  const { beginRequestForUrl, resetDraft } = useDashboard()

  const isDisabled = disabled || unavailable || loading || !productUrl

  function handleClick() {
    if (isDisabled) return
    resetDraft()
    beginRequestForUrl(productUrl)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ''}`}
    >
      {loading ? (
        <>
          <Loader2 size={15} className="animate-spin" />
          {loadingLabel}
        </>
      ) : unavailable ? (
        unavailableLabel
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  )
}