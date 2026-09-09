"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { ImageOff } from "lucide-react"

import { MenuButton } from "./menu-button"

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const
const MAX_SLOTS = 5

interface BoardFolderItem {
  image?: string | null
  title: string
}

interface BoardFolderProps {
  name: string
  items: BoardFolderItem[]
  onClick?: () => void
  onAddItems?: () => void
  onDelete?: () => void
}

// Fan geometry for an arbitrary slot count (1–5). totalSpread stays fixed
// regardless of count, so the outermost slot always lands at the same ±edge
// position whether there are 2 items or 5 — the "outer line" never moves,
// only how many slots sit between those edges changes. Works for both odd
// and even counts since centering is purely math-based, not a hardcoded
// middle index.
function useFanPositions(count: number) {
  return useMemo(() => {
    const totalSpread = 165
    if (count <= 1) return [{ x: 0, rotate: 0 }]
    const step = totalSpread / (count - 1)
    const startX = -totalSpread / 2
    return Array.from({ length: count }, (_, i) => {
      const x = startX + step * i
      const normalized = (i / (count - 1)) * 2 - 1 // -1 (leftmost) to 1 (rightmost)
      return { x, rotate: normalized * 11 }
    })
  }, [count])
}

// Image slot size scales up as fewer items are present — with only 1-2
// items there's empty fan space to spend on making the artwork bigger,
// instead of leaving it at the same size used for a full 5-item fan.
function useSlotSize(count: number) {
  return useMemo(() => {
    const clamped = Math.max(1, Math.min(MAX_SLOTS, count))
    const steps = MAX_SLOTS - clamped // 0 at count=5, up to 4 at count=1
    const width = 100 + steps * 10
    const height = 160 + steps * 15
    return { width, height }
  }, [count])
}

// Detects touch/coarse-pointer devices — on these, hover never fires, so
// "active" (fanned-out) state is instead driven by scroll position (see
// useIsNearViewportCenter) rather than mouse enter/leave.
function useIsCoarsePointer() {
  const [isCoarse, setIsCoarse] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia("(hover: none), (pointer: coarse)")
    setIsCoarse(mql.matches)
    const listener = (e: MediaQueryListEvent) => setIsCoarse(e.matches)
    mql.addEventListener("change", listener)
    return () => mql.removeEventListener("change", listener)
  }, [])
  return isCoarse
}

