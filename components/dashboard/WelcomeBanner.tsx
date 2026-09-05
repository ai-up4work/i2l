'use client'

import { AlertCircle, ArrowRight, X } from 'lucide-react'

type WelcomeBannerProps = {
  open: boolean
  onDismiss: () => void
  /** If true, content below snaps up to fill the space when closed.
   *  If false (default), the banner just fades out and its space stays reserved. */
  collapse?: boolean
  /** Whether the fade/collapse is animated at all. Default true. */
  animated?: boolean
  /** Transition duration in ms. Ignored if animated=false. Default 300. */
  durationMs?: number
  /** Transition easing. Ignored if animated=false. Default 'ease-out'. */
  easing?: string
}

export default function WelcomeBanner({
  open,
  onDismiss,
  collapse = false,
  animated = true,
  durationMs = 300,
  easing = 'ease-out',
}: WelcomeBannerProps) {
  const transitionDuration = animated ? `${durationMs}ms` : '0ms'

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

      {/* Message */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 leading-5">
        <span>
          Welcome to <span className="font-semibold">WishDrop!</span>
        </span>

        <span className="hidden text-ink/40 sm:inline">•</span>

        <span className="text-ink/80">Verify your phone number and get</span>

        <span className="font-bold text-gold-deep">LKR 1,000 off</span>

        <span className="text-ink/80">your first order.</span>

        <button
          type="button"
          onClick={onDismiss}
          className="group inline-flex items-center gap-1 font-semibold text-gold-deep underline decoration-gold-deep/40 underline-offset-4 transition-colors hover:text-gold-deep/70 hover:decoration-gold-deep"
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
    </div>
  )

  if (!collapse) {
    // No layout change at all: banner keeps its space, just fades.
    return (
      <div aria-hidden={!open}>
        {banner}
      </div>
    )
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