/**
 * components/ui/AccordionGallery.tsx
 *
 * Single-file TS port of the original AccordionGallery.jsx + .css: same
 * GSAP-driven flex-grow / tilt / parallax / label-stagger behavior, just
 * merged into one file (styles injected via a <style> tag instead of a
 * separate .css import) and typed.
 *
 * Requires the `gsap` package: npm install gsap
 *
 * FIX (height prop): `height` now accepts number | string. Previously it
 * was typed/used as `number` only, so callers passing a percentage string
 * (e.g. ItemImageStack.tsx's `height="100%"`) produced an invalid CSS
 * value like "100%px" via the `${height}px` template literal. The browser
 * silently drops invalid declarations, so the root div's height fell back
 * to `auto`. Since every panel's visual content is absolutely positioned
 * (`.ag-panel__frame { position: absolute; inset: 0 }`), it contributes no
 * intrinsic height, so the whole gallery collapsed to 0px tall — rendered,
 * but invisible. Numbers are still suffixed with `px`; strings are passed
 * through untouched so percentages, `vh`, etc. all work.
 *
 * FIX (mobile forced to vertical): the small-viewport media query used to
 * unconditionally set `flex-direction: column` on `.accordion-gallery`
 * below 520px, plus `height: auto !important`. That overrides the
 * `orientation` prop based on the *screen's* width, not the component's
 * own — so a caller that explicitly asked for `orientation="horizontal"`
 * (ItemImageStack.tsx always does; it never passes "vertical") still got
 * stacked top-to-bottom on any phone-width viewport, and the
 * `height: auto !important` would have silently discarded whatever real
 * height the caller passed in (e.g. ItemImageStack's `height="100%"`,
 * which is what makes the wrapper's own h-24/h-40 apply in the first
 * place). Orientation is a layout decision the caller already makes
 * explicitly via the `orientation` prop / `--vertical` class; it isn't
 * something screen width should silently flip. The media query now only
 * keeps the touch-friendly simplifications that were actually about
 * motion, not direction: no 3D tilt/perspective on small screens (the
 * pointer-driven parallax reads as jank rather than depth on touch), and
 * a min-height floor for vertical-orientation instances. Horizontal
 * galleries keep their row layout and real height at every width.
 *
 * FIX (active image cropped, then letterboxed): `.ag-panel__media img`
 * always used `object-fit: cover`, so even the active/expanded panel
 * filled its box and cropped whatever didn't fit. A first pass fixed
 * that by switching the active panel to `object-fit: contain` inside
 * its existing (fixed-ratio) box — that stopped the cropping, but for
 * any image whose aspect ratio didn't match the box, `contain` just
 * pads the difference with solid color bars instead (visible as a
 * black/overlay-colored band down the side, same underlying box, image
 * shrunk to fit inside it).
 *
 * This pass removes the bars by letting the *box itself* take on the
 * image's aspect ratio instead of padding around a fixed one. The
 * active panel is measured against the gallery's own height (i.e. its
 * cross-axis size), each image's natural aspect ratio is read off it
 * once loaded, and the active panel's flex-basis is set to
 * `height * aspectRatio` (clamped so it can't crowd out the other
 * panels below their `railMinSize` floor). Since the box's own shape
 * now matches the image, `object-fit: contain` and `cover` produce the
 * same result — no crop, no bars. Inactive panels are untouched: they
 * stay on the original flexGrow-share sizing and `cover`, since a
 * 24–32px rail is too thin for aspect-fit to read as intentional.
 * Vertical orientation mirrors this on the height axis.
 *
 * FIX (label text too large, two passes): `.ag-panel__text` /
 * `.ag-panel__subtext` were originally sized for a large hero panel
 * (clamp up to 1.4rem / 0.8rem flat), which read oversized — and on
 * narrow rails (mobile's ~88–160px wide active panel, see
 * ItemImageStack.tsx's railMinSize override) could crowd or overflow
 * the panel, relying on the ellipsis/`overflow: hidden` to hide the
 * excess rather than the text actually fitting comfortably. A first
 * pass brought this down to clamp(0.75rem, 1vw, 0.95rem) / 0.65rem;
 * this second pass goes smaller still — clamp(0.6rem, 0.8vw, 0.75rem)
 * / 0.55rem — near the practical floor for a legible product-name
 * label. The accent bar and label inset/gap are scaled down to match
 * at each pass so the whole label block stays proportional rather than
 * ending up with oversized spacing around shrunken text.
 */
