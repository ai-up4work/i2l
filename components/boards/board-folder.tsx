"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ImageOff } from "lucide-react"

import { MenuButton } from "./menu-button"

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

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

function useFanPositions(count: number) {
  return useMemo(() => {
    const totalSpread = 165
    const step = count > 1 ? totalSpread / (count - 1) : 0
    const startX = -totalSpread / 2
    return Array.from({ length: count }, (_, i) => {
      const x = count > 1 ? startX + step * i : 0
      const normalized = count > 1 ? (i / (count - 1)) * 2 - 1 : 0
      return { x, rotate: normalized * 11 }
    })
  }, [count])
}

const SLOT_COUNT = 5

export function BoardFolder({ name, items, onClick, onAddItems, onDelete }: BoardFolderProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const source = useMemo(() => items.slice().reverse(), [items])
  const positions = useFanPositions(SLOT_COUNT)
  const hasItems = items.length > 0
  const isActive = isHovered && !isMenuOpen

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-menu]")) return
    onClick?.()
  }

  const handleMenuOpenChange = (open: boolean) => {
    setIsMenuOpen(open)
    if (!open) setIsHovered(false)
  }

  return (
    <div
      className="group relative w-[288px] cursor-pointer"
      onMouseEnter={() => !isMenuOpen && setIsHovered(true)}
      onMouseLeave={() => !isMenuOpen && setIsHovered(false)}
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
      {/* Resting shadow — darker/tighter by default, lifts and softens on
          hover so the card visually "brightens" as it activates, matching
          the reference's darker-at-rest / lit-up-on-hover feel. */}
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
            top edge on hover; horizontal fan math keeps things visually
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
              const item = hasItems ? source[i % source.length] : null

              const centerIndex = 2
              const distanceFromCenter = Math.abs(i - centerIndex)
              const zIndex = 10 - distanceFromCenter
              const brightness = distanceFromCenter === 0 ? 1 : distanceFromCenter === 1 ? 0.55 : 0.3
              const blurAmount = distanceFromCenter === 0 ? 0 : distanceFromCenter === 1 ? 0.5 : 1.5
              const yOffset = -16 * (1 - distanceFromCenter / centerIndex) || 0
              const scale = distanceFromCenter === 0 ? 1.05 : distanceFromCenter === 1 ? 0.95 : 0.88

              const xPos = isActive ? pos.x * 1.4 : pos.x
              const yPos = (isActive ? -18 : 8) + yOffset
              const rotation = isActive ? pos.rotate * 1.4 : pos.rotate
              const finalScale = isActive ? scale * 1.05 : scale

              // Resting state reads slightly darker/dimmer overall (on top of
              // the per-image brightness falloff), so hovering feels like the
              // card genuinely "lights up" rather than just spreading out.
              const restingDim = isActive ? 1 : 0.82

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
                  <div className="h-[160px] w-[100px] overflow-hidden rounded-lg bg-ink/[0.04]">
                    {item?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <motion.img
                        src={item.image}
                        alt={item.title}
                        className="h-full w-full object-cover"
                        animate={{
                          filter: `brightness(${(isActive ? Math.min(1, brightness + 0.2) : brightness) * restingDim}) contrast(1.08) saturate(${1 - distanceFromCenter * 0.2}) blur(${isActive ? 0 : blurAmount}px)`,
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

        {/* Front panel — glass, sits on top of the images. The front panel
            caps the images from below via z-index, while the top stays
            genuinely uncapped, producing the peeking-out cascade. */}
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
                  onOpenChange={handleMenuOpenChange}
                  isVisible={isHovered || isMenuOpen}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}