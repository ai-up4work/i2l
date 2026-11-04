// content/store-guides.ts
//
// "Shop <store> from Sri Lanka" guides — one page per big Indian store at
// /shop-from-india/<slug> (app/(public)/shop-from-india/[slug]/page.tsx).
//
// These pages answer the exact searches Sri Lankan shoppers type ("buy
// from Myntra in Sri Lanka", "does Flipkart deliver to Sri Lanka") and are
// the pages AI answers quote. Keep every claim TRUE for Wishdrop:
//   - delivery windows match the product page (Express 12–15 days,
//     Economy 21–28 days),
//   - prohibited items match /prohibited-items,
//   - prices come live from the pricing engine on the page itself.
// Add a store by adding an entry; it appears in the hub, the sitemap and
// llms.txt automatically. Update `reviewed` whenever you re-check a guide.

export interface StoreGuide {
  slug: string
  name: string
  /** The store's own domain, shown as text (not linked). */
  domain: string
  /** One line: what the store is known for. */
  knownFor: string
  /** 2–3 sentences, store-specific. */
  intro: string
  /** What Sri Lankan shoppers typically buy there. */
  popular: string[]
  /** Store-specific buying tips. */
  tips: string[]
  /** Store-specific questions (shared ones are added by the page). */
  faqs: { q: string; a: string }[]
  /** ISO date this guide was last checked. */
  reviewed: string
}

