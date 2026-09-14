import Link from 'next/link'
import Image from 'next/image'
import { Flame } from 'lucide-react'
import { mockProducts } from '@/data/stores/data'
import { formatPrice } from '@/lib/currency'

export const metadata = {
  title: 'Trending Now | WishDrop',
  description: 'What other WishDrop shoppers are buying right now.',
}

// Deterministic "trending" slice (every 7th product) rather than random,
// so the page is stable across renders/server vs. client.
const trending = mockProducts.filter((_, i) => i % 7 === 0).slice(0, 12)

export default function TrendingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16 lg:px-10 lg:py-24">
      <div className="flex items-center gap-2">
        <Flame size={18} className="text-gold-deep" />
        <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          Trending now
        </p>
      </div>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        Based on what others are buying
      </h1>
      <p className="mt-4 max-w-2xl font-body text-base leading-relaxed text-ink/65">
        A snapshot of popular products across our affiliated stores right now. Tap anything to see
        the full listing and get a quote.
      </p>

      <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {trending.map((product) => (
          <Link
            key={product.id}
            href={`/stores/${product.storeSlug}/product/${product.id}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
          >
            <div className="relative aspect-square w-full overflow-hidden bg-parchment">
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3.5">
              <p className="line-clamp-2 font-body text-xs font-medium text-ink/80">{product.name}</p>
              <p className="mt-auto font-body text-sm font-semibold text-ink">
                {formatPrice(product.price, product.currency)}
              </p>
              <p className="font-body text-[11px] text-ink/40">{product.category}</p>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-12 font-body text-sm text-ink/55">
        Looking for something specific? Browse every{' '}
        <Link href="/stores" className="text-teal-deep underline underline-offset-2">affiliated store</Link>{' '}
        or <Link href="/account/requests/new" className="text-teal-deep underline underline-offset-2">start a request</Link> for anything else.
      </p>
    </main>
  )
}
