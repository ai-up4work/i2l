import React from 'react'


// Shared so the overlay's own top bar matches the real header exactly.
export default function AirmailStripe() {
  return (
    <div
      className="h-1.5 w-full flex-none bg-[repeating-linear-gradient(45deg,#C1272D_0_10px,#F7F3EA_10px_20px,#1E3A5F_20px_30px,#F7F3EA_30px_40px)]"
      aria-hidden="true"
    />
  )
}