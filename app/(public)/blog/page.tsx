import Link from 'next/link'
import { ArrowRight, Bell, BookOpen, Megaphone, Tag } from 'lucide-react'
import { Callout, IconCard, PageHero, Section } from '@/components/public/PageKit'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/blog',
  title: 'Wishdrop Blog',
  description: 'Buying tips, shipping guides, and service notices from the Wishdrop team.',
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
    title: 'Buying from eBay through Wishdrop',
    excerpt: 'Auctions, fixed-price listings, and what to check before requesting an eBay item.',
    href: '/shopping/marketplaces/ebay',
    tag: 'Store guide',
  },
]

export default function BlogPage() {
  const [featured, ...rest] = posts
  return (
    <main>
      <PageHero
        eyebrow="Wishdrop blog"
        title="Shopping tips, guides"
        accent="& news."
        intro="Everything we publish to help you shop smarter — pricing explainers, store guides, deals and service updates."
      />

      <Section>
        <div className="grid gap-4 md:grid-cols-3">
          {categories.map(({ name, icon, href, text }, i) => (
            <IconCard key={name} icon={icon} tone={i === 1 ? 'gold' : 'teal'} title={name} text={text} href={href} />
          ))}
        </div>
      </Section>

      <Section eyebrow="Latest" title="Recent posts">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Link
            href={featured.href}
            className="group relative flex min-h-[280px] flex-col justify-end overflow-hidden rounded-3xl bg-indigo p-7 text-parchment sm:p-9"
          >
            <span
              aria-hidden
              className="absolute inset-0 opacity-60"
              style={{
                backgroundImage: 'radial-gradient(rgba(251,246,236,0.12) 1px, transparent 1.2px)',
                backgroundSize: '20px 20px',
              }}
            />
            <span aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal/30 blur-3xl" />
            <span className="relative w-fit rounded-full bg-gold px-2.5 py-0.5 font-body text-[11px] font-bold uppercase tracking-wide text-indigo">
              {featured.tag}
            </span>
            <h3 className="relative mt-3 font-display text-3xl font-semibold leading-tight">{featured.title}</h3>
            <p className="relative mt-2 max-w-md font-body text-sm text-parchment/70">{featured.excerpt}</p>
            <span className="relative mt-5 inline-flex items-center gap-1.5 font-body text-sm font-semibold text-gold">
              Read more <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
          <div className="divide-y divide-ink/[0.08] overflow-hidden rounded-3xl bg-card ring-1 ring-ink/[0.08]">
            {rest.map((post) => (
              <Link key={post.title} href={post.href} className="group flex items-center justify-between gap-4 p-5 transition-colors hover:bg-parchment/50">
                <div>
                  <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-teal-deep">{post.tag}</span>
                  <h3 className="mt-1 font-display text-lg font-semibold leading-snug text-indigo">{post.title}</h3>
                  <p className="mt-1 font-body text-sm text-ink/55">{post.excerpt}</p>
                </div>
                <ArrowRight size={16} className="flex-none text-ink/25 transition-colors group-hover:text-teal-deep" />
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-6">
          <Callout icon={Megaphone}>
            Delivery delay or facility update? Check{' '}
            <Link href="/blog/categories/notices" className="font-semibold text-teal-deep underline underline-offset-2">
              Service notices
            </Link>{' '}
            first — your answer might already be there.
          </Callout>
        </div>
      </Section>
    </main>
  )
}
