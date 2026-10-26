// content/blog.ts
//
// Blog posts, rendered at /blog/<slug> (app/(public)/blog/[slug]/page.tsx),
// listed on /blog, in the sitemap and in llms.txt automatically.
//
// Writing a post that ranks (and gets quoted by AI answers):
//   - Answer the question in the first two sentences, then explain.
//   - One clear question per post, phrased the way people search it.
//   - Only state what's true for Wishdrop today; link to the policy page
//     that backs it. Update `updated` when you change a post.
//   - Real photos of real orders/QC (with permission) beat stock images.

export interface BlogSection {
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

export interface BlogPost {
  slug: string
  title: string
  /** Meta description / card text, ~150 characters. */
  description: string
  tag: 'Guide' | 'Store guide' | 'Notice'
  /** ISO dates. */
  published: string
  updated?: string
  author: string
  sections: BlogSection[]
  faqs?: { q: string; a: string }[]
  /** Internal links shown at the end. */
  related?: { label: string; href: string }[]
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'express-vs-economy-delivery-sri-lanka',
    title: 'Express vs Economy: which delivery should you choose from India to Sri Lanka?',
    description:
      'Express usually arrives in 12–15 days; Economy costs less and takes about 3–4 weeks. Here’s how the two are priced and when each makes sense.',
    tag: 'Guide',
    published: '2026-10-26',
    author: 'Wishdrop team',
    sections: [
      {
        heading: 'The short answer',
        paragraphs: [
          'Choose Express when you need the item soon — it usually arrives in about 12–15 days from purchase. Choose Economy when price matters more than speed — it usually takes about 3–4 weeks. Economy is switched on at checkout when it’s available.',
        ],
      },
      {
        heading: 'How Express is priced',
        paragraphs: [
          'Express covers freight and customs clearance, both charged by weight in small weight blocks, plus a flat delivery fee to your door in Sri Lanka and a flat service charge per item.',
        ],
      },
      {
        heading: 'How Economy is priced',
        paragraphs: [
          'Economy replaces freight and customs clearance with a single postal charge by weight, plus its own flat delivery fee and the same service charge. For light items the difference is small; for heavier items Economy can save more.',
        ],
      },
      {
        heading: 'Both include customs — nothing to pay on arrival',
        paragraphs: [
          'Whichever you choose, the total you accept is the total you pay. There’s nothing more to pay when the parcel arrives unless your order changes after purchase.',
        ],
      },
    ],
    faqs: [
      {
        q: 'How long does Express delivery from India to Sri Lanka take with Wishdrop?',
        a: 'Usually about 12–15 days from purchase, depending on the seller’s dispatch time and customs.',
      },
      {
        q: 'Is Economy delivery always available?',
        a: 'Not always. When Economy is paused it shows as “Coming soon” and checkout uses Express.',
      },
    ],
    related: [
      { label: 'Shipping rates and how pricing works', href: '/shipping/pricing' },
      { label: 'Estimate a delivered price', href: '/estimate' },
    ],
  },
  {
    slug: 'what-you-cant-ship-from-india-to-sri-lanka',
    title: 'What can’t be shipped from India to Sri Lanka? A plain-language list',
    description:
      'Nail polish, hair dye, aerosols, power banks, alcohol and replica goods can’t travel. Here’s what’s not allowed and why, before you order.',
    tag: 'Guide',
    published: '2026-10-26',
    author: 'Wishdrop team',
    sections: [
      {
        heading: 'The short answer',
        paragraphs: [
          'Anything classed as dangerous for air freight, weapons and replicas, alcohol, cash and counterfeit goods, and anything Sri Lankan or Indian law restricts can’t be bought and shipped through Wishdrop.',
        ],
      },
      {
        heading: 'Dangerous goods (the ones that surprise people)',
        paragraphs: ['These are everyday products that aren’t allowed on cargo flights:'],
        bullets: [
          'Nail polish, hair dye and other flammable liquids',
          'Aerosol sprays, gas cylinders, lighters and canned or carbonated drinks',
          'Loose batteries and power banks (batteries fitted inside a device may be accepted — ask first)',
          'Strong magnets and corrosive or toxic chemicals',
        ],
      },
      {
        heading: 'Weapons, alcohol and regulated goods',
        paragraphs: ['Also not allowed:'],
        bullets: [
          'Firearms, ammunition, replica or toy guns, restricted knives, bows and arrows',
          'Alcoholic drinks and high-alcohol products',
          'Cash, event tickets, personal documents, and counterfeit or replica branded goods',
        ],
      },
      {
        heading: 'Not sure? Ask before you order',
        paragraphs: [
          'Some items need a permit or Customs approval to enter Sri Lanka. If you’re unsure about something, message us before ordering and we’ll check.',
        ],
      },
    ],
    related: [
      { label: 'Full prohibited items list', href: '/prohibited-items' },
      { label: 'How to buy from Nykaa in Sri Lanka', href: '/shop-from-india/nykaa' },
    ],
  },
  {
    slug: 'whats-included-in-your-wishdrop-price',
    title: 'What’s included in your Wishdrop price (and why there’s nothing to pay on delivery)',
    description:
      'Your Wishdrop total covers the item, shipping, customs clearance, a service charge and delivery to your door — quoted in LKR before you pay.',
    tag: 'Guide',
    published: '2026-10-26',
    author: 'Wishdrop team',
    sections: [
      {
        heading: 'The short answer',
        paragraphs: [
          'One price in Sri Lankan rupees covers everything: the product, international shipping, customs clearance, a service charge and delivery to your door. You see it before you pay, and there’s nothing more to pay when the parcel arrives.',
        ],
      },
      {
        heading: 'The three lines you’ll see',
        paragraphs: ['Every product shows the same breakdown on the product page, in the cart and at checkout:'],
        bullets: [
          'Price — the item converted to LKR, including shipping and customs clearance',
          'Service charge — a flat amount per item for buying, checking and handling your order',
          'Delivery — a flat fee to bring it to your door in Sri Lanka',
        ],
      },
      {
        heading: 'Why weight matters',
        paragraphs: [
          'Shipping and customs clearance are charged by weight, so a heavy item costs more to bring over than a light one at the same shop price. If a seller doesn’t list a weight we use a sensible default and adjust once the item is weighed at quality check.',
        ],
      },
      {
        heading: 'How you pay',
        paragraphs: [
          'You pay in full when you accept the quote, by Visa or Mastercard, a supported mobile wallet, or Wishdrop wallet credit. Coupon codes are applied on top as a discount.',
        ],
      },
    ],
    related: [
      { label: 'How customs charges work', href: '/taxation' },
      { label: 'Payment methods', href: '/policy/payment-method' },
      { label: 'Estimate a delivered price', href: '/estimate' },
    ],
  },
]

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}
