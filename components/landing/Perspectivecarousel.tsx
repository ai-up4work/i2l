"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"

export type CarouselItem = {
  src: string
  alt?: string
  title?: string
  description?: string
}

type PerspectiveCarouselProps = {
  items: CarouselItem[]
  autoPlayInterval?: number
  angleStep?: number
  spacingCurve?: number
  maxRotation?: number
  radius?: number
  radiusBoost?: number
  cardWidth?: number
  cardHeight?: number
  centerScale?: number
  mobileBreakpoint?: number
  fillHeight?: boolean
  className?: string
}

export default function PerspectiveCarousel({
  items,
  autoPlayInterval = 3500,
  angleStep = 20,
  spacingCurve = 1.3,
  maxRotation = 58,
  radius: radiusProp,
  radiusBoost = 1.05,
  cardWidth = 360,
  cardHeight = 200,
  centerScale = 1.3,
  mobileBreakpoint = 640,
  fillHeight = false,
  className = "",
}: PerspectiveCarouselProps) {
  const [centerIndex, setCenterIndex] = useState(0)
  const [mounted, setMounted] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const [viewport, setViewport] = useState({ w: 1280, h: 800 })
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const isMobile = viewport.w < mobileBreakpoint

  const [rootHeight, setRootHeight] = useState(0)
  const [bottomHeight, setBottomHeight] = useState(0)

  useEffect(() => {
    if (!fillHeight || !rootRef.current) return
    const el = rootRef.current
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setRootHeight(entry.contentRect.height)
    })
    observer.observe(el)
    setRootHeight(el.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [fillHeight])

  useEffect(() => {
    if (!fillHeight || !bottomRef.current) return
    const el = bottomRef.current
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setBottomHeight(entry.contentRect.height)
    })
    observer.observe(el)
    setBottomHeight(el.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [fillHeight])

  const aspectRatio = cardWidth / cardHeight

  const widthCap = viewport.w * (isMobile ? 0.66 : 0.22)
  let width = Math.max(140, Math.min(cardWidth, widthCap))
  let height = width / aspectRatio

  const fallbackHeightCap = (viewport.h * (isMobile ? 0.5 : 0.38)) / centerScale
  const measuredStageCap =
    rootHeight > 0 ? Math.max(60, (rootHeight - bottomHeight - 24) / centerScale) : null

  const heightCap =
    fillHeight && measuredStageCap !== null
      ? Math.min(fallbackHeightCap, measuredStageCap)
      : fallbackHeightCap

  if (height > heightCap) {
    height = heightCap
    width = height * aspectRatio
  }

  const mobileSideWidthFactor = 0.62
  const sideWidth = isMobile ? width * mobileSideWidthFactor : width
  const sideHeight = isMobile ? height * mobileSideWidthFactor : height

  const [stageWidth, setStageWidth] = useState(0)
  const [stageHeight, setStageHeight] = useState(0)
  useEffect(() => {
    if (!stageRef.current) return
    const el = stageRef.current
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setStageWidth(entry.contentRect.width)
        setStageHeight(entry.contentRect.height)
      }
    })
    observer.observe(el)
    const rect = el.getBoundingClientRect()
    setStageWidth(rect.width)
    setStageHeight(rect.height)
    return () => observer.disconnect()
  }, [])

  // On mobile the stack rotates around a vertical axis (cards recede
  // above/below the center card) instead of horizontal (cards recede
  // left/right). Desktop keeps the original horizontal coverflow.
  const orientation: "horizontal" | "vertical" = isMobile ? "vertical" : "horizontal"

  const maxVisibleOffset = isMobile ? 1 : Math.min(3, Math.ceil(items.length / 2))

  const angleForOffset = (absOffset: number) =>
    Math.min(Math.pow(absOffset, spacingCurve) * angleStep, maxRotation)

  // On desktop, deliberately use LESS of the available width (0.98 -> 0.7)
  // so the outermost card's position gets pulled inward past the second
  // card's footprint, producing a genuine overlap — the far card visually
  // tucks behind the nearer one, the same way the center card overlaps its
  // immediate neighbors, instead of sitting flush at the stage edge with a
  // gap.
  //
  // On mobile (vertical orientation), keep the side cards close and
  // overlapping the center card — matching desktop's tight coverflow feel
  // — rather than spread far apart.
  const radiusWidthUsage = isMobile ? 0.95 : 0.7

  const autoRadius = useMemo(() => {
    const base = (() => {
      // Motion-axis extent: the stage's width for horizontal mode, or its
      // height for vertical mode — this is the dimension the cards spread
      // out along, so it's what determines how far apart they can sit.
      //
      // For vertical mode this is capped to a card-relative value instead
      // of the raw measured stageHeight. The carousel wrapper is flex-1 in
      // the mobile hero (so the visible stage has generous room to sit
      // in), but if the radius calc used that full leftover height
      // directly, the side cards would get pushed proportionally far from
      // center — a big gap, not the tight desktop-style overlap. Capping
      // ties the spacing to the card's own size instead, independent of
      // how much surrounding flex space happens to be available.
      const verticalExtentCap = height * centerScale + sideHeight * 1.8
      const stageExtent =
        orientation === "vertical" ? Math.min(stageHeight, verticalExtentCap) : stageWidth
      const cardExtent = orientation === "vertical" ? sideHeight : sideWidth
      if (stageExtent <= 0) return 260
      const angleDeg = angleForOffset(maxVisibleOffset)
      const angleRad = (angleDeg * Math.PI) / 180
      const sinMax = Math.max(Math.sin(angleRad), 0.35)
      const availableHalfExtent = stageExtent / 2 - cardExtent / 2
      return Math.max(120, (availableHalfExtent * radiusWidthUsage) / sinMax)
    })()
    return base * radiusBoost
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    orientation,
    stageWidth,
    stageHeight,
    sideWidth,
    sideHeight,
    height,
    centerScale,
    angleStep,
    maxVisibleOffset,
    radiusBoost,
    maxRotation,
    spacingCurve,
    radiusWidthUsage,
  ])

  const effectiveRadius = radiusProp ?? autoRadius

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!autoPlayInterval) return
    timerRef.current = setInterval(() => {
      setCenterIndex((i) => (i + 1) % items.length)
    }, autoPlayInterval)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [autoPlayInterval, items.length])

  const goTo = (i: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (autoPlayInterval) {
      timerRef.current = setInterval(() => {
        setCenterIndex((prev) => (prev + 1) % items.length)
      }, autoPlayInterval)
    }
    setCenterIndex(((i % items.length) + items.length) % items.length)
  }

  const prev = () => goTo(centerIndex - 1)
  const next = () => goTo(centerIndex + 1)

  const active = items[centerIndex]

  // Explicit pixel height for the vertical stage, computed the same way
  // card sizing already is (from the JS-measured rootHeight), rather than
  // a CSS "100%" — percentage heights are unreliable here since the mobile
  // section uses h-auto/min-h, which doesn't guarantee a definite height
  // for descendants to resolve percentages against.
  //
  // Crucially this also enforces a MINIMUM buffer above the center card's
  // own rendered height (height * centerScale) so the top/bottom cards —
  // which sit further out via translateZ/rotateX — always have room inside
  // the stage box to actually render. Without this floor, rootHeight can
  // end up barely larger than the center card itself, pushing the side
  // cards right to (or past) the stage edge where they get clipped away
  // entirely instead of peeking through.
  const verticalStageMinHeight = height * centerScale + sideHeight * 1.6 + 80
  const verticalStageHeight = Math.max(
    verticalStageMinHeight,
    fillHeight && rootHeight > 0 ? rootHeight - bottomHeight : viewport.h * 0.55,
  )

  return (
    <div
      ref={rootRef}
      className={`flex h-full w-full min-h-0 flex-col justify-center transition-all duration-1000 ease-out ${
        mounted ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      } ${className}`}
    >
      {/* Stage */}
      <div
        ref={stageRef}
        className="relative mx-auto shrink-0"
        style={
          orientation === "vertical"
            ? {
                perspective: "1200px",
                width: width * centerScale + 40,
                height: verticalStageHeight,
              }
            : {
                perspective: "1200px",
                width: "100%",
                height: height * centerScale + 60,
              }
        }
      >
        <div className="absolute inset-0">
          {items.map((item, i) => {
            let offset = i - centerIndex
            const half = items.length / 2
            if (offset > half) offset -= items.length
            if (offset < -half) offset += items.length

            const absOffset = Math.abs(offset)
            if (absOffset > maxVisibleOffset) return null

            const rotateVal = Math.sign(offset) * angleForOffset(absOffset)
            const isCenter = absOffset === 0
            // Steeper falloff so farther cards clearly recede rather than
            // sitting at near-equal size/opacity to their inner neighbor.
            // Side cards are dimmed further on mobile specifically, since
            // they sit closer to the faded stage edge and a fully-opaque
            // card there reads as an abrupt cutoff rather than a recede.
            const opacity = isCenter ? 1 : absOffset === 1 ? (isMobile ? 0.75 : 0.85) : 0.35
            const cardW = isCenter ? width : sideWidth
            const cardH = isCenter ? height : sideHeight
            const scale = (isCenter ? centerScale : 1) * (1 - absOffset * 0.1)

            return (
              <div
                key={item.src + i}
                className="absolute left-1/2 top-1/2 transition-transform duration-700 ease-out"
                style={{
                  width: cardW,
                  height: cardH,
                  marginLeft: -cardW / 2,
                  marginTop: -cardH / 2,
                  transform:
                    orientation === "vertical"
                      ? `rotateX(${-rotateVal}deg) translateZ(${effectiveRadius}px) scale(${scale})`
                      : `rotateY(${rotateVal}deg) translateZ(${effectiveRadius}px) scale(${scale})`,
                  transformStyle: "flat",
                  backfaceVisibility: "hidden",
                  opacity,
                  zIndex: 100 - absOffset,
                  transitionProperty: "transform, opacity, width, height, margin",
                }}
              >
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={item.title ? `Show ${item.title}` : `Show slide ${i + 1}`}
                  className={`relative block h-full w-full overflow-hidden rounded-2xl transition-shadow duration-300 ${
                    isCenter
                      ? "shadow-[0_28px_70px_rgba(16,36,62,0.24)] ring-2 ring-teal/30"
                      : "shadow-[0_10px_25px_rgba(16,36,62,0.12)] cursor-pointer"
                  }`}
                >
                  <Image
                    src={item.src}
                    alt={item.alt ?? ""}
                    fill
                    sizes={`${cardWidth}px`}
                    className="scale-[1.08] object-cover"
                  />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Arrows + caption + dots */}
      {/* <div ref={bottomRef} className="shrink-0">
        <div className="mx-auto mt-4 flex max-w-xl items-center justify-center gap-4 sm:gap-6">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/15 text-ink/60 transition-colors hover:border-ink/30 hover:text-ink"
          >
            <ChevronLeft size={18} />
          </button>

          <div key={centerIndex} className="min-w-0 flex-1 text-center transition-opacity duration-500">
            {active?.title && (
              <p className="font-display text-2xl leading-none text-ink sm:text-3xl">{active.title}</p>
            )}
            {active?.description && (
              <p className="mx-auto mt-2 max-w-md font-body text-xs text-ink/60 sm:text-sm">
                {active.description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={next}
            aria-label="Next"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/15 text-ink/60 transition-colors hover:border-ink/30 hover:text-ink"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="mt-3 flex justify-center gap-2">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Show image ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === centerIndex ? "w-6 bg-teal" : "w-1.5 bg-teal/20 hover:bg-teal/40"
              }`}
            />
          ))}
        </div>
      </div> */}
    </div>
  )
}