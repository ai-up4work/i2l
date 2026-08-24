'use client'

import { AlertCircle, ArrowRight, X } from 'lucide-react'

type WelcomeBannerProps = {
  onDismiss: () => void
}

export default function WelcomeBanner({ onDismiss }: WelcomeBannerProps) {
  return (
    <div className="relative flex min-h-14 items-center gap-3 border-b border-gold/40 bg-gradient-to-r from-gold/15 via-gold/10 to-gold/20 px-4 py-3 text-sm text-ink sm:px-6 lg:px-10">
      {/* Decorative postal detail */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-rust" />

      {/* Alert icon */}
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-rust/20 bg-rust/10">
        <AlertCircle
          size={18}
          strokeWidth={1.8}
          className="text-rust"
        />
      </div>

      {/* Message */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 leading-5">
        <span>
          Welcome to <span className="font-semibold">India2Lanka!</span>
        </span>

        <span className="hidden text-ink/40 sm:inline">•</span>

        <span className="text-ink/80">
          Verify your phone number and get
        </span>

        <span className="font-bold text-rust">
          LKR 1,000 off
        </span>

        <span className="text-ink/80">
          your first order.
        </span>

        <button
          type="button"
          onClick={onDismiss}
          className="group inline-flex items-center gap-1 font-semibold text-rust underline decoration-rust/40 underline-offset-4 transition-colors hover:text-rust/70 hover:decoration-rust"
        >
          Details
          <ArrowRight
            size={14}
            strokeWidth={2}
            className="transition-transform group-hover:translate-x-0.5"
          />
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
}