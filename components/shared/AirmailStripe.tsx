import React from 'react'

// Single source of truth for the stripe's rendered height (h-1.5 = 0.375rem = 6px).
// Header.tsx imports this to compute HEADER_BAR_HEIGHT — if you change the
// className below, update this constant in the same commit or the fixed
// header will silently under/over-reserve space on every page that uses
// HEADER_BAR_HEIGHT.
export const AIRMAIL_STRIPE_HEIGHT = 6

// Shared so the overlay's own top bar matches the real header exactly.
export default function AirmailStripe() {
  return (
    <div
      className="h-1.5 w-full flex-none bg-[repeating-linear-gradient(45deg,#C1272D_0_10px,#F7F3EA_10px_20px,#1E3A5F_20px_30px,#F7F3EA_30px_40px)]"
      aria-hidden="true"
    />
  )
}