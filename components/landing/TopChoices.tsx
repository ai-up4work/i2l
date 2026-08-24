import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { topChoices } from './data'

export default function TopChoices() {
  return (
    <section id="shipping" className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-rust">What makes us</p>
      <h2 className="mt-4 max-w-xl font-display text-4xl text-ink sm:text-5xl">
        The <em className="not-italic text-blue">top choice</em> for shopping abroad.
      </h2>

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {topChoices.map(({ icon: Icon, title, text, bullets }, index) => (
          <article
            key={title}
            className="flex flex-col overflow-hidden rounded-3xl border border-ink/10 bg-card transition-shadow hover:shadow-lift"
          >
            <Image
              src={index === 0 ? '/images/service-forwarding.png' : index === 1 ? '/images/service-shopping.png' : '/images/community-collage.png'}
              alt=""
              width={700}
              height={420}
              className="h-40 w-full object-cover"
            />
            <div className="p-8">
              <div className="grid h-12 w-12 place-items-center rounded-full border-2 border-dashed border-rust/50 text-rust">
                <Icon size={22} aria-hidden="true" />
              </div>

              <h3 className="mt-6 font-display text-xl text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/60">{text}</p>

            <ul className="mt-5 flex flex-col gap-2.5">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2 text-sm text-ink/70">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-gold" aria-hidden="true" />
                  {bullet}
                </li>
              ))}
            </ul>

            <a
              href="/account"
              className="mt-7 flex w-max items-center gap-2 border-b border-ink/20 pb-1 text-sm font-semibold text-ink transition-colors hover:border-ink"
            >
                Learn more <ArrowRight size={14} />
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
