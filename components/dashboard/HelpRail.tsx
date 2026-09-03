'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, X, ShoppingBag, CreditCard, PackagePlus, Truck } from 'lucide-react'

type Step = {
  number: number
  icon: React.ElementType
  title: string
  description: string
}

const steps: Step[] = [
  {
    number: 1,
    icon: ShoppingBag,
    title: 'Create a purchasing order',
    description: 'Provide product webpage links and basic product information',
  },
  {
    number: 2,
    icon: CreditCard,
    title: 'Payment for purchasing orders',
    description:
      'Pay the product and service fees first, and we will purchase and arrange delivery to the sorting center for you',
  },
  {
    number: 3,
    icon: PackagePlus,
    title: 'Create a forwarding order',
    description:
      'Multiple shipments can be merged into a single transshipment note and the consolidation fee is paid',
  },
  {
    number: 4,
    icon: Truck,
    title: 'Waiting for shipment',
    description:
      'Forwarding order shipments will be shipped within 1-2 business days and you will receive tracking details',
  },
]

function HowToPurchaseModal({ onClose }: { onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm motion-safe:[animation:fadeIn_0.2s_ease-out_both]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-purchase-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl overflow-hidden rounded-2xl bg-card shadow-lift motion-safe:[animation:fadeUp_0.25s_ease-out_both]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/10 px-8 py-6">
          <h2 id="how-to-purchase-title" className="font-display text-xl font-bold text-ink">
            How to purchase
          </h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-ink/50 transition-colors duration-150 hover:bg-ink/5 hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        {/* Steps */}
        <div className="grid gap-8 px-8 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div key={step.number} className="flex flex-col items-center text-center">
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gold/15">
                  <Icon size={28} className="text-gold-deep" strokeWidth={1.8} />
                </div>
                <div className="mt-3 grid h-7 w-7 place-items-center rounded-full bg-gold-deep font-mono text-xs font-bold text-parchment">
                  {step.number}
                </div>
                <p className="mt-3 text-sm font-semibold leading-snug text-ink">{step.title}</p>
                <p className="mt-2 text-xs leading-relaxed text-ink/60">{step.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MustReadModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm motion-safe:[animation:fadeIn_0.2s_ease-out_both]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="must-read-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl overflow-hidden rounded-2xl bg-card shadow-lift motion-safe:[animation:fadeUp_0.25s_ease-out_both]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/10 px-8 py-6">
          <h2 id="must-read-title" className="font-display text-xl font-bold text-ink">
            A must-read before ordering
          </h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-ink/50 transition-colors duration-150 hover:bg-ink/5 hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-8 py-8">
          <p className="text-sm leading-relaxed text-ink/80">When filling out proxy purchase orders, please pay attention to:</p>

          <p className="mt-6 text-sm leading-relaxed text-ink/80">
            1. A single proxy purchase order can include up to <strong className="font-semibold text-ink">10 products</strong> from{' '}
            <strong className="font-semibold text-ink">the same shopping website</strong>.
            <br />
            (If the product comes from a different website, you need to submit a new proxy purchase order.)
          </p>

          <p className="mt-6 text-sm leading-relaxed text-ink/80">
            2. Directly copy the product information
            <br />
            displayed on the shopping website (if the product description is in Japanese, please copy the Japanese
            content as <strong className="font-semibold text-ink">product data</strong>).
          </p>

          <p className="mt-6 text-sm leading-relaxed text-ink/80">
            Accurately provide <strong className="font-semibold text-ink">product page URLs</strong>,{' '}
            <strong className="font-semibold text-ink">product descriptions</strong>, and{' '}
            <strong className="font-semibold text-ink">product images</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function HelpRail() {
  const [showGuide, setShowGuide] = useState(false)
  const [showMustRead, setShowMustRead] = useState(false)

  return (
    <aside className="flex flex-col gap-5 lg:w-[330px] lg:flex-none">
      <div className="rounded-2xl border border-dashed border-ink/20 bg-card p-6">
        <h3 className="font-display text-lg text-ink">Need help before you submit?</h3>
        <div className="mt-4 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="flex items-center justify-between text-sm font-semibold text-ink hover:text-blue"
          >
            Step-by-step guide <ChevronRight size={16} className="text-muted" />
          </button>
          <button
            type="button"
            onClick={() => setShowMustRead(true)}
            className="flex items-center justify-between text-sm font-semibold text-ink hover:text-blue"
          >
            Important things to know <ChevronRight size={16} className="text-muted" />
          </button>
          <a href="/prohibited-items" className="flex items-center justify-between text-sm font-semibold text-ink hover:text-blue">
            Prohibition items <ChevronRight size={16} className="text-muted" />
          </a>
        </div>
      </div>

      {showGuide && <HowToPurchaseModal onClose={() => setShowGuide(false)} />}
      {showMustRead && <MustReadModal onClose={() => setShowMustRead(false)} />}
    </aside>
  )
}