'use client'

import { useRef, useEffect, useState, useCallback, useId, useMemo } from 'react'
import { gsap } from 'gsap'

export interface AccordionGalleryItem {
  image: string
  label?: string
  /** Optional alt text; falls back to `label` if omitted. */
  alt?: string
  /** Optional href — clicking an already-active panel navigates there. */
  link?: string
  /** Optional second line shown under the label (not in the original; added for callers like order/qty rows). */
  subtitle?: string
}

export interface AccordionGalleryProps {
  items?: AccordionGalleryItem[]
  defaultIndex?: number
  accentColor?: string
  overlayColor?: string
  textColor?: string
  /** Number (treated as px) or any valid CSS length/percentage string, e.g. "100%", "50vh". */
  height?: number | string
  gap?: number
  radius?: number
  expandRatio?: number
  orientation?: 'horizontal' | 'vertical'
  duration?: number
  ease?: string
  parallax?: number
  tilt?: number
  stagger?: number
  trigger?: 'hover' | 'click'
  showLabels?: boolean
  grayscale?: boolean
  className?: string
  /**
   * Minimum width (or height, in vertical orientation) an inactive rail
   * is allowed to shrink to, in px. Below this a panel stops reading as
   * "a photo" and just looks like a colored line — see the FIX note in
   * this file's header. If the container can't fit every item at this
   * minimum, the row scrolls horizontally instead of shrinking further.
   * Default 28.
   */
  railMinSize?: number
  /**
   * When true, the active panel shows its image fully (no crop) by
   * sizing its own box to the image's natural aspect ratio, instead of
   * the default `cover`-and-crop. The active panel's width (or height,
   * vertical orientation) is derived from the image's aspect ratio and
   * the gallery's cross-axis size, then clamped so the other panels
   * never shrink below `railMinSize`. Falls back to the original
   * `expandRatio`-based share until each image's natural size is known
   * (first paint / before load). Inactive rails always stay `cover`
   * regardless of this flag — they're too thin for aspect-fit to read
   * as intentional. Default true.
   */
  fitActiveImage?: boolean
  /**
   * Upper bound on how much of the gallery's main-axis size the active
   * panel's aspect-fit width (height, vertical) is allowed to claim,
   * as a fraction 0–1, on top of the railMinSize floor already reserved
   * for the other panels. Prevents a very wide/panoramic image from
   * swallowing the whole row. Default 0.85.
   */
  maxActiveFraction?: number
}

const DEFAULT_ITEMS: AccordionGalleryItem[] = [
  { image: 'https://picsum.photos/id/1015/900/1200', label: 'Canyon', link: '#' },
  { image: 'https://picsum.photos/id/1018/900/1200', label: 'Ridgeline', link: '#' },
  { image: 'https://picsum.photos/id/1039/900/1200', label: 'Falls', link: '#' },
  { image: 'https://picsum.photos/id/1043/900/1200', label: 'Harbour', link: '#' },
  { image: 'https://picsum.photos/id/1044/900/1200', label: 'Skyline', link: '#' },
]

