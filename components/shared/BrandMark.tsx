import Image from 'next/image'
import React from 'react'

type BrandMarkProps = {
  className?: string
  showName?: boolean
}

export default function BrandMark({
  className = 'h-10 w-10',
  showName = true,
}: BrandMarkProps) {
  return (
    <div className="flex items-center gap-2.5">
      {/* Brand icon */}
      <span
        className={`inline-grid place-items-center ${className}`}
        aria-hidden="true"
      >
        <Image src={'/images/airmail-stripe.png'} alt="" width={40} height={40} className="h-full w-full" />
      </span>

      {/* Wordmark */}
      {showName && (
        <span className="font-serif-display text-xl font-semibold tracking-tight text-ink">
          India<span className="text-rust">2</span>Lanka
        </span>
      )}
    </div>
  )
}