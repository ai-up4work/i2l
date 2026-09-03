'use client'

import { CurrencyCircleDollar, Headset, MapPin, ShieldCheck } from '@phosphor-icons/react'
import type { ElementType } from 'react'
import Image from 'next/image'

/* ============================================================================
 * WHY CHOOSE WISHDROP
 * Sits between <Destinations /> and <ShopByCategory /> on the landing page.
 * ==========================================================================*/

type Feature = {
  icon: ElementType
  title: string
  text: string
  iconBg: string
  iconColor: string
}

const features: Feature[] = [
  {
    icon: CurrencyCircleDollar,
    title: 'Lowest Shipping Rates',
    text: 'Competitive flat rates you can count on.',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
  },
  {
    icon: ShieldCheck,
    title: 'Secure & Reliable',
    text: 'Your items are insured and 100% safe.',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  {
    icon: MapPin,
    title: 'Live Tracking',
    text: 'Track every step from store to door.',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
  },
  {
    icon: Headset,
    title: 'Dedicated Support',
    text: "We're here for you, whenever you need.",
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
]

function ParcelIllustration() {
  return (
    <div className="relative mx-auto aspect-[5/3] w-full max-w-md">
      {/* faint world-map dot grid backdrop */}
      <svg
        viewBox="0 0 400 240"
        className="absolute inset-0 h-full w-full text-indigo/10"
        aria-hidden="true"
      >
        <defs>
          <pattern id="mapDots" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="1.2" cy="1.2" r="1.2" fill="currentColor" />
          </pattern>
        </defs>
        <path
          d="M10 90 Q70 40 140 70 T260 60 Q320 50 390 100 L390 200 Q300 170 220 190 T60 170 Q30 160 10 180 Z"
          fill="url(#mapDots)"
        />
      </svg>

      {/* dashed route between the two pins */}
      <svg viewBox="0 0 400 240" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path
          d="M70 150 C 130 100, 180 130, 235 70"
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="2"
          strokeDasharray="5 6"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>

      {/* origin pin */}
      <span className="absolute left-[15%] top-[58%] grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-teal text-parchment shadow-md">
        <MapPin size={13} weight="fill" />
      </span>

      {/* destination pin */}
      <span className="absolute left-[58%] top-[26%] grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gold text-ink shadow-md">
        <MapPin size={15} weight="fill" />
      </span>

      {/* parcel box */}
      <div className="absolute bottom-2 right-[6%] w-[52%] max-w-[220px] -rotate-2 drop-shadow-xl">
        <svg viewBox="0 0 200 150" className="h-full w-full">
          <polygon points="0,45 100,20 200,45 100,70" fill="#C48A4A" />
          <polygon points="0,45 100,70 100,150 0,125" fill="#B57A3A" />
          <polygon points="200,45 100,70 100,150 200,125" fill="#D9975A" />
          <polygon points="0,45 100,20 100,70" fill="#C88F52" opacity="0.5" />
          <rect x="94" y="20" width="12" height="130" fill="#8C5A2B" opacity="0.35" />
          <rect x="0" y="60" width="100" height="10" fill="#8C5A2B" opacity="0.3" />
          <rect x="100" y="60" width="100" height="10" fill="#8C5A2B" opacity="0.3" />
          <text
            x="100"
            y="105"
            textAnchor="middle"
            fontFamily="var(--font-display, sans-serif)"
            fontWeight="700"
            fontSize="16"
            fill="#1B2A4A"
          >
            wishdrop
          </text>
        </svg>
      </div>
    </div>
  )
}

export default function WhyChooseWishdrop() {
  return (
    <section className="bg-parchment px-6 py-16 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* left: copy + illustration */}
          <div>
            <p className="font-body text-xs font-extrabold uppercase tracking-[0.2em] text-gold">
              Why choose Wishdrop
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold leading-tight text-indigo sm:text-4xl">
              Built to make your <br /> shopping effortless
            </h2>

            <div className="mt-10">
              <Image src="/why-choose-wishdrop.png" alt="" width={600} height={400} className="w-full object-cover" />
            </div>
          </div>

          {/* right: 2x2 feature grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, text, iconBg, iconColor }) => (
              <div
                key={title}
                className="rounded-2xl bg-card p-6 shadow-[0_1px_2px_rgba(8,39,79,0.05),0_10px_24px_-14px_rgba(8,39,79,0.2)] ring-1 ring-inset ring-black/5"
              >
                <span
                  className={`grid h-11 w-11 place-items-center rounded-2xl ${iconBg} ${iconColor}`}
                >
                  <Icon size={20} weight="bold" />
                </span>
                <p className="mt-4 font-display text-base font-semibold text-indigo">{title}</p>
                <p className="mt-1.5 font-body text-sm leading-relaxed text-ink/60">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}