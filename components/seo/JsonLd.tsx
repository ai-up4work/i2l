// components/seo/JsonLd.tsx
//
// Renders schema.org structured data as a <script type="application/ld+json">.
// Server-component safe (no hooks). Escapes "<" so a product name or
// description containing "</script>" can't break out of the tag.

import { SITE, SEO_IMAGES, absoluteUrl, socialProfiles } from '@/lib/seo'

type Json = Record<string, unknown>

export default function JsonLd({ data }: { data: Json | Json[] }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

// ─── Builders ──────────────────────────────────────────────────────────

const ORG_ID = `${absoluteUrl('/')}#organization`
const WEBSITE_ID = `${absoluteUrl('/')}#website`

/** Organization — powers the brand knowledge panel and logo in results. */
export function organizationSchema(): Json {
  const sameAs = socialProfiles()
  const contactPoint: Json[] = []
  if (SITE.contact.whatsapp) {
    contactPoint.push({
      '@type': 'ContactPoint',
      contactType: 'customer support',
      telephone: SITE.contact.whatsapp,
      areaServed: SITE.country,
      availableLanguage: ['English', 'Sinhala', 'Tamil'],
    })
  }
  if (SITE.contact.email) {
    contactPoint.push({
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: SITE.contact.email,
      areaServed: SITE.country,
    })
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.name,
    legalName: SITE.legalName,
    url: absoluteUrl('/'),
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl(SEO_IMAGES.logo),
      width: 512,
      height: 512,
    },
    description: SITE.description,
    areaServed: { '@type': 'Country', name: 'Sri Lanka' },
    ...(sameAs.length ? { sameAs } : {}),
    ...(contactPoint.length ? { contactPoint } : {}),
  }
}

/** WebSite — declares the site name Google shows above results. */
export function websiteSchema(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE.name,
    alternateName: SITE.tagline,
    url: absoluteUrl('/'),
    inLanguage: 'en-LK',
    publisher: { '@id': ORG_ID },
  }
}

/** BreadcrumbList — shows the "Wishdrop › Stores › Myntra" trail in results. */
export function breadcrumbSchema(items: { name: string; path: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export interface ProductSchemaInput {
  name: string
  description?: string
  images: string[]
  path: string
  sku?: string
  brand?: string
  category?: string
  /** The LKR price the shopper actually sees on the page. */
  priceLKR: number
  inStock: boolean
  condition?: string
  sellerName: string
  averageRating?: number
  reviewCount?: number
}

/**
 * Product — enables price / availability rich results. The offer uses the
 * delivered LKR price shown on the page (not the store's INR sticker
 * price), because Google requires structured-data prices to match what
 * the visitor sees.
 */
export function productSchema(p: ProductSchemaInput): Json {
  const url = absoluteUrl(p.path)
  const condition = (p.condition || 'new').toLowerCase()
  const itemCondition = condition.includes('refurb')
    ? 'https://schema.org/RefurbishedCondition'
    : condition.includes('used') || condition.includes('pre-owned')
      ? 'https://schema.org/UsedCondition'
      : 'https://schema.org/NewCondition'

  const images = p.images.filter(Boolean).slice(0, 6).map((src) => absoluteUrl(src))

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    url,
    ...(images.length ? { image: images } : {}),
    ...(p.description ? { description: p.description.slice(0, 5000) } : {}),
    ...(p.sku ? { sku: p.sku } : {}),
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    ...(p.category ? { category: p.category } : {}),
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: SITE.currency,
      price: Math.round(p.priceLKR * 100) / 100,
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition,
      seller: { '@id': ORG_ID },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: SITE.country },
      },
    },
    ...(p.averageRating && p.reviewCount
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: p.averageRating,
            reviewCount: p.reviewCount,
          },
        }
      : {}),
  }
}