// On touch devices, boards stack in a single column, so instead of hover we
// auto-activate whichever card currently sits nearest the vertical center of
// the viewport as the user scrolls. Implemented with an IntersectionObserver
// watching a thin horizontal band at the viewport's vertical center
// (rootMargin "-45% 0px -45% 0px" collapses the root to that band) — a card
// is "active" whenever it overlaps that band. Only one card typically
// overlaps a thin-enough band at a time.
function useIsNearViewportCenter(enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [isNearCenter, setIsNearCenter] = useState(false)

  useEffect(() => {
    if (!enabled || !ref.current) {
      setIsNearCenter(false)
      return
    }
    const node = ref.current
    const observer = new IntersectionObserver(
      ([entry]) => setIsNearCenter(entry.isIntersecting),
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled])

  return { ref, isNearCenter }
}

// ---------------------------------------------------------------------------
// Shared visual — the image fan + glass name panel. Used identically for
// both the desktop hover state and the mobile scroll-center state.
// ---------------------------------------------------------------------------

function BoardFolderVisual({
  name,
  items,
  isActive,
  onMenuOpenChange,
  isMenuVisible,
  onAddItems,
  onDelete,
}: {
  name: string
  items: BoardFolderItem[]
  isActive: boolean
  onMenuOpenChange?: (open: boolean) => void
  isMenuVisible?: boolean
  onAddItems?: () => void
  onDelete?: () => void
}) {
  const source = useMemo(() => items.slice().reverse().slice(0, MAX_SLOTS), [items])
  const slotCount = source.length
  const positions = useFanPositions(slotCount)
  const { width: slotWidth, height: slotHeight } = useSlotSize(slotCount)

  const centerIndex = (slotCount - 1) / 2
  const maxDistance = centerIndex || 1

  return (
    <motion.div
      className="relative w-[288px]"
      style={{ perspective: "1200px" }}
      animate={{
        filter: isActive
          ? "drop-shadow(0 20px 30px rgba(32,36,43,0.16)) drop-shadow(0 4px 8px rgba(32,36,43,0.08))"
          : "drop-shadow(0 8px 12px rgba(32,36,43,0.22)) drop-shadow(0 2px 4px rgba(32,36,43,0.12))",
      }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
    >
      {/* Back panel — NOT clipped. Images are meant to peek up above the
          top edge when active; horizontal fan math keeps things visually
          contained instead of relying on overflow-hidden. */}
      <motion.div
        className="relative z-0 rounded-2xl"
        animate={{
          rotateX: isActive ? 15 : 0,
          backgroundColor: isActive ? "var(--color-card)" : "#f4efe4",
        }}
        transition={{
          rotateX: { type: "spring", stiffness: 200, damping: 25, mass: 0.8 },
          backgroundColor: { duration: 0.35, ease: EASE_OUT_EXPO },
        }}
        style={{
          height: "224px",
          border: "1px solid rgba(32, 36, 43, 0.06)",
          transformStyle: "preserve-3d",
          transformOrigin: "center bottom",
        }}
      >
        <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
          {positions.map((pos, i) => {
            const item = source[i]

            const distanceFromCenter = Math.abs(i - centerIndex)
            const ratio = distanceFromCenter / maxDistance // 0 at center → 1 at edge

            const zIndex = Math.round((maxDistance - distanceFromCenter) * 10) + 1
            const brightness = 1 - ratio * 0.45
            const blurAmount = ratio * 1.5
            const yOffset = -16 * (1 - ratio)
            const scale = 1.05 - ratio * 0.17

            const xPos = isActive ? pos.x * 1.4 : pos.x
            const yPos = (isActive ? -18 : 8) + yOffset
            const rotation = isActive ? pos.rotate * 1.4 : pos.rotate
            const finalScale = isActive ? scale * 1.05 : scale

            const restingDim = isActive ? 1 : 0.9

            return (
              <motion.div
                key={i}
                className="absolute left-1/2 top-0"
                initial={false}
                animate={{
                  x: `calc(-50% + ${xPos}px)`,
                  y: yPos,
                  rotate: rotation,
                  scale: finalScale,
                  opacity: item ? 1 : 0,
                }}
                transition={{
                  type: "spring",
                  stiffness: 100,
                  damping: 16,
                  mass: 1,
                  delay: distanceFromCenter * 0.03,
                }}
                style={{ zIndex }}
              >
                <div
                  className="overflow-hidden rounded-lg bg-ink/[0.04]"
                  style={{ width: slotWidth, height: slotHeight }}
                >
                  {item?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <motion.img
                      src={item.image}
                      alt={item.title}
                      className="h-full w-full object-cover"
                      animate={{
                        filter: `brightness(${(isActive ? Math.min(1, brightness + 0.35) : brightness) * restingDim}) contrast(1.08) saturate(${1 - ratio * 0.2}) blur(${isActive ? 0 : blurAmount}px)`,
                      }}
                      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                    />
                  ) : item ? (
                    <div className="grid h-full w-full place-items-center">
                      <ImageOff size={16} className="text-ink/15" />
                    </div>
                  ) : null}
                </div>
              </motion.div>
            )
          })}
        </div>
      </motion.div>

      {/* Front panel — glass, sits on top of the images. */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-10 rounded-2xl overflow-hidden"
        animate={{
          rotateX: isActive ? -25 : 0,
          backgroundColor: isActive ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.7)",
        }}
        transition={{
          rotateX: { type: "spring", stiffness: 180, damping: 22, mass: 0.8 },
          backgroundColor: { duration: 0.35, ease: EASE_OUT_EXPO },
        }}
        style={{
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(32, 36, 43, 0.06)",
          transformStyle: "preserve-3d",
          transformOrigin: "center bottom",
        }}
      >
        <div className="py-4 px-4">
          <h3 className="font-semibold text-ink/70 text-base leading-snug line-clamp-2 min-h-[2.75rem] transition-colors duration-200 group-hover:text-ink">
            {name}
          </h3>
        </div>
        <div className="relative h-[48px]">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-ink/[0.06]" />
          <div className="absolute inset-0 flex items-center justify-between px-4 pr-2">
            <span className="text-[13px] text-ink/60">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
            <div className="flex items-center gap-2">
              <span
                className="text-[13px] text-teal-deep transition-opacity duration-200"
                style={{ opacity: isActive ? 1 : 0 }}
              >
                See board
              </span>
              <MenuButton
                onAddItems={onAddItems}
                onDelete={onDelete}
                onOpenChange={onMenuOpenChange ?? (() => {})}
                isVisible={!!isMenuVisible}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Grid card. Desktop: hover fans it out, click navigates (unchanged).
// Mobile/touch: no hover exists, so the card fans out automatically once it
// scrolls near the vertical center of the viewport; a tap navigates as
// usual, same as desktop.
// ---------------------------------------------------------------------------

export function BoardFolder({ name, items, onClick, onAddItems, onDelete }: BoardFolderProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isCoarsePointer = useIsCoarsePointer()
  const { ref: centerRef, isNearCenter } = useIsNearViewportCenter(isCoarsePointer)

  const isActive = isCoarsePointer ? isNearCenter && !isMenuOpen : isHovered && !isMenuOpen

  const handleMenuOpenChange = (open: boolean) => {
    setIsMenuOpen(open)
    if (!open) setIsHovered(false)
  }

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-menu]")) return
    onClick?.()
  }

  return (
    <div
      ref={centerRef}
      className="group relative mt-3 w-[288px] cursor-pointer sm:mt-0"
      onMouseEnter={() => !isCoarsePointer && !isMenuOpen && setIsHovered(true)}
      onMouseLeave={() => !isCoarsePointer && !isMenuOpen && setIsHovered(false)}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      <BoardFolderVisual
        name={name}
        items={items}
        isActive={isActive}
        onMenuOpenChange={handleMenuOpenChange}
        isMenuVisible={isHovered || isMenuOpen || isNearCenter}
        onAddItems={onAddItems}
        onDelete={onDelete}
      />
    </div>
  )
}