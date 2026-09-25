import Link from 'next/link'
import {
  Baby,
  BookOpen,
  Dumbbell,
  Gamepad2,
  Gem,
  Home,
  Shirt,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/categories',
  title: 'Shop by Category | WishDrop',
  description: 'Browse every product category WishDrop sources — electronics, fashion, beauty, home, and more.',
})

const categories = [
  { name: 'Electronics', icon: Smartphone, blurb: 'Phones, audio, laptops, and accessories', href: '/stores/new?category=electronics' },
  { name: 'Fashion', icon: Shirt, blurb: 'Clothing, footwear, and accessories', href: '/stores/new?category=fashion' },
  { name: 'Beauty', icon: Sparkles, blurb: 'Skincare, makeup, and haircare', href: '/stores/new?category=beauty' },
  { name: 'Home & Living', icon: Home, blurb: 'Décor, kitchen, and everyday essentials', href: '/stores/new?category=home' },
  { name: 'Sports', icon: Dumbbell, blurb: 'Fitness gear, apparel, and equipment', href: '/stores/new?category=sports' },
  { name: 'Toys & Games', icon: Gamepad2, blurb: 'Toys, board games, and consoles', href: '/stores/new?category=toys' },
  { name: 'Anime', icon: Gem, blurb: 'Merch, figures, and streetwear', href: '/stores/new?category=anime' },
  { name: 'Books', icon: BookOpen, blurb: 'Fiction, non-fiction, and manga', href: '/stores/new?category=books' },
  { name: 'Baby & Kids', icon: Baby, blurb: 'Clothing, toys, and gear', href: '/stores/new?category=baby' },
]

export default function CategoriesPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16 lg:px-10 lg:py-24">
      <div className="max-w-2xl">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          Shop by category
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Whatever you're after, we can go get it
        </h1>
        <p className="mt-4 font-body text-base leading-relaxed text-ink/65">
          Pick a category to start a request, or browse our{' '}
          <Link href="/stores" className="text-teal-deep underline underline-offset-2">affiliated stores</Link>{' '}
          directly for ready-to-buy products.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map(({ name, icon: Icon, blurb, href }) => (
          <Link
            key={name}
            href={href}
            className="group flex items-center gap-4 rounded-2xl border border-ink/10 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-lift"
          >
            <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-gold/15 text-gold-deep transition-colors group-hover:bg-teal/15 group-hover:text-teal-deep">
              <Icon size={22} />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-ink">{name}</h2>
              <p className="mt-0.5 font-body text-xs text-ink/55">{blurb}</p>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-12 font-body text-sm text-ink/55">
        Can't find the right category? Any category is a starting point, not a restriction —{' '}
        <Link href="/stores" className="text-teal-deep underline underline-offset-2">submit a request</Link>{' '}
        for anything, from any store.
      </p>
    </main>
  )
}
