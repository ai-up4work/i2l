import { ChevronRight } from 'lucide-react'

export default function HelpRail() {
  return (
    <aside className="flex flex-col gap-5 lg:w-[330px] lg:flex-none">
      <div className="rounded-2xl border border-dashed border-ink/20 bg-card p-6">
        <h3 className="font-display text-lg text-ink">Need help before you submit?</h3>
        <div className="mt-4 flex flex-col gap-2.5">
          <a href="#guide" className="flex items-center justify-between text-sm font-semibold text-ink hover:text-blue">
            Step-by-step guide <ChevronRight size={16} className="text-muted" />
          </a>
          <a href="#know" className="flex items-center justify-between text-sm font-semibold text-ink hover:text-blue">
            Important things to know <ChevronRight size={16} className="text-muted" />
          </a>
          <a href="#prohibited" className="flex items-center justify-between text-sm font-semibold text-ink hover:text-blue">
            Prohibition items <ChevronRight size={16} className="text-muted" />
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-ink/20 bg-card p-6">
        <h3 className="font-display text-lg text-ink">About bidding</h3>
        <div className="mt-4">
          <a href="#bidding" className="flex items-center justify-between text-sm font-semibold text-ink hover:text-blue">
            How bidding works <ChevronRight size={16} className="text-muted" />
          </a>
        </div>
      </div>
    </aside>
  )
}
