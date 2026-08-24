import Image from 'next/image'
import { partners } from './data'

export default function Partners() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-24 text-center lg:px-10">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-rust">Who we work with</p>
      <h2 className="mt-4 font-display text-3xl text-ink">Official partners</h2>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-10 rounded-3xl border border-ink/10 bg-card px-10 py-10">
        {partners.map((partner) => (
          <Image
            key={partner.name}
            src={partner.logo}
            alt={partner.name}
            width={60}
            height={60}
            className="h-12 w-auto object-contain grayscale transition-all duration-200 hover:grayscale-0"
          />
        ))}
      </div>
    </section>
  )
}
