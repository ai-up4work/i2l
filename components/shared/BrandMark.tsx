// components/shared/BrandMark.tsx
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

type BrandMarkProps = {
  className?: string
  showName?: boolean
}

export default function BrandMark({
  className = 'h-10 w-40',
  showName = true,
}: BrandMarkProps) {
  return (
    <Link href="/" className="flex items-center gap-2.5 -mt-2">
      {/* Brand icon */}
      <span
        className={`inline-grid place-items-center ${className}`}
        aria-hidden="true"
      >
        <Image src={'/wish-drop-logo.png'} alt="" width={200} height={40} className="h-full w-full" />
      </span>
    </Link>
  )
}