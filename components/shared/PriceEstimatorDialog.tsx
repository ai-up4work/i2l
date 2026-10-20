'use client'

// "Know the rupee price? Estimate it" — a link that opens the price
// estimator in a pop-up (landing page hero). Portaled to <body> so the
// hero's entrance animations (CSS transforms) can't trap the fixed overlay.

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Calculator, X } from 'lucide-react'
import PriceEstimator from '@/components/shared/PriceEstimator'

export default function PriceEstimatorDialog({
  trigger,
  triggerClassName,
}: {
  trigger?: ReactNode
  /** Replaces the default link styling of the button that opens the pop-up. */
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          'inline-flex items-center gap-1.5 font-body text-sm font-semibold text-teal-deep underline-offset-4 hover:underline'
        }
      >
        {trigger ?? (
          <>
            <Calculator size={15} aria-hidden="true" />
            Know the rupee price? Estimate it
          </>
        )}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="estimate-title">
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" />
            <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-parchment p-5 shadow-2xl sm:rounded-3xl sm:p-7">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-deep">Price estimator</p>
                  <h2 id="estimate-title" className="mt-1 font-display text-2xl font-semibold text-indigo">
                    Roughly what will it cost?
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="grid h-9 w-9 flex-none place-items-center rounded-full bg-card text-ink/60 ring-1 ring-ink/10 hover:text-ink"
                >
                  <X size={17} />
                </button>
              </div>
              <PriceEstimator />
              <p className="mt-4 font-body text-xs text-ink/50">
                Ready to order? Close this and paste the product link.{' '}
                <Link href="/estimate" className="font-semibold text-teal-deep underline underline-offset-2">
                  Open full page
                </Link>
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
