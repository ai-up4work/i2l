// components/admin/orders/OrderItemImageStack.tsx
//
// Admin-side port of components/dashboard/ItemImageStack.tsx. Same
// interaction and animation — click a rail to make it active, active
// rail grows via flex-grow, optionally locks to the image's true aspect
// ratio via fitActive — just remapped onto the admin OrderItem shape
// (types/admin.ts), which uses title/quantity/productImage instead of
// the customer-facing name/qty/image. Kept as its own component rather
// than making the original generic, since the two item types diverge
// enough (sellerName/sku/etc. on this side) that a shared prop-mapping
// layer would add more indirection than it saves for two call sites.
'use client'

import { useRef, useState } from 'react'
import type { OrderItem } from '@/types/admin'

const MAX_VISIBLE = 5
const FALLBACK_IMAGE =
  'https://images.pexels.com/photos/5632402/pexels-photo-5632402.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop'

// Sizing for the default (non-fitActive) mode — used in list rows, where
// the stack sits in a compact space and just needs to make clear which
// item is "active."
//
// A flex-grow RATIO (old approach: active=7, others=1) looks fine at 2
// items but degrades as more items are added: the active share is
// 7/(6+n), so at n=4 it's already down to 70%, and every non-active rail
// keeps getting thinner too since they're splitting a shrinking
// remainder — exactly the "more items = less visible highlight" problem.
// Fixed pixel widths sidestep this: the active rail is always
// ACTIVE_RAIL_WIDTH regardless of how many items there are, every other
// rail is always COLLAPSED_RAIL_WIDTH, and the stack's own total width
// grows to fit that math (see stackWidth below) instead of the reverse.
// Callers should give this component a flexible box (no fixed width) so
// that growth isn't clipped — see the two call sites for the
// conditional width class this requires.
const ACTIVE_RAIL_WIDTH = 76
const COLLAPSED_RAIL_WIDTH = 30
const RAIL_GAP = 6 // matches gap-1.5

export function OrderItemImageStack({
  items,
  className = '',
  fitActive = false,
}: {
  items: OrderItem[]
  className?: string
  fitActive?: boolean
}) {
  const [active, setActive] = useState(0)
  const [ratios, setRatios] = useState<Record<number, number>>({})
  const rowRef = useRef<HTMLDivElement>(null)

  const visible = items.slice(0, MAX_VISIBLE)
  const overflow = items.length - visible.length
  const rowHeight = rowRef.current?.clientHeight ?? 160

  // Only kicks in for the default mode with more than one item — a
  // single item still just fills whatever box the caller gives it,
  // same as before.
  const useFixedRailWidths = !fitActive && visible.length > 1
  const stackWidth = useFixedRailWidths
    ? ACTIVE_RAIL_WIDTH + (visible.length - 1) * (COLLAPSED_RAIL_WIDTH + RAIL_GAP)
    : undefined

  return (
    <div
      ref={rowRef}
      className={`flex gap-1.5 items-stretch h-full min-w-0 ${
        fitActive || useFixedRailWidths ? 'w-auto' : 'w-full max-w-full'
      } ${className}`}
      style={stackWidth ? { width: stackWidth } : undefined}
    >
      {visible.map((item, i) => {
        const isActive = i === active
        const isLastVisible = i === visible.length - 1
        const useFit = fitActive && isActive
        const fitWidth = useFit ? Math.round(rowHeight * (ratios[i] ?? 1.5)) : undefined
        const fixedWidth = useFixedRailWidths ? (isActive ? ACTIVE_RAIL_WIDTH : COLLAPSED_RAIL_WIDTH) : undefined
        const image = item.productImage ?? FALLBACK_IMAGE

        return (
          <div
            key={item.id}
            onClick={(e) => {
              e.stopPropagation()
              setActive(i)
            }}
            className="relative h-full rounded-xl overflow-hidden cursor-pointer bg-[#e5e2d9] min-w-0"
            style={{
              // See the customer-facing ItemImageStack for the reasoning
              // behind the transition timing — it's what keeps the
              // resize reading as one smooth motion instead of "snap
              // then crawl." The width itself now comes from one of
              // three sources: aspect-ratio fit (fitActive), a fixed
              // rail width (useFixedRailWidths, 2+ items), or the old
              // flex-grow ratio (fallback: exactly one item).
              flexGrow: useFit || fixedWidth !== undefined ? 0 : isActive ? 7 : 1,
              flexShrink: useFit || fixedWidth !== undefined ? 0 : 1,
              flexBasis: useFit ? `${fitWidth}px` : fixedWidth !== undefined ? `${fixedWidth}px` : undefined,
              minWidth: useFit || fixedWidth !== undefined ? undefined : 36,
              transition: 'flex-grow 1.1s cubic-bezier(.65,0,.35,1), flex-basis 1.1s cubic-bezier(.65,0,.35,1)',
            }}
          >
            <img
              src={image}
              alt={item.title}
              onLoad={(e) => {
                const img = e.currentTarget
                if (img.naturalHeight > 0) {
                  const r = img.naturalWidth / img.naturalHeight
                  setRatios((prev) => (prev[i] === r ? prev : { ...prev, [i]: r }))
                }
              }}
              className="absolute inset-0 h-full w-full object-cover object-center"
            />

            <div className="absolute inset-x-0 bottom-0 h-[66%] pointer-events-none bg-[linear-gradient(to_top,rgba(0,0,0,0.65),rgba(0,0,0,0.15),transparent)]" />

            <div className="absolute left-2.5 bottom-2.5 flex items-center gap-2">
              <div
                className={`text-white whitespace-nowrap transition-all duration-[900ms] ease-[cubic-bezier(.65,0,.35,1)] ${
                  isActive ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-3'
                }`}
              >
                <div className="truncate font-medium text-sm max-w-[160px]">{item.title}</div>
                <div className="text-[11px] opacity-85">Qty {item.quantity}</div>
              </div>
            </div>

            {isLastVisible && overflow > 0 && (
              <span className="absolute right-2 top-2 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                +{overflow}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}