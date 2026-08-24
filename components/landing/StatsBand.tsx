const stats = [
  { value: '90%', label: 'Max savings on shopping abroad' },
  { value: '50%', label: 'Orders are hard-to-find products' },
  { value: '12M+', label: 'Shipments handled by India2Lanka' },
]

export default function StatsBand() {
  return (
    <section className="bg-gold px-6 py-16 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-10 text-center text-ink sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="font-display text-5xl">{stat.value}</p>
            <p className="mt-2 text-sm font-medium opacity-80">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
