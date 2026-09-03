// data/stores/data.ts
//
// CANONICAL SOURCE OF TRUTH for store data. Previously this file just
// re-exported from components/dashboard/data.ts (a dashboard file being
// the canonical home for store data was backwards from what the folder
// names imply) — now it's the other way around: this file owns
// `affiliatedStores`, `mockProducts`, `platformLogos`, and the legacy
// `ALL_STORES`/`Store` shape, and components/dashboard/data.ts re-exports
// from here for existing call sites. Don't duplicate any of this
// elsewhere — add new stores/products here only.

import type { CSSProperties } from 'react'
import { productImage, random } from '@/lib/mock-assets'

// ─── Affiliated stores ──────────────────────────────────────────────────────
// SINGLE source of truth for every store the platform links to — both
// international proxy-shopping marketplaces (eBay, Amazon — request-based
// flow) and local Sri Lankan sellers (GIVA, CaseCraft — direct catalog +
// WhatsApp order flow). Both /stores (the browse page) and
// /stores/[platform] (the catalog page) read from this one array, keyed by
// `platform` (the URL slug).

export type StoreKind = 'marketplace' | 'local'

/**
 * Legacy merchandising classification, carried over from the old
 * ALL_STORES/Store type further down this file. 'custom' = the seller has
 * a build-your-own product flow (CaseCraft, Scent Lab); 'template' = a
 * normal fixed catalog. Only meaningful for storeType: 'local'; still
 * used by the /stores browse page's "Custom builds" / "Templates" filter.
 */
export type StoreBuildType = 'custom' | 'template'

export type AffiliatedStore = {
  platform: string
  name: string
  logo: string
  /** Outbound link to the marketplace itself. Omit for local sellers with no separate site. */
  url?: string
  country: string
  flag: string
  description: string
  categories: string[]
  storeType: StoreKind
  /** Local-seller extras — optional, used by the /stores browse page cards. */
  isNew?: boolean
  itemCount?: number
  bannerStyle?: CSSProperties
  shipping?: string
  payment?: string
  tags?: string[]
  /** Only set for storeType: 'local'. See StoreBuildType above. */
  buildType?: StoreBuildType
}

// Platform → logo path map, served from /public/logos. Kept alongside
// affiliatedStores since it's the same "which store, which logo" concern,
// just for marketplaces referenced by name rather than by their own
// AffiliatedStore entry's `logo` field.
export const platformLogos: Record<string, string> = {
  eBay: '/logos/ebay.png',
  Amazon: '/logos/amazon.png',
  AliExpress: '/logos/aliexpress.png',
  JD: '/logos/jd.png',
  'JD.com': '/logos/jd.png',
  Lazada: '/logos/lazada.png',
  Mercari: '/logos/mercari.png',
  Qoo10: '/logos/qoo10.png',
  Rakuten: '/logos/rakuten.png',
  Shopee: '/logos/shopee.png',
}

