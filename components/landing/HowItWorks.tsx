'use client'

import Image from 'next/image'
import { LinkSimple, ShoppingCartSimple, Package } from '@phosphor-icons/react'

const steps = [
  {
    number: '01',
    icon: LinkSimple,
    title: 'Share the Link',
    text: 'Paste the product link from any global store you want.',
  },
  {
    number: '02',
    icon: ShoppingCartSimple,
    title: 'We Buy & Consolidate',
    text: 'We purchase your item and combine it with others to save on shipping costs.',
  },
  {
    number: '03',
    icon: Package,
    title: 'Delivered to You',
    text: 'Your package arrives safely at your doorstep in Sri Lanka.',
  },
]

/* Small dashed connector arrow between step cards, matching the
   hand-drawn "- - ->" motif from the reference screenshot. */
function DashedArrow() {
  return (
    <svg
      width="44"
      height="16"
      viewBox="0 0 44 16"
      fill="none"
      className="text-indigo/35"
      aria-hidden="true"
    >
      <path
        d="M1 8H34"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
      <path
        d="M29 3L36 8L29 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function HowItWorks() {
  return (
    <section className="relative overflow-hidden bg-parchment py-0 md:py-16 pb-8">      
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Image
          src="/how-it-works-bg.png"
          alt=""
          fill
          sizes="100vw"
          className="object-contain object-center"
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="mt-10 max-w-lg pr-8 font-display text-3xl font-semibold leading-tight text-indigo sm:text-4xl">
              Get your favorite products in 3 simple steps
            </h2>
          </div>
        </div>

        <div className="mt-20 grid gap-8 sm:grid-cols-3 sm:gap-20">
          {steps.map(({ number, icon: Icon, title, text }, index) => (
            <div key={number} className="relative flex items-center justify-center">
              <div className="flex h-full min-h-[220px] w-full max-w-[320px] flex-col rounded-2xl bg-card p-7 shadow-sm">        <div className="flex items-center gap-3">
                  <span className="relative grid h-14 w-14 flex-none place-items-center rounded-2xl bg-gradient-to-br from-gold/30 via-gold/15 to-transparent text-gold-deep shadow-inner ring-1 ring-gold/25 before:absolute before:inset-0 before:-z-10 before:rounded-2xl before:bg-gold/20 before:blur-lg before:content-['']">
                    <Icon size={24} weight="duotone" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs font-semibold tracking-wide text-gold-deep">
                    {number}
                  </span>
                </div>

                <h3 className="mt-6 font-display text-base font-semibold text-indigo">{title}</h3>
                <p className="mt-2 font-body text-sm leading-relaxed text-ink/55">{text}</p>
              </div>

              {index < steps.length - 1 && (
                <span
                  className="pointer-events-none absolute right-[-4.5rem] top-1/2 z-10 hidden -translate-y-1/2 sm:block"
                  aria-hidden="true"
                >
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}