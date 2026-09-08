'use client'

import { useRef, useState } from 'react'
import { Package } from 'lucide-react'
import type { OrderItem } from '@/contexts/Ordercontexts'

const MAX_VISIBLE = 5

export function ItemImageStack({
  items,
  className = '',
  fitActive = false,
}: {
  items: OrderItem[]
  className?: string
  fitActive?: boolean
}) {
  const [active, setActive] = useState(0)
  // natural aspect ratio (width/height) per item index, filled in as images load
  const [ratios, setRatios] = useState<Record<number, number>>({})
  const rowRef = useRef<HTMLDivElement>(null)

  const visible = items.slice(0, MAX_VISIBLE)
  const overflow = items.length - visible.length

  const rowHeight = rowRef.current?.clientHeight ?? 160

  return (
    <div
      ref={rowRef}
      className={`flex gap-1.5 items-stretch h-full min-w-0 ${fitActive ? 'w-auto' : 'w-full max-w-full'} ${className}`}
    >
      {visible.map((item, i) => {
        const isActive = i === active
        const isLastVisible = i === visible.length - 1
        const useFit = fitActive && isActive
        // once we know the image's aspect ratio, compute the pixel width
        // that keeps it at full row height with zero cropping. Falls back
        // to a sane default before the image has loaded once.
        const fitWidth = useFit ? Math.round(rowHeight * (ratios[i] ?? 1.5)) : undefined

        return (
          <div
            key={i}
            onClick={(e) => {
              e.stopPropagation()
              setActive(i)
            }}
            className="relative h-full rounded-xl overflow-hidden cursor-pointer bg-[#e5e2d9] min-w-0"
            style={{
              // IMPORTANT: this ratio (not the transition duration/easing)
              // is what makes the resize itself look smooth. flex-grow
              // distributes space proportionally, so jumping from 1 to
              // something huge like 10000 makes the active card grab
              // nearly all the space within the first fraction of the
              // animation, then barely move for the rest — it *looks*
              // like a snap no matter how slow the transition is set to.
              // A modest ratio (7 vs 1) keeps the width change roughly
              // linear across the full duration, so it reads as one
              // continuous, smooth resize instead of "snap then crawl."
              flexGrow: useFit ? 0 : isActive ? 7 : 1,
              flexShrink: useFit ? 0 : 1,
              flexBasis: useFit ? `${fitWidth}px` : undefined,
              minWidth: useFit ? undefined : 36,
              // flex-basis + flex-grow both transition smoothly here since
              // every card always renders the same <img> element — nothing
              // gets swapped in/out, so the browser can animate between
              // the old and new numeric values.
              // 1.1s with a symmetric ease-in-out curve: eases gently in
              // AND out, so the resize never feels like it "snaps" at
              // either end — this reads noticeably smoother/slower than
              // an expo-out curve on this kind of width/crop animation.
              transition: 'flex-grow 1.1s cubic-bezier(.65,0,.35,1), flex-basis 1.1s cubic-bezier(.65,0,.35,1)',
            }}
          >
            <img
              src={item.image}
              alt={item.name}
              onLoad={(e) => {
                const img = e.currentTarget
                if (img.naturalHeight > 0) {
                  const r = img.naturalWidth / img.naturalHeight
                  setRatios((prev) => (prev[i] === r ? prev : { ...prev, [i]: r }))
                }
              }}
              // when fitting, the box itself is already sized to the
              // image's true aspect ratio, so object-fit: cover behaves
              // identically to "show the whole image" — no crop happens
              // because there's no extra space in either dimension
              className="absolute inset-0 h-full w-full object-cover object-center"
            />

            <div
              className="absolute inset-x-0 bottom-0 h-[66%] pointer-events-none bg-[linear-gradient(to_top,rgba(0,0,0,0.65),rgba(0,0,0,0.15),transparent)]"
            />

            <div className="absolute left-2.5 bottom-2.5 flex items-center gap-2">
              <div
                className={`text-white whitespace-nowrap transition-all duration-[900ms] ease-[cubic-bezier(.65,0,.35,1)] ${
                  isActive ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-3'
                }`}
              >
                <div className="font-medium text-sm">{item.name}</div>
                <div className="text-[11px] opacity-85">Qty {item.qty}</div>
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