import Image from 'next/image'
import { partners } from '@/content/data'

/* ============================================================================
 * PARTNERS
 * ==========================================================================*/

// Doubled so the track can scroll exactly -50% and loop seamlessly —
// the second copy lines up pixel-for-pixel with where the first one
// started, so there's no jump or gap at the seam.
const loopedPartners = [...partners, ...partners]

function Partners() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 text-center lg:px-10">
      <style>{`
        @keyframes partners-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .partners-track {
          animation: partners-scroll 32s linear infinite;
        }
        .partners-marquee:hover .partners-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .partners-track {
            animation: none;
          }
        }
      `}</style>

      <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
        Trusted by thousands <span className="text-ink/30">•</span> Partnered with the best
      </p>

      <div
        className="partners-marquee relative mt-12 overflow-hidden"
        style={{
          maskImage:
            'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
        }}
      >
        <div className="partners-track flex w-max items-center gap-14">
          {loopedPartners.map((partner, i) => (
            <Image
              key={`${partner.name}-${i}`}
              src={partner.logo}
              alt={partner.name}
              width={140}
              height={50}
              className="h-9 w-auto shrink-0 object-contain sm:h-11"
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default Partners