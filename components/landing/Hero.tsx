import Image from 'next/image'
import { MessageCircle, Package } from 'lucide-react'
import SignupCard from './SignupCard'

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-14 lg:px-10 lg:pb-24 lg:pt-20">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-paper" />
        <Image
          src="/images/landing-crops/route-plane.png"
          alt="Airplane route from India to Sri Lanka"
          width={610}
          height={215}
          priority
          className="absolute right-[-3rem] top-8 h-auto w-[30rem] max-w-none opacity-90 mix-blend-multiply lg:right-12 lg:top-10 lg:w-[38rem]"
        />
        <Image
          src="/images/landing-crops/hero-parcel.png"
          alt="Parcel ready for international delivery"
          width={425}
          height={265}
          className="absolute bottom-0 right-[-2rem] h-auto w-[18rem] max-w-none opacity-90 mix-blend-multiply lg:right-8 lg:w-[25rem]"
        />
        <Image
          src="/images/landing-crops/stamps.png"
          alt="Colombo and Bengaluru shipping stamps"
          width={415}
          height={200}
          className="absolute bottom-2 left-[-5rem] hidden h-auto w-[18rem] opacity-30 mix-blend-multiply lg:block"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-paper via-paper/90 to-paper/35" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-rust">
            Tracking No. IN—2—LK &middot; Est. 2019
          </p>

          <h1 className="mt-5 font-display text-5xl leading-[1.05] text-ink sm:text-6xl lg:text-[4.5rem]">
            Shop worldwide,
            <br />
            <em className="not-italic text-blue">delivered home.</em>
          </h1>

          <p className="mt-6 max-w-md text-base leading-relaxed text-ink/70">
            Affordable international shipping and proxy shopping, so every overseas
            store ships to Sri Lanka — even the ones that say they don&apos;t.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a
              href="/account"
              className="rounded-full bg-ink px-7 py-3.5 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
            >
              Ship your first parcel
            </a>
            <a
              href="#how"
              className="rounded-full px-3 py-3.5 text-sm font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
            >
              See how it works
            </a>
          </div>

          <dl className="mt-12 flex flex-wrap gap-x-10 gap-y-5 border-t border-ink/10 pt-8">
            <div>
              <dt className="font-display text-3xl text-ink">1.8M+</dt>
              <dd className="mt-1 text-xs uppercase tracking-wide text-muted">Active members</dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 font-display text-3xl text-ink">
                <Package size={20} className="text-rust" aria-hidden="true" /> 12M+
              </dt>
              <dd className="mt-1 text-xs uppercase tracking-wide text-muted">Shipments handled</dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 font-display text-3xl text-ink">
                <MessageCircle size={20} className="text-rust" aria-hidden="true" /> 24/7
              </dt>
              <dd className="mt-1 text-xs uppercase tracking-wide text-muted">Live chat support</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-5 lg:justify-self-end lg:max-w-sm">
          <SignupCard />
        </div>
      </div>
    </section>
  )
}
