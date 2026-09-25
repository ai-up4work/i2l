'use client'

import { AlertCircle, ArrowRight, X } from 'lucide-react'

type WelcomeBannerProps = {
  open: boolean
  onDismiss: () => void
  /** Navigates to wherever the WhatsApp number actually gets verified
   *  (the settings page). Separate from onDismiss on purpose — "Details"
   *  should take the customer to the verification flow, not just hide
   *  the banner. */
  onDetails: () => void
  /** If true, content below snaps up to fill the space when closed.
   *  If false (default), the banner just fades out and its space stays reserved. */
  collapse?: boolean
  /** Whether the fade/collapse (and marquee) is animated at all. Default true. */
  animated?: boolean
  /** Transition duration in ms. Ignored if animated=false. Default 300. */
  durationMs?: number
  /** Transition easing. Ignored if animated=false. Default 'ease-out'. */
  easing?: string
  /** One loop of the mobile marquee, in seconds. Default 10. */
  marqueeDurationS?: number
}

export default function WelcomeBanner({
  open,
  onDismiss,
  onDetails,
  collapse = false,
  animated = true,
  durationMs = 300,
  easing = 'ease-out',
  marqueeDurationS = 10,
}: WelcomeBannerProps) {
  const transitionDuration = animated ? `${durationMs}ms` : '0ms'

  const messageText = (
    <>
      <span>
        Welcome to <span className="font-semibold">WishDrop!</span>
      </span>
      <span className="text-ink/40">•</span>
      <span className="text-ink/80">Verify your WhatsApp number and get</span>
      <span className="font-bold text-gold-deep">LKR 1,000 off</span>
      <span className="text-ink/80">your first order.</span>
    </>
  )

  const banner = (
    <div
      className={`relative z-20 flex min-h-14 items-center gap-3 border-b border-gold/40 bg-gradient-to-r from-gold/15 via-gold/10 to-gold/20 px-4 py-3 text-sm text-ink sm:px-6 lg:px-10 ${
        animated ? 'transition-opacity' : ''
      } ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      style={{ transitionDuration }}
    >
      {/* Decorative postal detail */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gold-deep" />

      {/* Alert icon */}
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gold-deep/20 bg-gold-deep/10">
        <AlertCircle size={18} strokeWidth={1.8} className="text-gold-deep" />
      </div>

      {/* Message + Details */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* Read once by screen readers, regardless of which visual layout is active */}
        <span className="sr-only">
          Welcome to WishDrop! Verify your WhatsApp number and get LKR 1,000 off your first order.
        </span>

        {/* Mobile (<sm): single-line marquee */}
        <div
          aria-hidden="true"
          className="min-w-0 flex-1 overflow-hidden sm:hidden"
          style={{
            maskImage:
              'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
          }}
        >
          <div
            className="animate-wishdrop-marquee flex w-max items-center whitespace-nowrap leading-5"
            style={{
              animationDuration: `${marqueeDurationS}s`,
              animationPlayState: animated && open ? 'running' : 'paused',
            }}
          >
            {/* Two copies back to back; pr-10 (not gap) bakes the trailing
                space into each copy's own width so -50% lands exactly at
                the seam with no jump. */}
            <div className="flex items-center gap-2 pr-10">{messageText}</div>
            <div className="flex items-center gap-2 pr-10">{messageText}</div>
          </div>
        </div>

        {/* sm and up: original wrapping line */}
        <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 leading-5 sm:flex">
          {messageText}
        </div>

        <button
          type="button"
          onClick={onDetails}
          className="group inline-flex flex-none items-center gap-1 font-semibold text-gold-deep underline decoration-gold-deep/40 underline-offset-4 transition-colors hover:text-gold-deep/70 hover:decoration-gold-deep"
        >
          Details
          <ArrowRight size={14} strokeWidth={2} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Dismiss */}
      <button
        type="button"
        aria-label="Dismiss banner"
        onClick={onDismiss}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-ink/50 transition-all hover:bg-ink/5 hover:text-ink"
      >
        <X size={18} strokeWidth={1.8} />
      </button>

      <style jsx>{`
        @keyframes wishdrop-marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
        .animate-wishdrop-marquee {
          animation-name: wishdrop-marquee;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-wishdrop-marquee {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )

  if (!collapse) {
    // No layout change at all: banner keeps its space, just fades.
    return <div aria-hidden={!open}>{banner}</div>
  }

  // Opt-in collapse: content below snaps up.
  return (
    <div
      className={`grid overflow-hidden ${animated ? 'transition-[grid-template-rows]' : ''}`}
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        transitionDuration,
        transitionTimingFunction: easing,
      }}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">{banner}</div>
    </div>
  )
}