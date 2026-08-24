const promos = [
  {
    label: 'eBay Double Rewards',
    value: '$3 \u2192 $38',
    tone: 'bg-rust text-paper',
  },
  {
    label: 'Ramadan Flash Sale',
    value: 'Up to 25% off',
    tone: 'bg-blue text-paper',
  },
  {
    label: "Mercari, Japan's finest",
    value: 'New arrivals weekly',
    tone: 'bg-gold text-ink',
  },
]

export default function PromoStrip() {
  return (
    <section className="mx-auto max-w-7xl px-6 lg:px-10">
      <div className="grid gap-4 sm:grid-cols-3">
        {promos.map((promo) => (
          <div key={promo.label} className={`rounded-2xl p-6 ${promo.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{promo.label}</p>
            <p className="mt-3 font-display text-xl">{promo.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