// Inlined from AccordionGallery.css — identical rules, just injected as a
// <style> tag so the whole component ships as one file. Scoped under
// .accordion-gallery / .ag-panel* class names exactly as before, so it
// still works if you'd rather move this back out into a real stylesheet.
const STYLES = `
.accordion-gallery {
  --ag-accent: #ffffff;
  --ag-overlay: #060010;
  --ag-text: #ffffff;
  --ag-gap: 10px;
  --ag-radius: 16px;
  --ag-media-size: 320px;

  display: flex;
  flex-direction: row;
  gap: var(--ag-gap);
  width: 100%;
  max-width: 100%;
  perspective: 1400px;
  perspective-origin: 50% 50%;
  /* If panels can't all honor --ag-rail-min at once, scroll instead of
     crushing inactive panels down to imperceptible slivers. */
  overflow-x: auto;
  overflow-y: hidden;
}

.accordion-gallery--vertical {
  flex-direction: column;
}

.accordion-gallery--vertical .ag-panel {
  /* In column layout, flex-basis operates on height, so the width floor
     above doesn't constrain rail size — need the equivalent on height. */
  min-width: 0;
  min-height: var(--ag-rail-min, 28px);
}

.ag-panel {
  position: relative;
  flex: 1 1 0;
  /* A hard floor so an inactive rail never shrinks below a size where
     it still visibly reads as "a photo" rather than a colored line.
     Set per-instance via the --ag-rail-min CSS var (see the component's
     inline style below); 28px is the fallback if that isn't set. */
  min-width: var(--ag-rail-min, 28px);
  min-height: 0;
  overflow: hidden;
  border-radius: var(--ag-radius);
  cursor: pointer;
  display: block;
  text-decoration: none;
  outline: none;
  transform-style: preserve-3d;
  transform-origin: center center;
  background: #0a0713;
  box-shadow: 0 10px 30px -18px rgba(0, 0, 0, 0.8);
  will-change: flex-grow, flex-basis, transform;
  -webkit-tap-highlight-color: transparent;
}

.ag-panel:focus-visible {
  box-shadow:
    0 0 0 2px var(--ag-accent),
    0 10px 30px -18px rgba(0, 0, 0, 0.8);
}

.ag-panel__frame {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
}

.ag-panel__media {
  --ag-gray: 1;
  --ag-dim: 0.35;
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--ag-media-size);
  height: 100%;
  filter: grayscale(var(--ag-gray));
  will-change: transform, filter;
}

.accordion-gallery--vertical .ag-panel__media {
  width: 100%;
  height: var(--ag-media-size);
}

.ag-panel__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}

/* FIX: the active panel's own box is now sized (via inline flex-basis,
   set from JS using the image's natural aspect ratio — see
   applyLayout/resolveActiveBasis below) to match the image's aspect
   ratio, so there's no leftover box space left to pad with letterbox
   bars in the first place. The media element just needs to fill that
   box exactly; object-fit stays effectively a no-op (contain/cover
   agree once the box's ratio matches the image's), so no bars, no
   crop. Inactive rails are untouched: still the fixed --ag-media-size
   box with object-fit: cover, since they're too thin for aspect-fit to
   look intentional. */
.ag-panel--fit-active.ag-panel--active .ag-panel__media {
  width: 100%;
}

.accordion-gallery--vertical .ag-panel--fit-active.ag-panel--active .ag-panel__media {
  height: 100%;
}

.ag-panel--fit-active.ag-panel--active .ag-panel__media img {
  object-fit: contain;
}

.ag-panel__overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, transparent 45%, color-mix(in srgb, var(--ag-overlay) 78%, transparent) 100%),
    color-mix(in srgb, var(--ag-overlay) calc(var(--ag-dim, 0.35) * 100%), transparent);
}

/* FIX (label text too large, pass 2): inset tightened from 14px to
   10px and gap from 8px to 6px to match the smaller type below. */
.ag-panel__label {
  position: absolute;
  left: 10px;
  bottom: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: none;
  z-index: 2;
}

/* FIX (label text too large, pass 2): bar shrunk from 3px/18px to
   2px/13px to stay proportional to the smaller text. */
.ag-panel__bar {
  flex: 0 0 auto;
  width: 2px;
  height: 13px;
  border-radius: 2px;
  background: var(--ag-accent);
  opacity: 0;
  box-shadow: 0 0 8px color-mix(in srgb, var(--ag-accent) 60%, transparent);
}

/* FIX (label text too large, pass 2): font-size reduced from
   clamp(0.75rem, 1vw, 0.95rem) to clamp(0.6rem, 0.8vw, 0.75rem) — near
   the floor for a still-legible product-name label on a narrow rail. */
.ag-panel__text {
  color: var(--ag-text);
  font-family: inherit;
  font-weight: 600;
  font-size: clamp(0.6rem, 0.8vw, 0.75rem);
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.55);
}

/* FIX (label text too large, pass 2): font-size reduced from 0.65rem
   to 0.55rem, matching .ag-panel__text's reduction above. */
.ag-panel__subtext {
  color: var(--ag-text);
  font-family: inherit;
  font-weight: 500;
  font-size: 0.55rem;
  opacity: 0.85;
  white-space: nowrap;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.55);
}

/* FIX: previously this forced .accordion-gallery (with NO qualifier)
   into flex-direction: column below 520px, and set height: auto
   !important — both of which silently overrode the orientation prop
   and the caller's real height on every phone-width screen, regardless
   of whether the caller asked for a horizontal, fixed-height gallery.
   That's what made ItemImageStack's mobile rail (explicitly
   orientation="horizontal") stack top-to-bottom instead of staying a
   side-by-side row.

   Layout direction should only ever come from the orientation prop
   (i.e. the .accordion-gallery--vertical class below), not from screen
   width. What's left here is only the touch-appropriate motion
   simplification: no 3D tilt/perspective on small screens, since
   pointer-driven parallax/tilt reads as jank rather than depth on
   touch. A vertical-orientation instance still gets a sensible rail
   floor on small screens; horizontal instances keep their row layout
   and whatever height the caller specified, at every width. */
@media (max-width: 520px) {
  .accordion-gallery {
    perspective: none;
  }
  .ag-panel {
    transform: none !important;
  }
  .accordion-gallery--vertical .ag-panel {
    min-height: 84px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ag-panel,
  .ag-panel__media {
    will-change: auto;
  }
}
`

