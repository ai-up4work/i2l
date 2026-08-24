type IllustrationProps = {
  className?: string
}

/**
 * Original flat-illustration gift box with a hanging tag — reuses the
 * luggage-tag motif from TagPercentIllustration/SignupCard so the invite
 * banner still reads as part of the same postal visual system, just
 * dressed up for a "reward" moment.
 */
export default function GiftInviteIllustration({ className = 'h-20 w-20' }: IllustrationProps) {
  return (
    <svg viewBox="0 0 110 100" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* box */}
      <rect x="20" y="40" width="50" height="42" rx="6" fill="#C1272D" stroke="#1C1A17" strokeWidth="3" />
      {/* lid */}
      <rect x="14" y="30" width="62" height="16" rx="6" fill="#D98E2B" stroke="#1C1A17" strokeWidth="3" />
      {/* ribbon */}
      <rect x="41" y="30" width="8" height="52" fill="#F7F3EA" stroke="#1C1A17" strokeWidth="2" />
      {/* bow */}
      <path d="M45 30c0-6-6-14-14-14s-8 12 4 14z" fill="#D98E2B" stroke="#1C1A17" strokeWidth="2.5" />
      <path d="M45 30c0-6 6-14 14-14s8 12-4 14z" fill="#D98E2B" stroke="#1C1A17" strokeWidth="2.5" />
      <circle cx="45" cy="29" r="4" fill="#C1272D" stroke="#1C1A17" strokeWidth="2" />

      {/* hanging tag */}
      <g transform="rotate(-16 20 66)">
        <path d="M6 60c0-1.5 1-2.5 2.5-2.5H22a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8.5C7 71.5 6 70.5 6 69z" fill="#1C1A17" />
        <circle cx="11" cy="64" r="1.8" fill="#F7F3EA" />
      </g>

      {/* sparkles */}
      <path d="M92 18l2.4 6.6 6.6 2.4-6.6 2.4-2.4 6.6-2.4-6.6-6.6-2.4 6.6-2.4z" fill="#D98E2B" />
      <path d="M14 22l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" fill="#D98E2B" />
    </svg>
  )
}
