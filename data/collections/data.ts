// data/collections/data.ts
//
// Mirrors data/sellers/data.ts's shape: a status-label map, a status-style
// map for pill/badge rendering, a flat constant array for list-page
// filtering, and a getCollection(id) lookup for the detail page — same
// split as ADMIN_SELLERS + getSeller(). Replace ADMIN_COLLECTIONS and the
// two functions below with real fetches once the Collection +
// CollectionItem tables exist (see requirements doc, section 6/7).
//
// Product images are real photos (Unsplash, free license) chosen to match
// each item, sized via Unsplash's imgix params (w/h/fit/q) so no local
// asset pipeline is needed. Swap for real product photography once
// sellers start uploading their own.

export type CollectionStatus = 'draft' | 'published'

export const STATUS_LABEL: Record<CollectionStatus, string> = {
  draft: 'Draft',
  published: 'Published',
}

// Used for the pill badge in the detail-page header, same role as
// STATUS_STYLE in data/sellers/data.ts.
export const STATUS_STYLE: Record<CollectionStatus, string> = {
  published: 'bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25',
  draft: 'bg-ink/[0.05] text-ink/50 ring-1 ring-inset ring-ink/10',
}

export type CollectionItem = {
  id: string
  productId: string
  productName: string
  sellerName: string
  image: string
  price: number
  position: number
}

export type Collection = {
  id: string
  name: string
  slug: string
  description: string
  status: CollectionStatus
  items: CollectionItem[]
  updatedAt: string
}

// A product available to add into a collection — cross-seller, sourced
// from either feed-integrated or manual-mode sellers. Collections don't
// care which; that distinction lives on the Sellers/Catalogues side.
export type PickableProduct = {
  id: string
  name: string
  sellerName: string
  image: string
  price: number
}

// Small helper so every product image is requested at a consistent,
// reasonably-sized crop instead of the multi-megabyte originals.
function img(photoId: string): string {
  return `https://images.unsplash.com/${photoId}?w=600&h=600&fit=crop&auto=format&q=80`
}

const IMG = {
  kurta: img('photo-1759840278381-bf7d5e332050'), // woman in red embroidered kurta with floral scarf
  diya: img('photo-1577083753695-e010191bacb5'), // lit clay oil lamps on a decorative tray
  dupatta: img('photo-1780504863283-3157e6d141e1'), // woman in pink traditional Indian outfit
  linenShirt: img('photo-1603252109612-24fa03d145c8'), // man in white button-up shirt
  tote: img('photo-1630381260512-e3fe55c11973'), // person holding a white canvas tote bag
  copperBottle: img('photo-1693306062284-b79bf0ce7a6b'), // copper mug/vessel
  incense: img('photo-1634833132745-22030467db4f'), // incense stick with rising smoke
  anklet: img('photo-1600862754152-80a263dd564f'), // gold and red beaded jewellery
} as const

// Flat constant, filtered directly by the list page — same pattern as
// ADMIN_SELLERS (not hidden behind a getter, since the list page needs
// the whole set to build its search/filter queue up front).
export const ADMIN_COLLECTIONS: Collection[] = [
  {
    id: 'col_diwali',
    name: 'Diwali Picks',
    slug: 'diwali-picks',
    description: 'Festive edits curated across every affiliated store, refreshed weekly.',
    status: 'published',
    updatedAt: '2026-09-08T10:00:00.000Z',
    items: [
      {
        id: 'ci_1',
        productId: 'p_101',
        productName: 'Embroidered Silk Kurta',
        sellerName: 'Meera Textiles',
        image: IMG.kurta,
        price: 4200,
        position: 0,
      },
      {
        id: 'ci_2',
        productId: 'p_102',
        productName: 'Brass Diya Set (6pc)',
        sellerName: 'Home & Hearth Co.',
        image: IMG.diya,
        price: 1350,
        position: 1,
      },
    ],
  },
  {
    id: 'col_new_this_week',
    name: 'New This Week',
    slug: 'new-this-week',
    description: 'Freshest arrivals across all sellers, feed-integrated and manual alike.',
    status: 'published',
    updatedAt: '2026-09-10T14:30:00.000Z',
    items: [
      {
        id: 'ci_3',
        productId: 'p_201',
        productName: 'Oversized Linen Shirt',
        sellerName: 'Studio Alma',
        image: IMG.linenShirt,
        price: 2800,
        position: 0,
      },
    ],
  },
  {
    id: 'col_gift_under_2k',
    name: 'Gifts Under Rs. 2,000',
    slug: 'gifts-under-2000',
    description: '',
    status: 'draft',
    updatedAt: '2026-09-05T09:15:00.000Z',
    items: [],
  },
]

const PICKABLE_PRODUCTS: PickableProduct[] = [
  { id: 'p_101', name: 'Embroidered Silk Kurta', sellerName: 'Meera Textiles', image: IMG.kurta, price: 4200 },
  { id: 'p_102', name: 'Brass Diya Set (6pc)', sellerName: 'Home & Hearth Co.', image: IMG.diya, price: 1350 },
  { id: 'p_103', name: 'Hand-block Print Dupatta', sellerName: 'Meera Textiles', image: IMG.dupatta, price: 990 },
  { id: 'p_201', name: 'Oversized Linen Shirt', sellerName: 'Studio Alma', image: IMG.linenShirt, price: 2800 },
  { id: 'p_202', name: 'Canvas Tote — Natural', sellerName: 'Studio Alma', image: IMG.tote, price: 1200 },
  { id: 'p_301', name: 'Copper Water Bottle', sellerName: 'Home & Hearth Co.', image: IMG.copperBottle, price: 1600 },
  { id: 'p_302', name: 'Sandalwood Incense (pack of 20)', sellerName: 'Home & Hearth Co.', image: IMG.incense, price: 450 },
  { id: 'p_401', name: 'Beaded Anklet Set', sellerName: 'Riya Accessories', image: IMG.anklet, price: 780 },
]

export function getCollection(id: string): Collection | undefined {
  return ADMIN_COLLECTIONS.find((c) => c.id === id)
}

export function getPickableProducts(): PickableProduct[] {
  return PICKABLE_PRODUCTS
}