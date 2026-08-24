import { ChevronRight } from 'lucide-react'
import { logoUrl } from '@/lib/logo'
import Image from 'next/image'

export default function InfoRail() {
  return (
    <aside className="flex flex-col gap-5 lg:w-[330px] lg:flex-none">
      <div className="rounded-2xl border border-ink/10 bg-card p-6">
        <h3 className="flex items-center justify-between font-display text-lg text-ink">
          Official partner
          <span className="font-mono text-xs tracking-[0.2em] text-gold">&bull;&bull;&bull;</span>
        </h3>

        <div className="mt-5 grid h-[90px] place-items-center rounded-xl bg-gold-soft border border-gold/50">
          <Image src='/logos/ebay.png' alt="eBay logo" width={120} height={40} className="h-12 w-auto object-contain" />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink/60">
          Official marketplace partner — shop with ease and ship straight to your door.
        </p>

        <a href="#products" className="mt-5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-ink">
          Explore products <ChevronRight size={15} />
        </a>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-card p-6">
        <h3 className="font-display text-lg text-ink">Relevant information</h3>
        <div className="mt-4 flex flex-col gap-2.5">
          <a
            href="#prohibited"
            className="flex items-center justify-between rounded-xl border border-ink/10 px-4 py-3.5 text-sm font-semibold text-ink hover:bg-ink/5"
          >
            Prohibited items <ChevronRight size={16} className="text-muted" />
          </a>
          <a
            href="#pickup"
            className="flex items-center justify-between rounded-xl border border-ink/10 px-4 py-3.5 text-sm font-semibold text-ink hover:bg-ink/5"
          >
            Self-pickup points <ChevronRight size={16} className="text-muted" />
          </a>
        </div>
      </div>
    </aside>
  )
}
