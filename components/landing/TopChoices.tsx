import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { topChoices } from "./data"


export default function TopChoices() {
  return (
    <section id="shipping" className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            Shop smarter, not harder
          </p>
          <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
            Top reasons to
            <br />
            shop with <span className="text-gold">WishDrop</span>
          </h2>
        </div>

        <a
          href="/categories"
          className="flex shrink-0 items-center gap-1.5 font-body text-sm font-semibold text-ink transition-colors hover:text-teal"
        >
          View all categories
          <ArrowRight size={14} />
        </a>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {topChoices.map(({ icon: Icon, title, text, image }, index) => (
          <article
            key={title}
            className="group flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
          >
            {/* Compact image, top-rounded only — matches the reference proportions */}
            <div className="relative h-60 w-full overflow-hidden">
              <Image
                src={image!}
                alt={title}
                fill
                sizes="(max-width: 640px) 100vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>

            <div className="flex flex-1 flex-col px-5 pb-6 mt-8">
              {/* Icon badge overlaps the image/body seam, like the reference */}
              <div className="-mt-5 flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-ink/5 bg-card text-gold shadow-md shadow-ink/10">
                <Icon size={20} aria-hidden="true" />
              </div>

              <h3 className="mt-4 font-display text-base font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 font-body text-sm leading-relaxed text-ink/55">{text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}