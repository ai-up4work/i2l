type IllustrationProps = {
  className?: string
}

/**
 * Original flat-illustration shipping tag with a percent symbol punched
 * out of it — deliberately reuses the luggage-tag/customs-label motif
 * from SignupCard and PromoCodeCard rather than a generic "% off" icon,
 * so the two service-card illustrations feel drawn by the same hand.
 */
export default function TagPercentIllustration({ className = 'h-16 w-16' }: IllustrationProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="50" cy="88" rx="34" ry="4" fill="#1C1A17" opacity="0.08" />

      {/* string loop */}
      <path
        d="M32 34c-8-8-8-20 2-24s24 4 20 14"
        fill="none"
        stroke="#1C1A17"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* tag body */}
      <rect x="16" y="22" width="66" height="58" rx="10" fill="#C1272D" stroke="#1C1A17" strokeWidth="3" />
      <circle cx="32" cy="34" r="5.5" fill="#F7F3EA" stroke="#1C1A17" strokeWidth="2.5" />

      {/* percent symbol */}
      <circle cx="38" cy="54" r="6" fill="#F7F3EA" />
      <circle cx="62" cy="70" r="6" fill="#F7F3EA" />
      <line x1="64" y1="46" x2="36" y2="78" stroke="#F7F3EA" strokeWidth="5" strokeLinecap="round" />

      {/* folded corner for a bit of dimension */}
      <path d="M74 80h8v-8z" fill="#D98E2B" stroke="#1C1A17" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
