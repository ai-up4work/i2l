'use client'

import { CircleHelp, Percent, Plus, Sparkle } from 'lucide-react'
import HelpRail from './HelpRail'

type AddRequestPageProps = {
  link: string
  setLink: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
}

export default function AddRequestPage({ link, setLink, onSubmit }: AddRequestPageProps) {
  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-8 lg:px-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Add a new item request</h1>
        <a href="#faq" className="flex flex-none items-center gap-2 text-sm font-semibold text-ink">
          <CircleHelp size={18} /> FAQ
        </a>
      </div>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="relative flex items-center justify-between overflow-hidden rounded-3xl bg-gold-soft px-9 py-10">
            <h2 className="max-w-sm font-display text-2xl leading-snug text-ink sm:text-3xl">
              Shop anywhere worldwide — we&apos;ll handle the rest
            </h2>
            <div className="relative hidden h-[100px] w-[140px] flex-none sm:block" aria-hidden="true">
              <Sparkle size={18} className="absolute left-7 top-2 text-gold" />
              <Sparkle size={26} className="absolute left-2 top-11 text-gold" />
              <div className="absolute right-2 top-2 grid h-24 w-20 rotate-6 place-items-center rounded-2xl bg-rust text-paper shadow-lift">
                <Percent size={30} />
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4 rounded-2xl border border-dashed border-ink/20 bg-card p-7">
            <p className="font-semibold text-ink">You find it, we buy it for you!</p>
            <textarea
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="Paste full product link here to get started (e.g. https://example.com/item)"
              className="min-h-[90px] resize-y rounded-xl border border-ink/15 bg-paper p-4 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-gold/50"
            />
            <button
              type="submit"
              disabled={!link.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3.5 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:bg-ink/25"
            >
              <Plus size={18} /> Submit request
            </button>
          </form>
        </div>

        <HelpRail />
      </div>
    </div>
  )
}
