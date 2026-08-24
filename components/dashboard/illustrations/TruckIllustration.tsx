type IllustrationProps = {
  className?: string
}

/**
 * Original flat-illustration truck — not a stock asset or a traced photo,
 * just shapes drawn in the app's own palette (gold cargo box, rust cab,
 * ink outlines). Used in place of a generic line-icon so "Parcel
 * forwarding" reads as a small piece of art rather than a UI glyph.
 */
export default function TruckIllustration({ className = 'h-16 w-16' }: IllustrationProps) {
  return (
    <svg viewBox="0 0 110 100" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="56" cy="80" rx="46" ry="4" fill="#1C1A17" opacity="0.08" />

      {/* motion lines */}
      <g stroke="#8A8578" strokeWidth="3.5" strokeLinecap="round" opacity="0.5">
        <line x1="0" y1="34" x2="10" y2="34" />
        <line x1="0" y1="44" x2="6" y2="44" />
        <line x1="0" y1="54" x2="10" y2="54" />
      </g>

      {/* cargo box */}
      <rect x="14" y="26" width="52" height="36" rx="8" fill="#D98E2B" stroke="#1C1A17" strokeWidth="3" />
      <rect x="24" y="38" width="22" height="16" rx="3" fill="#C1272D" stroke="#1C1A17" strokeWidth="2" />
      <line x1="35" y1="38" x2="35" y2="54" stroke="#F7F3EA" strokeWidth="2" />
      <line x1="24" y1="46" x2="46" y2="46" stroke="#F7F3EA" strokeWidth="2" />

      {/* cab */}
      <rect x="66" y="34" width="28" height="28" rx="8" fill="#C1272D" stroke="#1C1A17" strokeWidth="3" />
      <rect x="72" y="40" width="16" height="14" rx="3" fill="#F7F3EA" stroke="#1C1A17" strokeWidth="2" />
      <rect x="92" y="54" width="8" height="6" rx="2" fill="#D98E2B" stroke="#1C1A17" strokeWidth="2" />

      {/* wheels */}
      <circle cx="32" cy="66" r="9" fill="#1C1A17" />
      <circle cx="32" cy="66" r="3.5" fill="#F7F3EA" />
      <circle cx="80" cy="66" r="9" fill="#1C1A17" />
      <circle cx="80" cy="66" r="3.5" fill="#F7F3EA" />
    </svg>
  )
}
