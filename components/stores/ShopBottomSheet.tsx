"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { ShopMegaMenuMobile } from "@/components/stores/ShopMegaMenu"

interface ShopBottomSheetProps {
  open: boolean
  onClose: () => void
}

const ANIM_MS = 320

/**
 * Mobile-only bottom sheet for the "Shop" nav item — slides up from the
 * bottom edge with a spring overshoot (same cubic-bezier the bottom tab
 * bar uses for its active-pill glide) instead of expanding inline as an
 * accordion. Backdrop tap or the X closes it; scroll is locked on the
 * page behind while it's open.
 */
export default function ShopBottomSheet({ open, onClose }: ShopBottomSheetProps) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    timeout = setTimeout(() => setMounted(false), ANIM_MS)
    return () => clearTimeout(timeout)
  }, [open])

  useEffect(() => {
    if (!mounted) return
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [mounted])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-[110] lg:hidden" role="dialog" aria-modal="true" aria-label="Shop">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-ink/40 transition-opacity duration-300 ease-out ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`ease-nav-spring absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col rounded-t-3xl border-t border-teal/20 bg-parchment shadow-[0_-8px_30px_rgba(13,29,65,0.25)] transition-transform duration-[420ms] ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pb-1 pt-3">
          <span className="h-1.5 w-10 rounded-full bg-ink/15" />
        </div>

        <div className="flex items-center justify-between px-6 pb-3 pt-1">
          <h2 className="font-display text-lg font-semibold text-ink">Shop</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink/60 transition-colors duration-200 hover:bg-teal/10 hover:text-teal-deep"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="nav-scroll min-h-0 flex-1 overflow-y-auto pb-4">
          <ShopMegaMenuMobile />
        </div>
      </div>

      <style jsx>{`
        .ease-nav-spring {
          transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </div>
  )
}