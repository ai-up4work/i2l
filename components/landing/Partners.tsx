import Image from 'next/image'
import { partners } from './data'

export default function Partners() {
  return (
    <section className="mx-auto max-w-7xl px-6 mt-16 pb-24 text-center lg:px-10">
      <div className="mt-auto w-full rounded-2xl border border-[#20242B]/8 bg-white/70 px-5 py-4 backdrop-blur-sm">
      <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">Who we work with</p>
      <h2 className="mt-4 font-display text-3xl text-ink">Official partners</h2>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-10 rounded-3xl border border-[#20242B]/8 bg-white/70 px-5 py-4 backdrop-blur-sm py-10">
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
      </div>
    </section>
  )
}
