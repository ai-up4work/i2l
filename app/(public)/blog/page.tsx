import Link from 'next/link'
import { ArrowRight, Bell, BookOpen, Megaphone, Tag } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/blog',
  title: 'WishDrop Blog',
  description: 'Buying tips, shipping guides, and service notices from the WishDrop team.',
})

const categories = [
  { name: 'Shopping guides', icon: BookOpen, href: '/shopping-guides', text: 'Store-by-store tips for buying with confidence.' },
  { name: 'Deals & promos', icon: Tag, href: '/deals', text: "What's currently discounted across our affiliated stores." },
  { name: 'Service notices', icon: Bell, href: '/blog/categories/notices', text: 'Warehouse updates, delays, and service alerts.' },
]

const posts = [
  {
    title: 'How landed cost actually works, in plain language',
    excerpt: 'Duty, PAL, SSCL, Cess, surcharge, VAT — what each one is, and why the same-priced item can cost differently depending on category.',
    href: '/taxation',
    tag: 'Guide',
  },
  {
    title: "Express vs. Economy: which delivery speed should you pick?",
    excerpt: 'A breakdown of how freight, customs clearance, and delivery fees differ between our two shipping speeds.',
    href: '/shipping/pricing',
    tag: 'Guide',
  },
  {
    title: 'What actually gets checked during quality check',
    excerpt: 'A look at what happens to your item between arriving at our facility and leaving for Sri Lanka.',
    href: '/shipping',
    tag: 'Guide',
  },
  {
    title: 'Buying from eBay through WishDrop',
    excerpt: 'Auctions, fixed-price listings, and what to check before requesting an eBay item.',
    href: '/shopping/marketplaces/ebay',
    tag: 'Store guide',
  },
]

export default function BlogPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16 lg:px-10 lg:py-24">
      <div className="max-w-2xl">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          WishDrop blog
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Shopping tips, guides & news
        </h1>
        <p className="mt-4 font-body text-base leading-relaxed text-ink/65">
          Everything we publish to help you shop smarter — pricing explainers, store guides, deals,
          and service updates.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {categories.map(({ name, icon: Icon, href, text }) => (
          <Link
            key={name}
            href={href}
            className="group flex flex-col gap-2 rounded-2xl border border-ink/10 bg-card p-5 transition-colors hover:border-teal/40"
          >
            <Icon size={18} className="text-gold-deep" />
            <h2 className="font-display text-base font-semibold text-ink group-hover:text-teal-deep">{name}</h2>
            <p className="font-body text-xs text-ink/55">{text}</p>
          </Link>
        ))}
      </div>

      <div className="mt-14">
        <h2 className="font-display text-xl font-semibold text-ink">Latest posts</h2>
        <div className="mt-6 flex flex-col divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-card">
          {posts.map((post) => (
            <Link
              key={post.title}
              href={post.href}
              className="group flex items-center justify-between gap-4 p-5 transition-colors hover:bg-parchment/50"
            >
              <div>
                <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-teal-deep">
                  {post.tag}
                </span>
                <h3 className="mt-1 font-display text-base font-semibold text-ink">{post.title}</h3>
                <p className="mt-1 font-body text-sm text-ink/55">{post.excerpt}</p>
              </div>
              <ArrowRight size={16} className="flex-none text-ink/30 transition-colors group-hover:text-teal-deep" />
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-14 flex items-center gap-4 rounded-2xl border border-ink/10 bg-indigo p-6">
        <Megaphone className="flex-none text-gold" size={22} />
        <p className="font-body text-sm text-parchment/80">
          For delivery delays or facility updates, check{' '}
          <Link href="/blog/categories/notices" className="font-semibold text-parchment underline underline-offset-2">
            Service notices
          </Link>{' '}
          before contacting support — your answer might already be there.
        </p>
      </div>
    </main>
  )
}
