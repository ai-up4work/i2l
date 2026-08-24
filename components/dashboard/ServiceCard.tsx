import { ChevronRight, PackagePlus } from 'lucide-react'
import Image from 'next/image'

type ServiceCardProps = {
  image: string
  title: string
  description: string
  button: string
  onClick?: () => void
}

export default function ServiceCard({ image: image, title, description, button, onClick }: ServiceCardProps) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-ink/10 bg-card p-6 sm:flex-row sm:items-center sm:gap-7">
      {/* <Illustration className="h-[72px] w-[72px] flex-none" /> */}
      <Image src={image} alt="" width={72} height={72} className="h-[72px] w-[72px] flex-none" />

      <div className="flex-1">
        <h2 className="font-display text-xl text-ink">{title}</h2>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">{description}</p>
      </div>

      <div className="flex flex-col items-start gap-3 sm:min-w-[200px] sm:items-center">
        <button
          onClick={onClick}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep sm:w-auto"
        >
          <PackagePlus size={17} /> {button}
        </button>
        <a href="#guide" className="flex items-center gap-1 text-sm font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
          Step-by-step guide <ChevronRight size={15} />
        </a>
      </div>
    </div>
  )
}
