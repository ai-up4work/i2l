// components/admin/orders/AnimatedItemCardStack.tsx
//
// Order-item version of the AnimatedCardStack showcase component.
// Same spring-stack visual language (peeking cards, click-to-advance)
// but built on real OrderItem[] data instead of hardcoded demo content,
// and sized to FILL a fixed-size parent box (absolute inset-0 per card)
// rather than growing/shrinking like OrderItemImageStack. Use this
// wherever the layout gives the stack a hard width/height and can't
// tolerate the rail-growth behavior — e.g. the order detail header.
"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { OrderItem } from "@/types/admin"

const FALLBACK_IMAGE =
  "https://images.pexels.com/photos/5632402/pexels-photo-5632402.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop"

const MAX_VISIBLE = 3

// Compact stacking offsets — small px/scale deltas rather than the
// original's large showcase-card offsets, since this renders inside a
// fixed box (e.g. h-28 w-56) rather than its own full-size viewport.
const positionStyles = [
  { scale: 1, y: 0, x: 0 },
  { scale: 0.95, y: -8, x: 6 },
  { scale: 0.9, y: -16, x: 13 },
]

function AnimatedCard({
  item,
  index,
  isFront,
  onAdvance,
}: {
  item: OrderItem
  index: number
  isFront: boolean
  onAdvance: () => void
}) {
  const { scale, y, x } = positionStyles[index] ?? positionStyles[MAX_VISIBLE - 1]
  const image = item.productImage ?? FALLBACK_IMAGE

  return (
    <motion.div
      key={item.id}
      initial={index === MAX_VISIBLE - 1 ? { ...positionStyles[MAX_VISIBLE - 1], opacity: 0 } : false}
      animate={{ y, x, scale, opacity: 1 }}
      exit={index === 0 ? { y: 40, opacity: 0, zIndex: 10 } : undefined}
      transition={{ type: "spring", duration: 0.7, bounce: 0 }}
      style={{ zIndex: MAX_VISIBLE - index }}
      onClick={(e) => {
        e.stopPropagation()
        if (isFront) onAdvance()
      }}
      className={`absolute inset-0 overflow-hidden rounded-xl border border-ink/10 bg-[#e5e2d9] shadow-[0_10px_24px_-12px_rgba(32,36,43,0.35)] will-change-transform ${
        isFront ? "cursor-pointer" : "pointer-events-none"
      }`}
    >
      <img src={image} alt={item.title} className="h-full w-full select-none object-cover" />

      {isFront && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-[linear-gradient(to_top,rgba(0,0,0,0.65),rgba(0,0,0,0.12),transparent)]" />
          <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2 text-white">
            <span className="truncate text-sm font-medium">{item.title}</span>
            <span className="shrink-0 text-[11px] opacity-85">×{item.quantity}</span>
          </div>
        </>
      )}
    </motion.div>
  )
}

export function AnimatedItemCardStack({
  items,
  className = "",
}: {
  items: OrderItem[]
  className?: string
}) {
  // `order` rotates on click — front item moves to the back, next item
  // becomes front. This is a display copy of `items`; it never mutates
  // the source array.
  const [order, setOrder] = useState(items)

  if (items.length === 0) return null

  const visible = order.slice(0, MAX_VISIBLE)
  const canAdvance = order.length > 1

  const handleAdvance = () => {
    if (!canAdvance) return
    setOrder((prev) => [...prev.slice(1), prev[0]])
  }

  return (
    <div className={`relative h-full w-full ${className}`}>
      <AnimatePresence initial={false}>
        {visible.map((item, index) => (
          <AnimatedCard
            key={item.id}
            item={item}
            index={index}
            isFront={index === 0}
            onAdvance={handleAdvance}
          />
        ))}
      </AnimatePresence>

      {order.length > 1 && (
        <span className="pointer-events-none absolute right-2 top-2 z-20 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          {order.findIndex((i) => i.id === visible[0].id) + 1}/{order.length}
        </span>
      )}
    </div>
  )
}