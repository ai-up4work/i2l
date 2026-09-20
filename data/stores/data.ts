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
//
// This file is ALSO the source of truth for the scraper QA tool's test
// case list (app/demo/scraper-qa). To add a platform to that tool, set
// `sampleProductUrl` + `sampleProductLabel` (and `scraperSite` only if it
// differs from `platform`) on that store's entry below — see
// `scraperTestLinks` at the bottom of this file. Don't maintain a
// separate preset-links array anywhere else.

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

  // ── QA-tool only (app/demo/scraper-qa) ──────────────────────────────────
  /**
   * The site identifier the scraper's `ScrapeResult.site` actually returns
   * for this platform, when it differs from `platform` (e.g. tata-cliq's
   * slug is 'tata-cliq' but the scraper literal is 'tataCliq'; the two
   * local sellers used to exercise the Shopify/WooCommerce code paths
   * report 'shopify'/'woocommerce' rather than their own platform slug).
   * Falls back to `platform` when omitted — see `scraperTestLinks` below.
   */
  scraperSite?: string
  /**
   * A real, live product-page URL used by the scraper QA tool as this
   * platform's test case. Only set on platforms actually exercised there.
   * Must be paired with `sampleProductLabel`.
   */
  sampleProductUrl?: string
  /**
   * Short product label shown next to the platform in the QA tool's test
   * case list. Required alongside sampleProductUrl.
   */
  sampleProductLabel?: string
}

// Platform → logo path map, served from /public/logos. Kept alongside
// affiliatedStores since it's the same "which store, which logo" concern,
// just for marketplaces referenced by name rather than by their own
// AffiliatedStore entry's `logo` field.
export const platformLogos: Record<string, string> = {
  amazon: '/logos/amazon.png',
  meesho: '/logos/meesho.png',
  firstcry: '/logos/firstcry.png',
  flipkart: '/logos/flipkart.png',
  myntra: '/logos/myntra.png',
  ebay: '/logos/ebay.png',
  aliexpress: '/logos/aliexpress.png',
  'tata-cliq': '/logos/tata-cliq.png',
  nykaa: '/logos/nykaa.png',
  ajio: '/logos/ajio.png',
  hopscotch: '/logos/hopscotch.png',
}


