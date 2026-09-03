// AddRequestPage.tsx
'use client'

import { useEffect, useRef } from 'react'
import { CircleHelp, Percent, Plus, Sparkle } from 'lucide-react'
import HelpRail from './HelpRail'

type AddRequestPageProps = {
  link: string
  setLink: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
  /** When true, submits the form programmatically once on mount (used when
   *  a link arrives pre-filled via query param, so the user doesn't have to
   *  click "Submit request" themselves). */
  autoSubmit?: boolean
}

export default function AddRequestPage({ link, setLink, onSubmit, autoSubmit = false }: AddRequestPageProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const hasAutoSubmitted = useRef(false)

  useEffect(() => {
    if (!autoSubmit || hasAutoSubmitted.current) return
    if (!link.trim()) return

    hasAutoSubmitted.current = true
    // requestSubmit() fires a real submit event through the form's onSubmit
    // handler — same code path as clicking the button, so onSubmit receives
    // a proper event object instead of a hand-built stand-in.
    formRef.current?.requestSubmit()
  }, [autoSubmit, link])

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-8 lg:px-10">
      <div className="flex items-center justify-between gap-4 motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Add a new item request</h1>
        <a
          href="#faq"
          className="flex flex-none items-center gap-2 text-sm font-semibold text-ink/70 transition-colors duration-200 hover:text-ink"
        >
          <CircleHelp size={18} /> FAQ
        </a>
      </div>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {/* Hero */}
          <div
            className="relative flex items-center justify-between overflow-hidden rounded-3xl bg-gold/10 px-9 py-10 motion-safe:[animation:fadeUp_0.45s_ease-out_0.05s_both]"
          >
            {/* Soft ambient glow, purely decorative */}
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/20 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-indigo/10 blur-3xl"
              aria-hidden
            />

            <h2 className="relative max-w-sm font-display text-2xl leading-snug text-ink sm:text-3xl">
              Shop anywhere worldwide — we&apos;ll handle the rest
            </h2>

            <div className="relative hidden h-[100px] w-[140px] flex-none sm:block" aria-hidden="true">
              <Sparkle
                size={18}
                className="absolute left-7 top-2 text-gold motion-safe:[animation:floatSlow_3.5s_ease-in-out_infinite]"
              />
              <Sparkle
                size={26}
                className="absolute left-2 top-11 text-gold/80 motion-safe:[animation:floatSlow_4.2s_ease-in-out_0.4s_infinite]"
              />
              <div className="absolute right-2 top-2 grid h-24 w-20 rotate-6 place-items-center rounded-2xl bg-indigo-deep text-parchment shadow-lift transition-transform duration-500 ease-out hover:rotate-0 hover:scale-105 motion-safe:[animation:scaleIn_0.5s_ease-out_0.1s_both]">
                <Percent size={30} className="motion-safe:[animation:floatSlow_5s_ease-in-out_infinite]" />
              </div>
            </div>
          </div>

          {/* Form */}
          <form
            ref={formRef}
            onSubmit={onSubmit}
            className="mt-5 flex flex-col gap-4 rounded-2xl border border-dashed border-ink/20 bg-card p-7 transition-shadow duration-300 hover:shadow-sm motion-safe:[animation:fadeUp_0.45s_ease-out_0.1s_both]"
          >
            <p className="font-semibold text-ink">You find it, we buy it for you!</p>
            <textarea
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="Paste full product link here to get started (e.g. https://example.com/item)"
              className="min-h-[90px] resize-y rounded-xl border border-ink/15 bg-parchment p-4 text-sm outline-none transition-all duration-200 placeholder:text-ink/35 focus:border-gold/60 focus:bg-card focus:ring-2 focus:ring-gold/50"
            />
            <button
              type="submit"
              disabled={!link.trim()}
              className="group flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-ink py-3.5 text-sm font-semibold text-parchment transition-all duration-200 hover:bg-indigo-deep hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/25 disabled:active:scale-100"
            >
              <Plus size={18} className="transition-transform duration-200 group-hover:rotate-90" />
              Submit request
            </button>
          </form>
        </div>

        <HelpRail />
      </div>
    </div>
  )
}