export const affiliatedStores: AffiliatedStore[] = [
  // ── International marketplaces (proxy-shopping / request flow) ──────────
  {
    platform: 'ebay',
    name: 'eBay',
    logo: '/logos/ebay.png',
    url: 'https://www.ebay.com',
    country: 'United States',
    flag: '🇺🇸',
    description:
      'Auctions and fixed-price listings across nearly every category — electronics, collectibles, fashion, and more.',
    categories: ['Electronics', 'Collectibles', 'Fashion', 'Home & Garden'],
    storeType: 'marketplace',
  },
  {
    platform: 'rakuten',
    name: 'Rakuten',
    logo: '/logos/rakuten.png',
    url: 'https://www.rakuten.co.jp',
    country: 'Japan',
    flag: '🇯🇵',
    description: "Japan's largest marketplace — beauty, anime goods, electronics, and household brands.",
    categories: ['Beauty', 'Anime & Collectibles', 'Electronics', 'Home'],
    storeType: 'marketplace',
  },
  {
    platform: 'aliexpress',
    name: 'AliExpress',
    logo: '/logos/aliexpress.png',
    url: 'https://www.aliexpress.com',
    country: 'China',
    flag: '🇨🇳',
    description: 'Wholesale-friendly pricing across electronics, gadgets, fashion, and everyday essentials.',
    categories: ['Electronics', 'Gadgets', 'Fashion', 'Accessories'],
    storeType: 'marketplace',
  },
  {
    platform: 'amazon',
    name: 'Amazon',
    logo: '/logos/amazon.png',
    url: 'https://www.amazon.com',
    country: 'United States',
    flag: '🇺🇸',
    description: "The world's largest catalog — books, electronics, home goods, and exclusive US-only releases.",
    categories: ['Electronics', 'Books', 'Home', 'Toys'],
    storeType: 'marketplace',
  },

  // ── Local sellers (direct catalog / WhatsApp order flow) ─────────────────
  {
    platform: 'santhiya-fashions',
    name: 'Santhiya Fashions',
    logo: '/store-icon/santhiya-fashions.png',
    country: 'India',
    flag: '🇮🇳',
    description:
      'Handpicked kurtis, salwar sets and ethnic wear for women, with budget-friendly pricing and same-day dispatch.',
    categories: ['Clothing', 'Ethnic Wear'],
    storeType: 'local',
    buildType: 'template',
    // itemCount intentionally omitted — the site's own collection counts
    // (Premium Collections: 50, Co-ord Set: 38, etc.) don't sum to a
    // reliable site-wide total, so I didn't want to fabricate one. Fill in
    // once there's a real product count (e.g. from the live feed response).
    isNew: true,
    bannerStyle: { background: '#5c1a3d' },
    shipping: 'Free shipping above ₹1,999, international shipping available',
    payment: 'COD',
    tags: ['Kurtis', 'Salwar sets', 'Ethnic wear'],
  },
  {
    platform: 'perfect-collections',
    name: 'Perfect Collections',
    logo: '/store-icon/perfect-collections.png',
    country: 'India',
    flag: '🇮🇳',
    description:
      'Handpicked kurtis, salwar sets and ethnic wear for women, with budget-friendly pricing and same-day dispatch.',
    categories: ['Clothing', 'Ethnic Wear'],
    storeType: 'local',
    buildType: 'template',
    itemCount: 86,
    isNew: true,
    bannerStyle: { background: '#5c1a3d' },
    shipping: 'Free shipping above ₹1,999, international shipping available',
    payment: 'COD',
    tags: ['Kurtis', 'Salwar sets', 'Ethnic wear'],
  },
  {
    platform: 'skyt-boutique',
    name: 'SKYT Boutique',
    logo: '/store-icon/skyt-boutique.png',
    country: 'India',
    flag: '🇮🇳',
    description: 'Handcrafted kurtis, anarkalis, coord sets, and ethnic wear, with free shipping on orders above ₹2,000.',
    categories: ['Clothing', 'Ethnic Wear'],
    storeType: 'local',
    buildType: 'template',
    itemCount: 48, // corrected count — see note below
    isNew: true,
    bannerStyle: { background: '#FAF6F1' },
    shipping: 'Free shipping above ₹2,000',
    payment: 'COD',
    tags: ['Kurtis', 'Anarkalis', 'Coord sets'],
  },
  {
    platform: 'poliskart',
    name: "Poli's Kart",
    logo: '/store-icon/poliskart.png',
    country: 'India',
    flag: '🇮🇳',
    description:
      'Maternity wear and antique-style jewellery — kurta sets, sarees, and bridal jewellery, from a Chennai-based mother-run brand.',
    categories: [
      'Maternity Wear',
      'Antique Jewellery',
      'Necklaces & Chain with Pendants',
      'Harams & Long Chains',
      'Antique Bangles',
      'Antique Jhumkas & Earrings',
      'Accessories',
      'Bridal & Combo Sets',
      'Rose Gold & Fashion Jewellery',
      'Anti Tarnish Jewellery',
      'Kurta Sets & Tops',
      'Sarees',
      'Hair Accessories',
    ],
    storeType: 'local',
    buildType: 'template',
    isNew: true,
    // itemCount intentionally omitted — no live product count confirmed
    // yet; fill in once the /products.json feed is actually hit (see
    // store-config.ts note for this platform).
    bannerStyle: { background: '#f0f0f0' },
    shipping: 'Ships across India',
    payment: 'Prepaid only — no COD, no returns (site states this explicitly)',
    tags: ['Maternity wear', 'Antique jewellery', 'Sarees'],
  },
  {
    platform: 'be-dapper',
    name: 'Be Dapper',
    logo: '/store-icon/be-dapper.png',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    description: 'Minimal streetwear made in Sri Lanka. Small-batch drops, direct from the designer.',
    categories: ['Clothing'],
    storeType: 'local',
    buildType: 'template',
    isNew: true,
    itemCount: 41,
    bannerStyle: { background: '#0f2027' },
    shipping: 'Ships island-wide',
    payment: 'COD',
    tags: ['Streetwear', 'Unisex', 'Local brand'],
  },
  {
    platform: 'old-money',
    name: 'Old Money',
    logo: '/store-icon/old-money.png',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    description: 'Minimal streetwear made in Sri Lanka. Small-batch drops, direct from the designer.',
    categories: ['Clothing'],
    storeType: 'local',
    buildType: 'template',
    isNew: true,
    itemCount: 41,
    bannerStyle: { background: '#0f2027' },
    shipping: 'Ships island-wide',
    payment: 'COD',
    tags: ['Streetwear', 'Unisex', 'Local brand'],
  },
  {
    platform: 'skye-clothing',
    name: 'Skye Clothing',
    logo: '/store-icon/skye-clothing.png',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    description: 'Ethically made, timeless garments for conscious consumers.',
    categories: ['Handmade'],
    storeType: 'local',
    buildType: 'template',
    itemCount: 67,
    bannerStyle: { background: '#faf5f0' },
    shipping: 'Ships island-wide',
    payment: 'COD',
    tags: ['Ethical fashion', 'Sustainable materials', 'Made in Sri Lanka'],
  },
  {
    platform: 'chickadee',
    name: 'Chickadee',
    logo: '/store-icon/chickadee.png',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    description:
      '18K gold plated jewellery — earrings, necklaces, rings, bracelets and more. Water-resistant & tarnish-free.',
    categories: ['Jewellery'],
    storeType: 'local',
    buildType: 'template',
    itemCount: 421,
    bannerStyle: { background: '#f5ede8' },
    shipping: 'Ships island-wide',
    payment: 'COD',
    tags: ['Gold plated', 'Earrings', 'Necklaces', 'Rings'],
  },
  {
    platform: 'cherie-lueur',
    name: 'Cherie Lueur',
    logo: '/store-icon/cherie-lueur.png',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    description:
      '18K gold plated jewellery — earrings, necklaces, rings, bracelets and more. Water-resistant & tarnish-free.',
    categories: ['Jewellery'],
    storeType: 'local',
    buildType: 'template',
    itemCount: 421,
    bannerStyle: { background: '#f5ede8' },
    shipping: 'Ships island-wide',
    isNew: true,
    payment: 'COD',
    tags: ['Gold plated', 'Earrings', 'Necklaces', 'Rings'],
  },
  {
    platform: 'kingdom-of-rings',
    name: 'Kingdom of Rings',
    logo: '/store-icon/kingdom-of-rings.png',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    description:
      "Sri Lanka's most trusted gold plated jewellery store. Chains, bracelets, rings and bridal sets with a 1-year warranty.",
    categories: ['Jewellery'],
    storeType: 'local',
    buildType: 'template',
    itemCount: 36,
    bannerStyle: { background: '#1a1400' },
    shipping: 'Ships island-wide',
    payment: 'COD',
    tags: ['Gold plated', 'Chains', 'Bridal', 'Rings'],
  },
  {
    platform: 'enzayn-ceylon',
    name: 'Enzayn Ceylon',
    logo: '/store-icon/enzayn-ceylon.png',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    description: 'Ethically made, timeless garments for conscious consumers.',
    categories: ['Handmade'],
    storeType: 'local',
    buildType: 'template',
    itemCount: 67,
    bannerStyle: { background: '#faf5f0' },
    shipping: 'Ships island-wide',
    payment: 'COD',
    tags: ['Ethical fashion', 'Sustainable materials', 'Made in Sri Lanka'],
  },
  {
    platform: 'otaku-clothing',
    name: 'OTAKU CLOTHING SL',
    logo: '/store-icon/otaku.png',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    description: 'Ethically made, timeless garments for conscious consumers.',
    categories: ['Clothing'],
    storeType: 'local',
    buildType: 'template',
    isNew: true,
    itemCount: 67,
    bannerStyle: { background: '#faf5f0' },
    shipping: 'Ships island-wide',
    payment: 'COD',
    tags: ['Ethical fashion', 'Sustainable materials', 'Made in Sri Lanka'],
  },
  {
    platform: 'giva',
    name: 'GIVA',
    logo: '/store-icon/giva.png',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    description:
      "Sri Lanka's most trusted gold plated jewellery store. Chains, bracelets, rings and bridal sets with a 1-year warranty.",
    categories: ['Jewellery', 'Rings', 'Earrings', 'Pendants', 'Bracelets', 'Chains', 'Anklets'],
    storeType: 'local',
    buildType: 'template',
    isNew: true,
    itemCount: 36,
    bannerStyle: { background: '#1a1400' },
    shipping: 'Ships island-wide',
    payment: 'COD',
    tags: ['Gold plated', 'Rose Gold', 'Bridal', 'Rings'],
  },
]