export const affiliatedStores: AffiliatedStore[] = [
  // ── International marketplaces (proxy-shopping / request flow) ──────────
  {
    platform: 'firstcry',
    name: 'FirstCry',
    logo: '/logos/firstcry-squared.png',
    url: 'https://www.firstcry.com',
    country: 'India',
    flag: '🇮🇳',
    description:
      'India’s largest baby & kids store, with a wide range of clothing, toys, and essentials for newborns and toddlers.',
    categories: ['Baby & Kids', 'Clothing', 'Toys', 'Essentials'],
    storeType: 'marketplace',
    sampleProductUrl:
      'https://www.firstcry.com/babyoye/babyoye-interlock-knit-100-cotton-with-eco-jiva-finish-full-sleeves-floral-and-animal-printed-onesies-pack-of-5-green-peach-white-and-pink/24045357/product-detail',
    sampleProductLabel: 'Solid Mesh Woven and Sleeveless Party Gown',
  },
  {
    platform: 'flipkart',
    name: 'Flipkart',
    logo: '/logos/flipkart-squared.png',
    url: 'https://www.flipkart.com',
    country: 'India',
    flag: '🇮🇳',
    description: "India's largest online marketplace — fashion, electronics, home, and more.",
    categories: ['Fashion', 'Electronics', 'Home', 'Beauty'],
    storeType: 'marketplace',
    // NOTE: this URL was previously mislabeled as "iPhone 16 (Black, 128GB)" —
    // the pid/listing is actually the Hirvanti Fashion kurta/palazzo/dupatta
    // set (see the raw response panel in the QA tool, or /extractors/flipkart.ts
    // conversation history). Label corrected to match what actually loads.
    sampleProductUrl:
      'https://www.flipkart.com/hirvanti-fashion-women-kurta-palazzo-dupatta-set/p/itma16998712bd40?pid=ETHHNQWGKV85JY2D&lid=LSTETHHNQWGKV85JY2DH7RLUH&marketplace=FLIPKART&store=clo%2Fcfv%2Fitg%2Ftys&srno=b_1_1&otracker=browse&fm=organic&iid=en_DIMRSdSJ8rGz01s5Pj3iFprDwN2FvREYilYnaTHJQW7eX6sTmwIetQX6F4yZ8Q58bcKbShOThGh39YCpvxQ5-fLR97jDkjjZ_ApNKGWQj8XwDv6ho9S0FaFwZOHRGkVF&ppt=None&ppn=None&ssid=zycvby6lsw0000001787930303370&ov_redirect=true',
    sampleProductLabel: 'Women Silk Blend Kurta Palazzo Dupatta Set',
  },
  {
    platform: 'meesho',
    name: 'Meesho',
    logo: '/logos/meesho-squared.png',
    url: 'https://www.meesho.com',
    country: 'India',
    flag: '🇮🇳',
    description: 'India’s social commerce platform for small businesses and entrepreneurs, offering a wide range of products.',
    categories: ['Fashion', 'Home', 'Beauty', 'Electronics'],
    storeType: 'marketplace',
    sampleProductUrl:
      'https://www.meesho.com/best-daily-wear-georgette-printed-saree-with-full-saree-lace-border-with-running-unstitched-blouse-piece-fancy-womens-designer-saree-most-trending-sari-bollywood-saree-georgette-ki-sadi-daily-use-sadi-nai-design-of-sadi-fancy-saree-naye-design-of-saree-poonam-saree-new-arrival-latest-sari/p/2g3inh',
    sampleProductLabel: 'Silk Printed Daily Wear Saree',
  },
  {
    platform: 'amazon',
    name: 'Amazon',
    logo: '/logos/amazon-squared.png',
    url: 'https://www.amazon.in',
    country: 'India',
    flag: '🇮🇳',
    description: "The world's largest catalog — books, electronics, home goods, and exclusive US-only releases.",
    categories: ['Electronics', 'Books', 'Home', 'Toys'],
    storeType: 'marketplace',
    sampleProductUrl:
      'https://www.amazon.com/Hanes-Ecosmart-Fleece-Full-zip-Sweatshirt/dp/B0DJFJKDP1',
    sampleProductLabel: "Hanes Men's EcoSmart Fleece Hoodie",
  },
  {
    // A real storefront, not a pure link-out aggregator — corrected
    // after seeing an actual product page's rendered markup (own price,
    // own size selector, own PIN-code delivery check, a "Wishlink
    // Assured" badge). Its own "About" copy still calls it a
    // "creator-curated shopping feed" and Wishlink's own job postings
    // mention brand partners like Amazon/Flipkart/Myntra/Nykaa/Ajio —
    // but for the products it fulfills directly (ZUMMER, Miss Chase,
    // Janasya seen on the one page inspected so far), checkout happens
    // ON Seleqt, not via handoff. Extractor: lib/scrape/extractors/
    // seleqt.ts — the page is client-rendered (a plain fetch() gets an
    // empty shell, confirmed against this exact sampleProductUrl), so
    // it's wired into parsers.ts's RENDER_FALLBACK_HOSTS to force
    // Playwright rendering from the start, not just as the conditional
    // variant-only fallback most extractors use it for.
    platform: 'seleqt',
    name: 'Seleqt by Wishlink',
    logo: '/logos/seleqt-squared.png',
    url: 'https://seleqt.wishlink.com',
    country: 'India',
    flag: '🇮🇳',
    description: 'Creator-curated fashion picks from Amazon, Flipkart, Myntra, Nykaa, Ajio and more, all in one feed.',
    categories: ['Fashion', 'Beauty'],
    storeType: 'marketplace',
    sampleProductUrl: 'https://seleqt.wishlink.com/product/1080452',
    sampleProductLabel: 'Cotton Floral Embroidered Dress',
  },
  {
    platform: 'myntra',
    name: 'Myntra',
    logo: '/logos/myntra-squared.png',
    url: 'https://www.myntra.com',
    country: 'India',
    flag: '🇮🇳',
    description: "India's leading fashion marketplace — apparel, footwear, and beauty from hundreds of brands.",
    categories: ['Fashion', 'Beauty', 'Footwear'],
    storeType: 'marketplace',
    sampleProductUrl:
      'https://www.myntra.com/sports-shoes/hrx+by+hrithik+roshan/hrx-by-hrithik-roshan-men-textile-running-non-marking-shoes/37742061/buy',
    sampleProductLabel: 'HRX Running Shoes',
  },
  {
    platform: 'tata-cliq',
    name: 'Tata CLiQ',
    logo: '/logos/tata-cliq-squared.png',
    url: 'https://www.tatacliq.com',
    country: 'India',
    flag: '🇮🇳',
    description: "A premium multi-brand marketplace for fashion, electronics, and lifestyle — Tata's answer to luxury e-commerce.",
    categories: ['Fashion', 'Electronics', 'Beauty'],
    storeType: 'marketplace',
    scraperSite: 'tataCliq', // slug is 'tata-cliq'; scraper's ScrapeResult.site returns 'tataCliq'
    sampleProductUrl: 'https://www.tatacliq.com/hop-kids-girls-by-westside-beige-slingbag-design-cotton-aline-dress/p-mp000000031753767',
    sampleProductLabel: 'Mabish',
  },
  {
    platform: 'nykaa',
    name: 'Nykaa',
    logo: '/logos/nykaa-squared.png',
    url: 'https://www.nykaa.com',
    country: 'India',
    flag: '🇮🇳',
    description: "India's largest beauty and wellness marketplace, with makeup, skincare, and fragrance from global brands.",
    categories: ['Beauty', 'Wellness', 'Fashion'],
    storeType: 'marketplace',
    sampleProductUrl:
      'https://www.nykaa.com/tresemme-keratin-smooth-with-argan-oil-shampoo/p/208997?productId=208997&pps=19',
    sampleProductLabel: 'Hair Serum for Women for Dry and Rough Hair',
  },
  {
    platform: 'ajio',
    name: 'Ajio',
    logo: '/logos/ajio-squared.png',
    url: 'https://www.ajio.com',
    country: 'India',
    flag: '🇮🇳',
    description: "Reliance's fashion marketplace — trending apparel, footwear, and accessories across price points.",
    categories: ['Fashion', 'Footwear', 'Accessories'],
    storeType: 'marketplace',
    sampleProductUrl:
      'https://www.ajio.com/kashianxstyle-women-high-rise-relaxed-jeans/p/702297973_blue',
    sampleProductLabel: 'Fabflee X AG Solid Wide Leg Trousers',
  },
  {
    platform: 'hopscotch',
    name: 'HopScotch',
    logo: '/logos/hopscotch-squared.png',
    url: 'https://www.hopscotch.in',
    country: 'India',
    flag: '🇮🇳',
    description: "India's go-to marketplace for baby and kids' fashion, toys, and essentials.",
    categories: ['Baby & Kids', 'Fashion', 'Toys'],
    storeType: 'marketplace',
    sampleProductUrl: `https://www.hopscotch.in/product/1319830/girl's-peach-party-dresses`,
    sampleProductLabel: 'Ruffled Bow Applique Dress',
  },
  {
    platform: 'Westside',
    name: 'Westside',
    logo: '/logos/westside-squared.png',
    url: 'https://www.westside.com',
    country: 'India',
    flag: '🇮🇳',
    description: "India's fashion and lifestyle brand — apparel, footwear, and accessories for men, women, and kids.",
    categories: ['Fashion', 'Footwear', 'Accessories'],
    storeType: 'marketplace',
    sampleProductUrl:
      'https://westside.com/products/gia-black-double-layered-cotton-a-line-dress-301086834?Color=Black&Size=XS',
    sampleProductLabel: 'Superstar Dark Brown Heart-Detail Hooded Cotton Jacket',
  },
  // {
  //   platform: 'ebay',
  //   name: 'eBay',
  //   logo: '/logos/ebay-squared.png',
  //   url: 'https://www.ebay.com',
  //   country: 'United States',
  //   flag: '🇺🇸',
  //   description: 'The original global marketplace — new, used, and rare finds, from electronics to collectibles.',
  //   categories: ['Electronics', 'Collectibles', 'Fashion'],
  //   storeType: 'marketplace',
  //   sampleProductUrl: 'https://www.ebay.com/itm/366055212799?var=635850429733',
  //   sampleProductLabel: 'Wireless Bluetooth Earbuds',
  // },
  // {
  //   platform: 'aliexpress',
  //   name: 'AliExpress',
  //   logo: '/logos/aliexpress-squared.png',
  //   url: 'https://www.aliexpress.com',
  //   country: 'China',
  //   flag: '🇨🇳',
  //   description: 'Massive catalog direct from manufacturers — electronics, gadgets, home goods, and fashion at low prices.',
  //   categories: ['Electronics', 'Gadgets', 'Home', 'Fashion'],
  //   storeType: 'marketplace',
  //   scraperSite: 'Aliexpress', // preserving original preset-link casing (capital A)
  //   sampleProductUrl:
  //     'https://www.aliexpress.com/item/1005010090865518.html?spm=a2g0o.productlist.main.3.2bd5fyb2fyb2AP&algo_pvid=c33373f1-7604-4220-ade3-7adc7652e0a0&algo_exp_id=c33373f1-7604-4220-ade3-7adc7652e0a0-2&pdp_ext_f=%7B%22order%22%3A%221215%22%2C%22spu_best_type%22%3A%22price%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D&pdp_npi=6%40dis%21LKR%2119803.98%219843.34%21%21%21360.89%21179.38%21%402140cf5017893760822927147e115f%2112000052306071265%21sea%21LK%210%21ABX%211%210%21n_tag%3A-29910%3Bd%3Aef17001a%3Bm03_new_user%3A-29895%3BpisId%3A5000000216878933&curPageLogUid=DnaE0SYHPS97&utparam-url=scene%3Asearch%7Cquery_from%3A%7Cx_object_id%3A1005010090865518%7C_p_origin_prod%3A',
  //   sampleProductLabel: `Talenza Women's Plush Pullover Fashion Solid Loose High Street Sweaters Vintage Chic Strapless Autumn Casual Female Pullovers`,
  // },

  // ── Local sellers (direct catalog / WhatsApp order flow) ─────────────────
  {
    platform: 'Shopify', // Shopify-powered storefront, but the platform slug is the store's own name
    name: 'sok-it.com',
    logo: '/store-icon/sok.png',
    country: 'India',
    flag: '🇮🇳',
    description:
      ' A locla dring brand that sells a variety of products, including clothing, accessories, and home decor. They offer a curated selection of items that are designed to be both stylish and functional.',
    categories: ['Clothing', 'Accessories', 'Home Decor'],
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
    // shopify.com is the platform's own marketing site, not a store — this
    // Shopify-powered storefront is the real QA case for the Shopify code
    // path (JSON-API fetch, see ShopifyProductView / parsers.ts).
    scraperSite: 'shopify',
    sampleProductUrl:
      'https://sok-it.com/products/javasok-spooky-season?variant=45548416106668',
    sampleProductLabel: "Men's Wool Runners",
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
    // This WooCommerce-powered storefront is the real QA case for the
    // WooCommerce code path (Store API fetch, see WooCommerceProductView).
    scraperSite: 'woocommerce',
    sampleProductUrl: 'https://bedapper.lk/product/mens-regular-fit-textured-short-sleeve-shirt-2/',
    sampleProductLabel: 'Nike Air Max 270',
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

// Hardcoded on purpose — see the note on hooks/useAffiliatedStores.ts and
// lib/supabase/affiliated-stores.ts for why. International marketplaces
// (Amazon, eBay, etc.) aren't onboarded through the seller portal like
// local sellers are, so there's no `sellers` row for them and no reason
// to need one: adding a new one is a code change + redeploy either way,
// so it may as well just be an array edit here instead of a DB write.
export const marketplaceStores: AffiliatedStore[] = affiliatedStores.filter(
  (s) => s.storeType === 'marketplace',
)

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

// ─── Scraper QA test links (derived) ────────────────────────────────────────
// Single source of truth for app/demo/scraper-qa's test-case list. To add
// a new platform to the QA tool, set `sampleProductUrl` + `sampleProductLabel`
// (and `scraperSite` only if it differs from `platform`) on that store's
// entry in `affiliatedStores` above — don't add entries here directly, and
// don't maintain a separate preset-links array in the QA client.

export type ScraperTestLink = {
  site: string
  label: string
  product: string
  url: string
}

export const scraperTestLinks: ScraperTestLink[] = affiliatedStores
  .filter(
    (s): s is AffiliatedStore & { sampleProductUrl: string; sampleProductLabel: string } =>
      !!s.sampleProductUrl && !!s.sampleProductLabel,
  )
  .map((s) => ({
    site: s.scraperSite ?? s.platform,
    label: s.name,
    product: s.sampleProductLabel,
    url: s.sampleProductUrl,
  }))