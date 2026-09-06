'use client'

import { Loader2, ShoppingCart } from 'lucide-react'

/**
 * Shared presentational button: swaps between idle / loading / unavailable
 * states with matching icon + label + disabled styling. Extracted out of
 * ProductRequestButton so both it and FlipkartCommerceActions' "Get Quote"
 * button render identically, even though they trigger different things —
 * ProductRequestButton opens a NEW request (beginRequestForUrl), while
 * FlipkartCommerceActions' button advances the ALREADY-OPEN modal to its
 * review step (onRequestReview). Keeping onClick as a plain prop here (not
 * baked in) is what lets both call sites reuse this safely.
 */

export type RequestActionButtonProps = {
  onClick: () => void
  className?: string
  children?: React.ReactNode
  loading?: boolean
  unavailable?: boolean
  disabled?: boolean
  loadingLabel?: React.ReactNode
  unavailableLabel?: React.ReactNode
  icon?: React.ReactNode
}

export default function RequestActionButton({
  onClick,
  className,
  children = 'Get Quote',
  loading = false,
  unavailable = false,
  disabled = false,
  loadingLabel = 'Loading…',
  unavailableLabel = 'Not available',
  icon = <ShoppingCart size={15} />,
}: RequestActionButtonProps) {
  const isDisabled = disabled || unavailable || loading

  return (
    <button
      type="button"
      onClick={isDisabled ? undefined : onClick}
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