export const STORE_GUIDES: StoreGuide[] = [
  {
    slug: 'amazon-india',
    name: 'Amazon India',
    domain: 'amazon.in',
    knownFor: 'India’s biggest general marketplace — electronics, books, home and everyday essentials.',
    intro:
      'Amazon India lists millions of products from thousands of sellers, but many listings only deliver to Indian addresses and payment usually needs an Indian card or UPI. Wishdrop buys the item on amazon.in for you, checks it, and delivers it to your door in Sri Lanka, priced in rupees (LKR) before you pay.',
    popular: ['Books and stationery', 'Phone and laptop accessories', 'Kitchen and home appliances', 'Ayurvedic and personal-care products', 'Toys and hobby kits'],
    tips: [
      'Send us the exact listing link, including the size, colour or variant you picked — Amazon listings often bundle many variants under one page.',
      'Check who the seller is and their rating; we buy the listing exactly as shown.',
      'Power banks and loose batteries can’t be shipped; devices with a built-in battery may be accepted — ask us first.',
      'Aerosols, nail polish, hair dye and other flammable or pressurised items are not allowed on the flight.',
    ],
    faqs: [
      {
        q: 'Does Amazon India deliver to Sri Lanka?',
        a: 'Most Amazon.in listings only deliver within India. With Wishdrop you send the listing link, we buy it in India, quality-check it and deliver it to your address in Sri Lanka.',
      },
      {
        q: 'Can I pay for Amazon India items in Sri Lankan rupees?',
        a: 'Yes. Wishdrop converts the price and quotes you one total in LKR. You pay that total with a Visa or Mastercard card or a supported mobile wallet; there’s no separate conversion at payment time.',
      },
    ],
    reviewed: '2026-10-26',
  },
  {
    slug: 'flipkart',
    name: 'Flipkart',
    domain: 'flipkart.com',
    knownFor: 'Big sale events and strong prices on phones, electronics, fashion and home goods.',
    intro:
      'Flipkart is one of India’s largest online stores and is known for big sale events, but it only delivers to Indian PIN codes. Wishdrop orders Flipkart items for you in India and brings them to your door in Sri Lanka, with the full price shown in rupees before you commit.',
    popular: ['Mobile accessories and audio', 'Fashion and footwear', 'Home and kitchen', 'Sports and fitness gear', 'Baby and kids’ products'],
    tips: [
      'Sale prices can end quickly — send the link as soon as you’ve decided.',
      'Bank-card offers on Flipkart need an Indian card, so the price we quote is the regular listing price.',
      'Choose the exact variant (size, colour, storage) before copying the link.',
      'Loose batteries and power banks can’t be shipped.',
    ],
    faqs: [
      {
        q: 'Does Flipkart ship to Sri Lanka?',
        a: 'No, Flipkart delivers within India only. Wishdrop buys the item in India and delivers it to you in Sri Lanka.',
      },
    ],
    reviewed: '2026-10-26',
  },
  {
    slug: 'myntra',
    name: 'Myntra',
    domain: 'myntra.com',
    knownFor: 'India’s fashion and lifestyle store — clothing, ethnic wear, shoes and accessories.',
    intro:
      'Myntra carries thousands of Indian and international fashion brands, including a large ethnic-wear range, but it delivers only within India. Wishdrop buys from Myntra for you, checks the item matches your order, and delivers it to Sri Lanka.',
    popular: ['Sarees, kurtas and ethnic wear', 'Casual and occasion wear', 'Shoes and sandals', 'Bags, watches and accessories', 'Kids’ clothing'],
    tips: [
      'Check the brand’s size chart on Myntra — Indian sizes can differ from what you usually wear.',
      'Copy the link after selecting your size so we buy the right one.',
      'We check the item matches your order (style, colour, size) at our facility before it ships.',
    ],
    faqs: [
      {
        q: 'Can I order from Myntra in Sri Lanka?',
        a: 'Myntra only delivers to Indian addresses. Through Wishdrop you send the product link, we place the order in India and deliver it to your door in Sri Lanka.',
      },
      {
        q: 'Can I return a Myntra item bought through Wishdrop?',
        a: 'Returns and exchanges follow Wishdrop’s Refund & Cancellation Policy. If you receive a wrong or damaged item, contact us and we’ll sort it out.',
      },
    ],
    reviewed: '2026-10-26',
  },
  {
    slug: 'ajio',
    name: 'AJIO',
    domain: 'ajio.com',
    knownFor: 'Reliance’s fashion store — trend-led clothing, international brands and Indian labels.',
    intro:
      'AJIO stocks a mix of Indian labels and international fashion brands and runs frequent discounts, but delivery is limited to India. Wishdrop orders from AJIO for you and delivers to Sri Lanka, with the full cost in rupees up front.',
    popular: ['Western and ethnic wear', 'Sneakers and footwear', 'Handbags and accessories', 'Menswear basics'],
    tips: [
      'Coupon codes that need an Indian account or card can’t be applied; we quote the listed price.',
      'Pick your size before copying the link.',
      'Discounts can end quickly — send the link as soon as you’ve decided.',
    ],
    faqs: [
      {
        q: 'Does AJIO deliver to Sri Lanka?',
        a: 'AJIO delivers within India. Wishdrop buys the item in India and delivers it to your address in Sri Lanka.',
      },
    ],
    reviewed: '2026-10-26',
  },
  {
    slug: 'nykaa',
    name: 'Nykaa',
    domain: 'nykaa.com',
    knownFor: 'India’s leading beauty store — skincare, make-up, haircare and fragrance.',
    intro:
      'Nykaa is India’s go-to store for beauty and personal care, with Indian and international brands. Many beauty products can travel by air, but some can’t, so it’s worth checking before you order. Wishdrop buys from Nykaa for you and delivers to Sri Lanka.',
    popular: ['Skincare (serums, moisturisers, sunscreen)', 'Make-up', 'Haircare', 'Ayurvedic and natural beauty brands'],
    tips: [
      'Nail polish, hair dye, aerosol sprays and other flammable or pressurised products can’t be flown — leave them out of your order.',
      'Perfumes and alcohol-based products may be restricted; ask us before ordering.',
      'Check expiry and batch details in the listing; we check the item matches your order before it ships.',
    ],
    faqs: [
      {
        q: 'Can I buy Nykaa products in Sri Lanka?',
        a: 'Yes, through Wishdrop. Send the Nykaa link, we buy it in India and deliver it to you. Flammable or pressurised items such as nail polish, hair dye and aerosols can’t be shipped.',
      },
      {
        q: 'Which beauty products can’t be shipped from India to Sri Lanka?',
        a: 'Items classed as dangerous for air freight — including nail polish, hair dye, aerosol sprays and products with high alcohol content. See our Prohibited Items page for the full list.',
      },
    ],
    reviewed: '2026-10-26',
  },
  {
    slug: 'meesho',
    name: 'Meesho',
    domain: 'meesho.com',
    knownFor: 'Low-price fashion, home and lifestyle products from small Indian sellers.',
    intro:
      'Meesho is known for very low prices from small sellers across India. It delivers only within India and most listings are from individual suppliers. Wishdrop buys Meesho items for you and checks them before they travel to Sri Lanka.',
    popular: ['Affordable sarees and kurtis', 'Jewellery and accessories', 'Home décor', 'Kids’ wear'],
    tips: [
      'On very low-priced items, delivery and service charges make up more of the total, so it can be worth ordering several items together.',
      'Photos on small-seller listings can differ from the real product. We check the item matches the listing at our facility.',
      'Use the price estimator to see the delivered total before you send a link.',
    ],
    faqs: [
      {
        q: 'Does Meesho deliver to Sri Lanka?',
        a: 'No, Meesho delivers within India only. Wishdrop buys Meesho items in India and delivers them to your door in Sri Lanka.',
      },
    ],
    reviewed: '2026-10-26',
  },
  {
    slug: 'firstcry',
    name: 'FirstCry',
    domain: 'firstcry.com',
    knownFor: 'Baby and kids’ products — clothing, toys, feeding, diapers and school supplies.',
    intro:
      'FirstCry is India’s largest store for baby and kids’ products, from clothing and toys to feeding and nursery items. Wishdrop buys from FirstCry for you and delivers to Sri Lanka, with everything checked before it ships.',
    popular: ['Kids’ clothing and footwear', 'Toys and learning games', 'Feeding and nursery products', 'School bags and stationery'],
    tips: [
      'Bulky items such as strollers and car seats are priced by weight, so check the total with the price estimator first.',
      'Toys with loose batteries can’t be shipped with the batteries; batteries fitted inside may be accepted — ask us.',
      'Kids’ sizes vary between brands; check FirstCry’s size guide.',
    ],
    faqs: [
      {
        q: 'Can I order from FirstCry to Sri Lanka?',
        a: 'Through Wishdrop, yes. Send the FirstCry link and we buy it in India, check it and deliver it to you in Sri Lanka.',
      },
    ],
    reviewed: '2026-10-26',
  },
  {
    slug: 'tata-cliq',
    name: 'Tata CLiQ',
    domain: 'tatacliq.com',
    knownFor: 'Tata’s store for branded fashion, watches, electronics and luxury.',
    intro:
      'Tata CLiQ sells branded fashion, footwear, watches and electronics from the Tata group and partner brands, delivering within India. Wishdrop orders from Tata CLiQ for you and delivers to Sri Lanka.',
    popular: ['Branded watches', 'Footwear', 'Fashion and accessories', 'Headphones and gadgets'],
    tips: [
      'For watches and electronics, copy the link of the exact model you want.',
      'Devices with built-in batteries may be accepted; loose batteries and power banks are not — ask us if unsure.',
      'We check branded items match the listing before they leave India.',
    ],
    faqs: [
      {
        q: 'Does Tata CLiQ ship internationally to Sri Lanka?',
        a: 'Tata CLiQ delivers within India. Wishdrop buys for you in India and delivers to your door in Sri Lanka.',
      },
    ],
    reviewed: '2026-10-26',
  },
]

export function getStoreGuide(slug: string): StoreGuide | undefined {
  return STORE_GUIDES.find((g) => g.slug === slug)
}

/** Questions every guide answers (the page fills in live prices/times). */
export const SHARED_GUIDE_FAQS = (storeName: string) => [
  {
    q: `How long does delivery from ${storeName} to Sri Lanka take?`,
    a: 'Express usually arrives in about 12–15 days from purchase. Economy, when available, usually takes about 3–4 weeks. Timelines depend on the seller’s dispatch time and import processing, and we tell you early if anything runs late.',
  },
  {
    q: 'Do I have to pay anything when the parcel arrives?',
    a: 'No. The total you accept is all-in: the product, international shipping and handling, Wishdrop’s service and delivery. There’s nothing more to pay on delivery unless your order changes after purchase.',
  },
  {
    q: 'Do I need an Indian address or a parcel-forwarding account?',
    a: 'No. Wishdrop buys the item for you, so you never give the seller an address yourself and there’s nothing to forward or declare.',
  },
  {
    q: 'How do I pay?',
    a: 'With a Visa or Mastercard debit or credit card, a supported mobile wallet, or Wishdrop wallet credit. You pay in full when you accept the quote, before we buy the item.',
  },
]
