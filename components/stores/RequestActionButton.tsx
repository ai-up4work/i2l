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
 *
 * Color is a prop rather than something baked into `className` so a call
 * site's brand color (e.g. Flipkart's #fb641b) can be passed as data instead
 * of a hardcoded Tailwind arbitrary-value class — useful if that color ever
 * needs to vary per store/theme rather than being fixed at build time.
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
  /** Background color while interactive. Omit to style purely via `className` (e.g. a `bg-*` class). */
  color?: string
  /** Background color while disabled/loading/unavailable. Falls back to `color` at reduced opacity when omitted. */
  disabledColor?: string
  /** Text/icon color. Defaults to white, which fits nearly every solid brand color used here. */
  textColor?: string
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
  color,
  disabledColor,
  textColor,
}: RequestActionButtonProps) {
  const isDisabled = disabled || unavailable || loading

  // Only touch inline style when a color prop was actually passed, so call
  // sites that prefer to style entirely via `className` (a `bg-*` class,
  // say) see no behavior change.
  const style: React.CSSProperties | undefined = color
    ? {
        backgroundColor: isDisabled ? disabledColor ?? color : color,
        color: textColor ?? '#ffffff',
      }
    : undefined

  return (
    <button
      type="button"
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      style={style}
      className={`inline-flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed ${
        color && disabledColor ? '' : 'disabled:opacity-40'
      } ${className ?? ''}`}
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