// Normalizes the `height` prop into a valid CSS length. Numbers are
// treated as px (optionally scaled for the vertical orientation, same as
// before); strings (e.g. "100%", "50vh", "24rem") are passed through
// untouched so they resolve against whatever the parent provides.
function resolveHeight(height: number | string, vertical: boolean): string {
  if (typeof height === 'number') {
    const px = vertical ? Math.round(height * 1.6) : height
    return `${px}px`
  }
  return height
}

export default function AccordionGallery({
  items = DEFAULT_ITEMS,
  defaultIndex = 2,
  accentColor = '#ffffff',
  overlayColor = '#060010',
  textColor = '#ffffff',
  height = 460,
  gap = 10,
  radius = 16,
  expandRatio = 0.52,
  orientation = 'horizontal',
  duration = 0.6,
  ease = 'power3.out',
  parallax = 0.5,
  tilt = 8,
  stagger = 0.06,
  trigger = 'hover',
  showLabels = true,
  grayscale = true,
  className = '',
  railMinSize = 28,
  fitActiveImage = true,
  maxActiveFraction = 0.85,
}: AccordionGalleryProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRefs = useRef<(HTMLElement | null)[]>([])
  const mediaRefs = useRef<(HTMLElement | null)[]>([])
  const barRefs = useRef<(HTMLElement | null)[]>([])
  const textRefs = useRef<(HTMLElement | null)[]>([])
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  const firstRunRef = useRef(true)
  const mediaSizeRef = useRef(320)
  const containerSizeRef = useRef({ width: 0, height: 0 })
  const styleTagId = useId().replace(/[:]/g, '')

  const vertical = orientation === 'vertical'
  const count = items.length
  const [active, setActive] = useState(Math.min(Math.max(defaultIndex, 0), count - 1))

  // Natural aspect ratio (naturalWidth / naturalHeight) of each item's
  // image, filled in as each <img> resolves its intrinsic size. null
  // until known, in which case the active panel falls back to the old
  // expandRatio-based share (see applyLayout) rather than guessing.
  const itemsKey = useMemo(() => items.map((it) => it.image).join('|'), [items])
  const [aspects, setAspects] = useState<(number | null)[]>(() => items.map(() => null))
  useEffect(() => {
    setAspects(items.map(() => null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey])

  const setAspectAt = useCallback((i: number, ratio: number) => {
    setAspects((prev) => {
      if (prev[i] === ratio) return prev
      const next = prev.slice()
      next[i] = ratio
      return next
    })
  }, [])

  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  const applyLayout = useCallback(
    (animate: boolean) => {
      const panels = panelRefs.current
      if (!panels.length) return

      const r = Math.min(Math.max(expandRatio, 0.2), 0.9)
      const fallbackGrow = count > 1 ? (r * (count - 1)) / (1 - r) : 1
      const mediaSize = mediaSizeRef.current
      const { width: containerW, height: containerH } = containerSizeRef.current
      const crossSize = vertical ? containerW : containerH // the axis the active panel's aspect-fit is derived from
      const mainSize = vertical ? containerH : containerW // the axis the active panel's basis is expressed in

      // How much main-axis space the active panel is allowed to take:
      // whatever's left after every *other* panel keeps its railMinSize
      // floor (plus the gaps between all of them), capped further by
      // maxActiveFraction so one very wide image can't swallow the row.
      const reservedForOthers = Math.max(0, count - 1) * railMinSize + Math.max(0, count - 1) * gap
      const hardMax = Math.max(railMinSize, mainSize - reservedForOthers)
      const softMax = Math.max(railMinSize, mainSize * Math.min(Math.max(maxActiveFraction, 0.1), 1))
      const activeMax = Math.min(hardMax, softMax)

      tlRef.current?.kill()
      const dur = animate && !prefersReduced ? duration : 0
      const tl = gsap.timeline()

      panels.forEach((panel, i) => {
        if (!panel) return
        const isActive = i === active
        const media = mediaRefs.current[i]
        const bar = barRefs.current[i]
        const text = textRefs.current[i]

        const rot = isActive ? 0 : i < active ? tilt : -tilt
        const rotProp = vertical ? { rotateX: -rot } : { rotateY: rot }

        const aspect = aspects[i] // width / height
        const useAspectFit = isActive && fitActiveImage && aspect && crossSize > 0
        let basisPx: number | null = null
        if (useAspectFit) {
          // vertical: basis is height, derived as crossSize(width) / aspect
          // horizontal: basis is width, derived as crossSize(height) * aspect
          const raw = vertical ? crossSize / (aspect as number) : crossSize * (aspect as number)
          basisPx = Math.min(activeMax, Math.max(railMinSize, raw))
        }

        if (basisPx != null) {
          tl.to(
            panel,
            { flexGrow: 0, flexShrink: 0, flexBasis: `${Math.round(basisPx)}px`, ...rotProp, duration: dur, ease },
            0
          )
        } else {
          // No known aspect yet (first paint) or fitActiveImage is off —
          // original grow-based share.
          tl.to(
            panel,
            { flexGrow: isActive ? fallbackGrow : 1, flexShrink: 1, flexBasis: 0, ...rotProp, duration: dur, ease },
            0
          )
        }

        if (media) {
          // Skip the pointer-parallax drift on an aspect-fit active
          // panel: its image is centered and exactly filling its own
          // box now, so nudging it off-center reads as a bug, not
          // depth. Inactive rails (always `cover`) keep the drift.
          const drift = Math.max(-1.5, Math.min(1.5, active - i))
          const shift = drift * parallax * mediaSize * 0.06
          const gray = grayscale ? (isActive ? 0 : 1) : 0
          const skipDrift = isActive && fitActiveImage
          tl.to(
            media,
            {
              xPercent: -50,
              yPercent: -50,
              x: vertical || skipDrift ? 0 : isActive ? 0 : shift,
              y: vertical ? (isActive && !skipDrift ? shift : 0) : 0,
              '--ag-gray': gray,
              '--ag-dim': isActive ? 0 : 0.35,
              duration: dur,
              ease,
            } as gsap.TweenVars,
            0
          )
        }

        if (showLabels && bar && text) {
          if (isActive) {
            tl.to([bar, text], { opacity: 1, x: 0, duration: dur, ease, stagger: prefersReduced ? 0 : stagger }, 0)
          } else {
            tl.to([bar, text], { opacity: 0, x: -14, duration: dur * 0.6, ease }, 0)
          }
        }
      })

      tlRef.current = tl
    },
    [
      active,
      count,
      expandRatio,
      duration,
      ease,
      vertical,
      tilt,
      parallax,
      grayscale,
      showLabels,
      stagger,
      prefersReduced,
      fitActiveImage,
      aspects,
      railMinSize,
      gap,
      maxActiveFraction,
    ]
  )

  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const measure = () => {
      const rect = el.getBoundingClientRect()
      containerSizeRef.current = { width: rect.width, height: rect.height }
      const total = vertical ? rect.height : rect.width
      const usable = Math.max(total - gap * (count - 1), 120)
      const size = Math.max(140, usable * Math.min(Math.max(expandRatio, 0.2), 0.9) * 1.22)
      mediaSizeRef.current = size
      el.style.setProperty('--ag-media-size', `${size}px`)
      applyLayout(!firstRunRef.current)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [applyLayout, gap, count, expandRatio, vertical])

  useEffect(() => {
    applyLayout(!firstRunRef.current)
    firstRunRef.current = false
  }, [applyLayout])

  useEffect(
    () => () => {
      tlRef.current?.kill()
    },
    []
  )

  const handleEnter = (i: number) => {
    if (trigger === 'hover') setActive(i)
  }

  const handleClick = (i: number, e: React.MouseEvent) => {
    if (i !== active) {
      e.preventDefault()
      setActive(i)
    }
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i + 1) % count)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i - 1 + count) % count)
    }
  }

  // Reads the image's intrinsic aspect ratio as soon as it's known.
  // Checked both via a callback ref (covers images that are already
  // cached/complete by the time React attaches the handler, which can
  // otherwise miss the load event entirely) and via onLoad (covers the
  // normal not-yet-cached case).
  const makeImgRefCallback = (i: number) => (el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth && el.naturalHeight) {
      setAspectAt(i, el.naturalWidth / el.naturalHeight)
    }
  }
  const makeImgOnLoad = (i: number) => (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget
    if (el.naturalWidth && el.naturalHeight) {
      setAspectAt(i, el.naturalWidth / el.naturalHeight)
    }
  }

  return (
    <div
      ref={rootRef}
      className={`accordion-gallery${vertical ? ' accordion-gallery--vertical' : ''}${className ? ` ${className}` : ''}`}
      style={
        {
          '--ag-accent': accentColor,
          '--ag-overlay': overlayColor,
          '--ag-text': textColor,
          '--ag-gap': `${gap}px`,
          '--ag-radius': `${radius}px`,
          '--ag-rail-min': `${railMinSize}px`,
          height: resolveHeight(height, vertical),
        } as React.CSSProperties
      }
      role="list"
      aria-label="Image accordion gallery"
    >
      <style id={`ag-styles-${styleTagId}`}>{STYLES}</style>

      {items.map((item, i) => {
        const isActive = i === active
        const Tag: any = item.link ? 'a' : 'div'
        return (
          <Tag
            key={i}
            ref={(el: HTMLElement | null) => { panelRefs.current[i] = el }}
            className={`ag-panel${isActive ? ' ag-panel--active' : ''}${fitActiveImage ? ' ag-panel--fit-active' : ''}`}
            style={{ borderRadius: `${radius}px` }}
            href={item.link || undefined}
            onClick={(e: React.MouseEvent) => handleClick(i, e)}
            onMouseEnter={() => handleEnter(i)}
            onFocus={() => setActive(i)}
            onKeyDown={(e: React.KeyboardEvent) => handleKeyDown(i, e)}
            role="listitem"
            tabIndex={0}
            aria-current={isActive ? 'true' : undefined}
            aria-label={item.label}
          >
            <span className="ag-panel__frame">
              <span className="ag-panel__media" ref={(el: HTMLElement | null) => { mediaRefs.current[i] = el }}>
                <img
                  ref={makeImgRefCallback(i)}
                  src={item.image}
                  alt={item.alt || item.label || ''}
                  draggable={false}
                  onLoad={makeImgOnLoad(i)}
                />
              </span>
              <span className="ag-panel__overlay" aria-hidden="true" />
            </span>
            {showLabels && (
              <span className="ag-panel__label" aria-hidden="true">
                <span className="ag-panel__bar" ref={(el: HTMLElement | null) => { barRefs.current[i] = el }} />
                <span className="flex flex-col">
                  <span className="ag-panel__text" ref={(el: HTMLElement | null) => { textRefs.current[i] = el }}>
                    {item.label}
                  </span>
                  {item.subtitle && <span className="ag-panel__subtext">{item.subtitle}</span>}
                </span>
              </span>
            )}
          </Tag>
        )
      })}
    </div>
  )
}