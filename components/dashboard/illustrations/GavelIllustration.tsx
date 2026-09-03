type IllustrationProps = {
  className?: string
}

/**
 * Original flat-illustration gavel — same construction language as
 * TruckIllustration/TagPercentIllustration (gold + rust fills, ink
 * outlines, a subtle ground shadow) so all three read as one set.
 */
export default function GavelIllustration({ className = 'h-16 w-16' }: IllustrationProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="50" cy="88" rx="34" ry="4" fill="#1C1A17" opacity="0.08" />

      {/* sound block */}
      <rect x="14" y="66" width="40" height="12" rx="4" fill="#D98E2B" stroke="#1C1A17" strokeWidth="3" />

      {/* handle */}
      <rect
        x="46"
        y="36"
        width="12"
        height="46"
        rx="6"
        fill="#1C1A17"
        transform="rotate(-32 52 59)"
      />

      {/* gavel head */}
      <rect
        x="54"
        y="18"
        width="34"
        height="22"
        rx="6"
        fill="#C1272D"
        stroke="#1C1A17"
        strokeWidth="3"
        transform="rotate(-32 71 29)"
      />

      {/* impact lines */}
      <g stroke="#8A8578" strokeWidth="3" strokeLinecap="round" opacity="0.5">
        <line x1="8" y1="52" x2="16" y2="48" />
        <line x1="6" y1="62" x2="14" y2="62" />
      </g>
    </svg>
  )
}
