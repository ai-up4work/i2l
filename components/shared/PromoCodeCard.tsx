// components/shared/PromoCodeCard.tsx
'use client'

import { useState } from 'react'
import { Check, ChevronRight, Copy } from 'lucide-react'

export type PromoCodeCardProps = {
  /** Small category pill, top-right corner — e.g. "Express Checkout", "Proxy Shopping". */
  tag: string
  /** Big headline value — e.g. "$50", "15% OFF", "LKR 1,200". */
  discount: string
  /** Shorter description below the headline. */
  title: string
  code: string
  expiresOn: string
  /** Optional pill next to the tag for a reason the code can't be used, e.g. "Used" / "Expired". */
  statusLabel?: string
  /** Greys the card out and disables copying — pair with statusLabel. */
  disabled?: boolean
  /** Shows a "Details >" link under the expiry date. Omit to hide it. */
  onInfo?: () => void
}

export default function PromoCodeCard({
  tag,
  discount,
  title,
  code,
  expiresOn,
  statusLabel,
  disabled = false,
  onInfo,
}: PromoCodeCardProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (disabled) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied by the browser; the code is
      // still fully visible to select and copy by hand.
    }
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${
        disabled ? 'border-ink/10 bg-card/60' : 'border-gold/40 bg-card'
      }`}
    >
      <div className="relative p-5">
        <div className="absolute right-5 top-5 flex flex-wrap justify-end gap-1.5">
          <span
            className={`w-max rounded-md px-2.5 py-1 text-[11px] font-semibold ${
              disabled ? 'bg-ink/5 text-ink/40' : 'bg-gold/10 text-gold-deep'
            }`}
          >
            {tag}
          </span>
          {statusLabel && (
            <span className="w-max rounded-md bg-ink/5 px-2.5 py-1 text-[11px] font-semibold text-ink/40">
              {statusLabel}
            </span>
          )}
        </div>

        <p className={`max-w-[70%] font-display text-3xl leading-none ${disabled ? 'text-ink/30' : 'text-gold-deep'}`}>
          {discount}
        </p>

        <p className={`mt-3 max-w-[85%] text-sm leading-relaxed ${disabled ? 'text-ink/40' : 'text-ink/75'}`}>
          {title}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span className={`text-xs ${disabled ? 'text-ink/30' : 'text-ink/45'}`}>Use by {expiresOn}</span>
          {onInfo && (
            <button
              type="button"
              onClick={onInfo}
              className="flex items-center gap-1 text-xs font-semibold text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
            >
              Details <ChevronRight size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Perforated tear between the offer and the code — notches punch
          through the card's left/right edges, like a torn ticket stub. */}
      <div
        className={`relative border-t border-dashed before:absolute before:-left-3 before:-top-3 before:h-6 before:w-6 before:rounded-full before:bg-parchment before:content-[''] after:absolute after:-right-3 after:-top-3 after:h-6 after:w-6 after:rounded-full after:bg-parchment after:content-[''] ${
          disabled ? 'border-ink/15' : 'border-gold/30'
        }`}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <span className={`font-mono text-sm font-bold tracking-wide ${disabled ? 'text-ink/30' : 'text-ink'}`}>
            {code}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            disabled={disabled}
            className="flex flex-none items-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-xs font-bold text-parchment transition-colors enabled:hover:bg-teal-deep disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/30"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}