export type MockProduct = {
  id: string
  storeSlug: string
  name: string
  image: string
  price: number
  currency: string
  category: string
  condition: string
  description: string
  seller: string
}

export const mockProducts: MockProduct[] = [
  // ── ebay ──────────────────────────────────────────────────────────────
  {
    id: 'P1001',
    storeSlug: 'ebay',
    name: 'HP EliteBook 840 G8 14" 16GB 256GB SSD Core i5-1145G7',
    image: random(productImage),
    price: 275,
    currency: 'USD',
    category: 'Electronics',
    condition: 'Excellent — Used',
    description:
      'Business laptop in excellent condition, light wear on the lid. Includes charger. Battery health above 90%.',
    seller: 'techliquidators_us',
  },
  {
    id: 'P1002',
    storeSlug: 'ebay',
    name: 'Vintage Rolex Datejust 36mm, box & papers',
    image: random(productImage),
    price: 3400,
    currency: 'USD',
    category: 'Collectibles',
    condition: 'Pre-owned',
    description: 'Full box and papers set, serviced 2024. Sapphire crystal, jubilee bracelet.',
    seller: 'timepiece_vault',
  },

  // ── rakuten ───────────────────────────────────────────────────────────
  {
    id: 'P2001',
    storeSlug: 'rakuten',
    name: 'Shiseido Ultimune Power Infusing Concentrate 100ml',
    image: random(productImage),
    price: 62,
    currency: 'USD',
    category: 'Beauty',
    condition: 'New',
    description: 'Sealed, authentic Japan-domestic packaging. Ships from Rakuten Ichiba official store.',
    seller: 'rakuten_beauty_jp',
  },
  {
    id: 'P2002',
    storeSlug: 'rakuten',
    name: 'Sealed Pokémon 151 Booster Box (Japanese)',
    image: random(productImage),
    price: 210,
    currency: 'USD',
    category: 'Anime & Collectibles',
    condition: 'New — Sealed',
    description: 'Factory sealed, Japanese print. 30 packs per box.',
    seller: 'card_kingdom_jp',
  },

  // ── aliexpress ────────────────────────────────────────────────────────
  {
    id: 'P3001',
    storeSlug: 'aliexpress',
    name: 'Wireless Earbuds — Active Noise Cancelling',
    image: random(productImage),
    price: 34,
    currency: 'USD',
    category: 'Electronics',
    condition: 'New',
    description: 'Bluetooth 5.3, 30hr battery with case, IPX5 water resistance.',
    seller: 'globalTech_direct',
  },

  // ── amazon ────────────────────────────────────────────────────────────
  {
    id: 'P4001',
    storeSlug: 'amazon',
    name: 'Nintendo Game & Watch — Zelda, unopened',
    image: random(productImage),
    price: 145,
    currency: 'USD',
    category: 'Toys',
    condition: 'New — Sealed',
    description: 'US retail release, factory sealed box.',
    seller: 'Amazon.com',
  },

  // ── otaku-clothing ────────────────────────────────────────────────────
  // Previously had zero rows here, so /api/stores/otaku-clothing always
  // returned an empty catalogue (see fetchMockProducts filter by
  // storeSlug). Added a starter set so the page has something to render;
  // replace with the real catalog whenever one exists.
  {
    id: 'P6001',
    storeSlug: 'otaku-clothing',
    name: 'Oversized Anime Streetwear Hoodie — Black',
    image: random(productImage),
    price: 32,
    currency: 'USD',
    category: 'Clothing',
    condition: 'New',
    description: 'Heavyweight cotton-blend hoodie with front graphic print. Unisex sizing S–XXL.',
    seller: 'OTAKU CLOTHING SL',
  },
  {
    id: 'P6002',
    storeSlug: 'otaku-clothing',
    name: 'Shonen Series Graphic Tee — White',
    image: random(productImage),
    price: 14,
    currency: 'USD',
    category: 'Clothing',
    condition: 'New',
    description: '100% cotton crewneck tee, screen-printed front and back graphics.',
    seller: 'OTAKU CLOTHING SL',
  },
  {
    id: 'P6003',
    storeSlug: 'otaku-clothing',
    name: 'Embroidered Anime Cap — Navy',
    image: random(productImage),
    price: 11,
    currency: 'USD',
    category: 'Clothing',
    condition: 'New',
    description: 'Adjustable strap-back cap with embroidered front logo.',
    seller: 'OTAKU CLOTHING SL',
  },
  {
    id: 'P6004',
    storeSlug: 'otaku-clothing',
    name: 'Character Print Zip Jacket',
    image: random(productImage),
    price: 38,
    currency: 'USD',
    category: 'Clothing',
    condition: 'New',
    description: 'Lightweight zip-up jacket with full-back character artwork.',
    seller: 'OTAKU CLOTHING SL',
  },

  // ── skyt-boutique ─────────────────────────────────────────────────────
  // Transcribed from the gallery page's rendered product cards
  // (name / SKU / color / price / sizes). No live feed exists for this
  // site (custom Next.js storefront, no products.json or wc/store/v1),
  // so these are static entries — refresh manually if the catalog changes.
  { id: 'S2001', storeSlug: 'skyt-boutique', name: 'Coord set', image: random(productImage), price: 750, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Raw silk coord set. Blue. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'S2002', storeSlug: 'skyt-boutique', name: 'Coord', image: random(productImage), price: 850, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Raw silk coord. Maroon. Sizes L, M, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'S2003', storeSlug: 'skyt-boutique', name: 'Coord', image: random(productImage), price: 750, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Vertican silk coord. Green. Sizes XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt1001', storeSlug: 'skyt-boutique', name: 'Kurti Top', image: random(productImage), price: 599, currency: 'INR', category: 'Kurti', condition: 'New', description: 'Raw silk kurti top. Violet with brown. Sizes S, M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt1002', storeSlug: 'skyt-boutique', name: 'Kurti Top', image: random(productImage), price: 599, currency: 'INR', category: 'Kurti', condition: 'New', description: 'Raw silk kurti top. Dark blue with light blue. Sizes S, M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'S2004', storeSlug: 'skyt-boutique', name: 'Coord set', image: random(productImage), price: 750, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Raw silk coord set. Purple. Sizes M, L, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-C3002', storeSlug: 'skyt-boutique', name: 'Cotton 3 piece set', image: random(productImage), price: 950, currency: 'INR', category: '3 Piece Set', condition: 'New', description: 'Cotton kurti 3 piece set. Rama green with maroon. Sizes M, L, XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-C3003', storeSlug: 'skyt-boutique', name: '3 piece set', image: random(productImage), price: 950, currency: 'INR', category: '3 Piece Set', condition: 'New', description: 'Cotton kurthi 3 piece set. Maroon and black. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-C3004', storeSlug: 'skyt-boutique', name: '3 piece side slit', image: random(productImage), price: 950, currency: 'INR', category: '3 Piece Set', condition: 'New', description: 'Cotton kurthi, side slit. Mehandi green with maroon. Sizes M, L, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt1005', storeSlug: 'skyt-boutique', name: 'A-line pattern Top only', image: random(productImage), price: 595, currency: 'INR', category: 'Kurti', condition: 'New', description: 'A-line silk kurti with lining, top only. Blue. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-3007', storeSlug: 'skyt-boutique', name: 'Silk 3 piece set', image: random(productImage), price: 1050, currency: 'INR', category: '3 Piece Set', condition: 'New', description: 'Silk 3 piece set. Honey with golden yellow. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-3008', storeSlug: 'skyt-boutique', name: 'Silk 3 piece set', image: random(productImage), price: 1250, currency: 'INR', category: '3 Piece Set', condition: 'New', description: 'Vichitra silk 3 piece set. Dark purple. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-1010', storeSlug: 'skyt-boutique', name: 'Short kurti', image: random(productImage), price: 400, currency: 'INR', category: 'Kurti', condition: 'New', description: 'Cotton short top. Maroon. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'SkytC3006', storeSlug: 'skyt-boutique', name: 'Cotton 3 piece set', image: random(productImage), price: 1200, currency: 'INR', category: '3 Piece Set', condition: 'New', description: 'Kalamkari cotton 3 piece set. Maroon. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt3010', storeSlug: 'skyt-boutique', name: 'Cotton 3 piece set', image: random(productImage), price: 1200, currency: 'INR', category: '3 Piece Set', condition: 'New', description: 'Kalamkari cotton 3 piece set. Purple. Sizes M, L, XL.', seller: 'SKYT Boutique' },
  { id: 'SkytCU3O01', storeSlug: 'skyt-boutique', name: 'Umbrella kurti', image: random(productImage), price: 950, currency: 'INR', category: 'Kurti', condition: 'New', description: 'Dabbu cotton umbrella kurti. Rama blue with orange. Sizes S, M, L, XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-CU1003', storeSlug: 'skyt-boutique', name: 'Cotton umbrella 3 piece set', image: random(productImage), price: 950, currency: 'INR', category: '3 Piece Set', condition: 'New', description: 'Cotton umbrella 3 piece set. Navy blue. Sizes M, L, 3XL.', seller: 'SKYT Boutique' },
  { id: 'SkytC3011', storeSlug: 'skyt-boutique', name: 'Cotton 3 piece set', image: random(productImage), price: 499, currency: 'INR', category: '3 Piece Set', condition: 'New', description: 'Cotton kurthi 3 piece set. Green. Sizes M, L, XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-S3009', storeSlug: 'skyt-boutique', name: 'Party wear Silk 3 piece set', image: random(productImage), price: 1099, currency: 'INR', category: '3 Piece Set', condition: 'New', description: 'Jimmy ju kurti, party wear silk 3 piece set. White. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'SkytS2005', storeSlug: 'skyt-boutique', name: 'Coord', image: random(productImage), price: 750, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Vatican silk coord. Green. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'SkytS2006', storeSlug: 'skyt-boutique', name: 'Coord', image: random(productImage), price: 750, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Vatican silk coord. Blue. Size XL.', seller: 'SKYT Boutique' },
  { id: 'SkytS2007', storeSlug: 'skyt-boutique', name: 'Coord', image: random(productImage), price: 750, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Vatican silk coord. Maroon. Size XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-S2010', storeSlug: 'skyt-boutique', name: 'Coord raw silk', image: random(productImage), price: 750, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Raw silk coord. Brinjal blue. Sizes XL, XXL, L.', seller: 'SKYT Boutique' },
  { id: 'Skyt-R2001', storeSlug: 'skyt-boutique', name: 'Coord Rayon', image: random(productImage), price: 450, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Rayon coord. Brinjal blue. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-R2002', storeSlug: 'skyt-boutique', name: 'Coord rayon', image: random(productImage), price: 450, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Rayon coord. Navy blue. Sizes M, L, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-R2003', storeSlug: 'skyt-boutique', name: 'Coord Rayon', image: random(productImage), price: 450, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Rayon coord. Beige. Sizes M, L, XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-N1001', storeSlug: 'skyt-boutique', name: 'Cotton Nighty', image: random(productImage), price: 350, currency: 'INR', category: 'Nightwear', condition: 'New', description: 'Cotton frock nighty. Orange with navy blue. Size XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-S2011', storeSlug: 'skyt-boutique', name: 'Coord A-line', image: random(productImage), price: 850, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Vatican silk A-line coord. Dark green. Sizes L, XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-S2012', storeSlug: 'skyt-boutique', name: 'Coord A-line', image: random(productImage), price: 850, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Vatican silk A-line kurti with pant. Brick brown. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-S2013', storeSlug: 'skyt-boutique', name: 'Coord A-line', image: random(productImage), price: 850, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Vatican silk A-line coord. Light green. Sizes XL, M, L, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-C2014', storeSlug: 'skyt-boutique', name: 'Coord', image: random(productImage), price: 650, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Cotton coord set. Purple. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-CF001b', storeSlug: 'skyt-boutique', name: 'Frock', image: random(productImage), price: 650, currency: 'INR', category: 'Frock', condition: 'New', description: 'Kalamkari cotton frock. Orange. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-C1008', storeSlug: 'skyt-boutique', name: 'Kalamkari Top', image: random(productImage), price: 599, currency: 'INR', category: 'Kurti', condition: 'New', description: 'Pure kalamkari cotton top with lining. Pink. Sizes XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-CN1003a', storeSlug: 'skyt-boutique', name: 'Cotton nighty', image: random(productImage), price: 350, currency: 'INR', category: 'Nightwear', condition: 'New', description: 'Cotton frock nighty. Dark blue. Size XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-CN1003b', storeSlug: 'skyt-boutique', name: 'Cotton nighty', image: random(productImage), price: 350, currency: 'INR', category: 'Nightwear', condition: 'New', description: 'Cotton frock nighty. Light blue. Size XL.', seller: 'SKYT Boutique' },
  { id: 'SkytC1006', storeSlug: 'skyt-boutique', name: 'Cotton Nighty', image: random(productImage), price: 350, currency: 'INR', category: 'Nightwear', condition: 'New', description: 'Cotton frock nighty. Brown. Size XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-MC001', storeSlug: 'skyt-boutique', name: 'Maxi', image: random(productImage), price: 599, currency: 'INR', category: 'Maxi', condition: 'New', description: 'Cotton maxi with Kalamkari print. Wine. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-MC002', storeSlug: 'skyt-boutique', name: 'Maxi', image: random(productImage), price: 599, currency: 'INR', category: 'Maxi', condition: 'New', description: 'Cotton frock with Kalamkari print. Black. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-MC003', storeSlug: 'skyt-boutique', name: 'Maxi', image: random(productImage), price: 650, currency: 'INR', category: 'Maxi', condition: 'New', description: 'Kalamkari cotton maxi. Maroon. Sizes M, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-MC005', storeSlug: 'skyt-boutique', name: 'Maxi', image: random(productImage), price: 650, currency: 'INR', category: 'Maxi', condition: 'New', description: 'Pure Kalamkari cotton frock, length 46. Blue. Sizes M, XL, XXL, 3XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-MC006', storeSlug: 'skyt-boutique', name: 'Maxi', image: random(productImage), price: 599, currency: 'INR', category: 'Maxi', condition: 'New', description: 'Cotton frock with Kalamkari print. Blue mixed. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-AU001', storeSlug: 'skyt-boutique', name: 'A-line umbrella top', image: random(productImage), price: 699, currency: 'INR', category: 'Kurti', condition: 'New', description: 'Tissue silk A-line umbrella top. Cream. Sizes XL, XXL, 3XL, 4XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-MT008', storeSlug: 'skyt-boutique', name: 'Onam frock', image: random(productImage), price: 699, currency: 'INR', category: 'Frock', condition: 'New', description: 'Tissue with cotton lining. Cream yellow. Sizes XL, XXL, 3XL, 4XL.', seller: 'SKYT Boutique' },
  { id: 'SKYT-CU1011', storeSlug: 'skyt-boutique', name: 'Umbrella Top', image: random(productImage), price: 799, currency: 'INR', category: 'Kurti', condition: 'New', description: 'Umbrella top with lining. Multicolour. Sizes M, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'SKYT-R2001b', storeSlug: 'skyt-boutique', name: 'Coord Set', image: random(productImage), price: 630, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Rayon coord. Rusty orange. Sizes M, L, XL, XXL, 3XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-C3015', storeSlug: 'skyt-boutique', name: 'Kurti with Pant and shawl', image: random(productImage), price: 999, currency: 'INR', category: 'Kurti', condition: 'New', description: 'Cotton kurti with pant and shawl. Rusty orange. Sizes L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-C1020', storeSlug: 'skyt-boutique', name: 'Top only', image: random(productImage), price: 720, currency: 'INR', category: 'Kurti', condition: 'New', description: 'Madras checks cotton top. Multicolour. Sizes M, L, XL, XXL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-C1021', storeSlug: 'skyt-boutique', name: 'A-line kurti', image: random(productImage), price: 699, currency: 'INR', category: 'Kurti', condition: 'New', description: 'Cotton top with lining. Multicolour. Sizes L, XL, XXL, 3XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-C2022', storeSlug: 'skyt-boutique', name: 'Coord', image: random(productImage), price: 850, currency: 'INR', category: 'Coord Set', condition: 'New', description: 'Dhabbu cotton coord. Brinjal flower. Sizes M, L, XL, XXL, 3XL.', seller: 'SKYT Boutique' },
  { id: 'Skyt-G2001', storeSlug: 'skyt-boutique', name: 'Umbrella top with shawl', image: random(productImage), price: 1199, currency: 'INR', category: 'Kurti', condition: 'New', description: 'Georgette umbrella top with shawl. Dark green. Sizes L, XL, XXL, 3XL.', seller: 'SKYT Boutique' },
]

// ─── Back-compat: legacy ALL_STORES / Store shape ──────────────────────────
// Before the earlier consolidation, the local-seller browse page
// (app/(public)/stores/page.tsx) imported ALL_STORES/Store/FilterKey/
// FILTERS/ALPHABET directly, in a shape that predates AffiliatedStore
// (singular `category` instead of `categories[]`, `slug` instead of
// `platform`, `type` instead of `buildType`, `bannerStyle` required rather
// than optional). That page hasn't been rewritten to use
// `affiliatedStores` yet, so these exports are kept — but DERIVED from
// `affiliatedStores` rather than maintained as a separate array, so
// there's still only one place to edit store data.
//
// Do not add new stores to ALL_STORES directly; add them to
// `affiliatedStores` above (with storeType: 'local') and they'll show up
// here automatically. When app/(public)/stores/page.tsx is next touched,
// prefer migrating it to `affiliatedStores` + `buildType` directly and
// deleting this block.

export type StoreType = StoreBuildType
export type FilterKey = 'all' | 'custom' | 'template' | 'new'

export interface Store {
  slug: string
  name: string
  type: StoreType
  isNew?: boolean
  logo: string
  bannerStyle: CSSProperties
  category: string
  description: string
  shipping: string
  payment: string
  tags: string[]
  itemCount: number
}

export const ALL_STORES: Store[] = affiliatedStores
  .filter((s): s is AffiliatedStore & { buildType: StoreBuildType } => s.storeType === 'local' && !!s.buildType)
  .map((s) => ({
    slug: s.platform,
    name: s.name,
    type: s.buildType,
    isNew: s.isNew,
    logo: s.logo,
    bannerStyle: s.bannerStyle ?? {},
    category: s.categories[0],
    description: s.description,
    shipping: s.shipping ?? '',
    payment: s.payment ?? '',
    tags: s.tags ?? [],
    itemCount: s.itemCount ?? 0,
  }))

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom builds' },
  { key: 'template', label: 'Templates' },
  { key: 'new', label: 'New arrivals' },
]

export const ALPHABET = [
  '#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K',
  'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
]