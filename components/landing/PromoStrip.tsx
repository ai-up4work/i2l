interface Promo {
  label: string
  value: string
  tone: string
}

  // /* Neutrals — parchment & ink base */
  // --color-ink: #20242b;
  // --color-parchment: #fbf6ec;
  // --color-card: #ffffff;

  // /* Primary accent — motion, CTAs, links, order-progress states */
  // --color-teal: #0e8c9c;
  // --color-teal-deep: #0b7280;

  // /* Delight accent — used sparingly for badges/highlights only, never as a fill */
  // --color-gold: #f0a93a;
  // --color-gold-deep: #c98a2a;

  // /* Weight & trust — dark surfaces, footer, wordmark, occasional contrast */
  // --color-indigo: #0d1d41;
  // --color-indigo-deep: #081228;

const promos: Promo[] = [
  { label: "eBay Double Rewards", value: "$3 \u2192 $38", tone: "bg-indigo text-parchment" },
  { label: "Ramadan Flash Sale", value: "Up to 25% off", tone: "bg-teal text-parchment" },
  { label: "Mercari, Japan's finest", value: "New arrivals weekly", tone: "bg-gold text-ink" },
]

export default function PromoStrip() {
  return (
    <section className="mx-auto mt-8 max-w-7xl px-6 lg:px-10">
      <div className="grid gap-4 sm:grid-cols-3">
        {promos.map((promo) => (
          <div key={promo.label} className={`rounded-2xl p-6 ${promo.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-wide font-body opacity-80">{promo.label}</p>
            <p className="mt-3 font-display text-xl">{promo.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}