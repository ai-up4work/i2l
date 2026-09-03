// components/ui/Flag.tsx
import { isoCodeFromFlagEmoji } from '@/lib/Flag'

/**
 * Renders a country flag that looks the same on every platform. The
 * "flag emoji" a store's data carries only renders as an actual picture
 * when the visitor's OS/browser has a color-emoji font installed (mobile
 * always does; a chunk of desktop browser/OS combinations don't) —
 * otherwise it falls back to showing the raw two-letter code. Using a
 * real image sidesteps that font dependency entirely.
 *
 * flagcdn.com is free, keyed only by ISO 3166-1 alpha-2 code, and serves
 * flat SVGs (no per-flag asset needed on our side).
 */
export default function Flag({
  flag,
  className = 'h-3 w-4 rounded-[2px] object-cover align-middle',
}: {
  flag: string | null | undefined
  className?: string
}) {
  const code = isoCodeFromFlagEmoji(flag)

  if (!code) {
    // Couldn't derive a code (unexpected data shape) — fall back to
    // whatever was stored, rather than rendering nothing.
    return <span aria-hidden="true">{flag}</span>
  }

  return (
    <img
      src={`https://flagcdn.com/${code.toLowerCase()}.svg`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className={className}
      // If flagcdn itself is ever unreachable, fall back to the emoji
      // text rather than showing a broken-image icon.
      onError={(e) => {
        const span = document.createElement('span')
        span.textContent = flag ?? ''
        e.currentTarget.replaceWith(span)
      }}
    />
  )
}