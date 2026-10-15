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
import { CtaEnvelope, PageHero, Section } from '@/components/public/PageKit'
import { ArrowUpRight } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/categories',
  title: 'Shop by Category | Wishdrop',
  description: 'Browse every product category Wishdrop sources — electronics, fashion, beauty, home, and more.',
})

const categories = [
  { name: 'Electronics', icon: Smartphone, blurb: 'Phones, audio, laptops, and accessories', href: '/stores?category=electronics' },
  { name: 'Fashion', icon: Shirt, blurb: 'Clothing, footwear, and accessories', href: '/stores?category=fashion' },
  { name: 'Beauty', icon: Sparkles, blurb: 'Skincare, makeup, and haircare', href: '/stores?category=beauty' },
  { name: 'Home & Living', icon: Home, blurb: 'Décor, kitchen, and everyday essentials', href: '/stores?category=home' },
  { name: 'Sports', icon: Dumbbell, blurb: 'Fitness gear, apparel, and equipment', href: '/stores?category=sports' },
  { name: 'Toys & Games', icon: Gamepad2, blurb: 'Toys, board games, and consoles', href: '/stores?category=toys' },
  { name: 'Anime', icon: Gem, blurb: 'Merch, figures, and streetwear', href: '/stores?category=anime' },
  { name: 'Books', icon: BookOpen, blurb: 'Fiction, non-fiction, and manga', href: '/stores?category=books' },
  { name: 'Baby & Kids', icon: Baby, blurb: 'Clothing, toys, and gear', href: '/stores?category=baby' },
]

export default function CategoriesPage() {
  return (
    <main>
      <PageHero
        eyebrow="Shop by category"
        title="Whatever you’re after,"
        accent="we’ll get it."
        intro={
          <>
            Pick a category to browse ready-to-buy products from our{' '}
            <Link href="/stores" className="font-semibold text-teal-deep underline underline-offset-2">
              stores
            </Link>
            , or send us a link to anything else.
          </>
        }
      />

      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map(({ name, icon: Icon, blurb, href }, i) => (
            <Link
              key={name}
              href={href}
              className="group relative flex items-center gap-4 overflow-hidden rounded-3xl bg-card p-5 ring-1 ring-ink/[0.08] transition-all hover:-translate-y-0.5 hover:ring-teal/30 hover:shadow-[0_18px_40px_-24px_rgba(8,39,79,0.35)]"
            >
              <span
                className={`grid h-14 w-14 flex-none place-items-center rounded-2xl transition-colors ${
                  i % 3 === 0 ? 'bg-teal/10 text-teal-deep' : i % 3 === 1 ? 'bg-gold/15 text-gold-deep' : 'bg-indigo/[0.07] text-indigo'
                } group-hover:bg-indigo group-hover:text-gold`}
              >
                <Icon size={24} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold text-indigo">{name}</h2>
                <p className="mt-0.5 font-body text-sm text-ink/55">{blurb}</p>
              </div>
              <ArrowUpRight size={17} className="absolute right-4 top-4 text-ink/20 transition-colors group-hover:text-teal-deep" />
            </Link>
          ))}
        </div>
      </Section>

      <CtaEnvelope
        title="Can’t find the"
        accent="right category?"
        text="Categories are a starting point, not a limit. Send us the link to anything from an Indian store."
        primary={{ href: '/account', label: 'Start a request' }}
        secondary={{ href: '/stores', label: 'Browse stores' }}
      />
    </main>
  )
}
