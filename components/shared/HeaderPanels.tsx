"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, ImageOff, X } from "lucide-react"

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep focus-visible:ring-offset-2 focus-visible:ring-offset-parchment"

export const checkoutButtonClass =
  `flex w-full items-center justify-center rounded-xl bg-teal px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-teal-deep ${focusRing}`

export const PREVIEW_ITEM_LIMIT = 4
const PANEL_ANIM_MS = 280

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-deep px-1 text-[10px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  )
}

export function ProductThumb({ image, alt }: { image?: string | null; alt: string }) {
  if (!image) {
    return (
      <div className="grid h-14 w-14 flex-none place-items-center rounded-lg border border-ink/10 bg-card">
        <ImageOff size={16} className="text-ink/25" />
      </div>
    )
  }
  return (
    <div className="h-14 w-14 flex-none overflow-hidden rounded-lg border border-ink/10 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={alt} className="h-full w-full object-contain p-1" />
    </div>
  )
}

export function SlideOverPanel({
  open,
  onClose,
  title,
  icon,
  isEmpty,
  emptyLabel,
  emptyHref,
  emptyCta,
  viewAllHref,
  viewAllLabel,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  icon: React.ReactNode
  isEmpty: boolean
  emptyLabel: string
  emptyHref: string
  emptyCta: string
  viewAllHref: string
  viewAllLabel: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
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
    timeout = setTimeout(() => setMounted(false), PANEL_ANIM_MS)
    return () => clearTimeout(timeout)
  }, [open])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [open])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-[110] flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`absolute inset-0 bg-ink/40 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`relative flex h-full w-full max-w-sm flex-col bg-parchment shadow-2xl transition-transform duration-[280ms] ease-out motion-reduce:transition-none ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink/10 p-5">
          <h3 className="flex items-center gap-2.5 text-sm font-bold font-display text-ink">
            {icon}
            {title}
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-ink transition-colors hover:bg-teal/10 ${focusRing}`}
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isEmpty ? (
            <div className="py-16 text-center">
              <p className="text-sm text-ink/60">{emptyLabel}</p>
              <a
                href={emptyHref}
                onClick={onClose}
                className={`mt-2 inline-block rounded text-sm font-semibold text-teal-deep hover:underline ${focusRing}`}
              >
                {emptyCta}
              </a>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">{children}</div>
              <a
                href={viewAllHref}
                onClick={onClose}
                className={`mt-3 flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal/10 ${focusRing}`}
              >
                {viewAllLabel}
                <ArrowLeft size={14} className="rotate-180" />
              </a>
            </>
          )}
        </div>

        {!isEmpty && footer && <div className="border-t border-ink/10 p-4">{footer}</div>}
      </div>
    </div>
  )
}