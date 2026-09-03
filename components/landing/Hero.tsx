"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import PerspectiveCarousel, { type CarouselItem } from "./Perspectivecarousel"

const CAROUSEL_ITEMS: CarouselItem[] = [
  {
    src: "/products/hero-product-1.png",
    title: "Fresh Picks",
    description: "Hand-picked favorites, restocked every week.",
  },
  {
    src: "/products/hero-product-2.png",
    title: "Fast Delivery",
    description: "From cart to doorstep in record time.",
  },
  {
    src: "/products/hero-product-3.png",
    title: "Pay Later",
    description: "Order now, settle up when it arrives.",
  },
  {
    src: "/products/hero-product-4.png",
    title: "Curated Deals",
    description: "The best of the catalog, at prices worth waiting for.",
  },
  {
    src: "/products/hero-product-5.png",
    title: "Loved by Shoppers",
    description: "Millions of happy doorsteps and counting.",
  },
]

export default function Hero() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <section
      className="relative overflow-hidden bg-parchment"
      style={{ height: `calc(100dvh)` }}
    >
      {/* Full-viewport background image */}
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-parchment/50 via-parchment/5 to-parchment/50" />
      </div>

      {/*
        min-h-0 is required on every level of this flex column: without it,
        flex children refuse to shrink below their content's natural size,
        which is exactly what lets the carousel (or headline) push past the
        section's fixed height on short/landscape viewports.

        mt-4 / gap-4 are now scoped to sm: and up. On mobile they were
        forcing a fixed top push-down and loose vertical rhythm on a
        viewport that has very little height to spare, which is what
        created the big empty gap under the nav bar and the oversized gap
        before the carousel in the screenshot.
      */}
      <div className="relative z-10 mx-auto flex h-full min-h-0 max-w-[1400px] flex-col items-center justify-center gap-2 px-4 py-3 sm:mt-4 sm:gap-4 lg:px-10">
        {/* Centered headline — fluid clamp() sizing so it scales continuously
            with viewport instead of jumping between fixed breakpoint sizes,
            leaving predictable, never-too-much room for the carousel below */}
        <div
          className={`w-full max-w-2xl shrink-0 text-center transition-all duration-700 mt-20 md:mt-0 ease-out ${
            mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          <h1
            className="font-display leading-tight tracking-tight text-ink"
            style={{ fontSize: "clamp(2.25rem, 7vw + 1vh, 3.75rem)" }}
          >
            <span className="text-teal">Wish it. </span>
            <span className="text-gold">We&apos;ll drop it</span>
            <br />
            <span className="text-indigo">right at your door.</span>
          </h1>
          <p
            className="mt-8 mb-4 font-body font-bold tracking-wide text-ink/70"
            style={{ fontSize: "clamp(1rem, 1.5vw + 0.6rem, 1.125rem)" }}
          >
            Pay when it lands. Not before.
          </p>
        </div>

        {/* Carousel gets the rest of the available space — flex-1 + min-h-0
            means it shrinks to fit whatever room is left after the headline,
            on any device, instead of assuming a fixed viewport fraction. */}
        <div className="flex min-h-0 w-full items-center justify-center">
          <PerspectiveCarousel items={CAROUSEL_ITEMS} fillHeight />
        </div>
      </div>
    </section>
  )
}