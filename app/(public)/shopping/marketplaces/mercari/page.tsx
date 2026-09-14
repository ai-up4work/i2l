import MarketplaceGuide from '@/components/shared/MarketplaceGuide'

export const metadata = {
  title: 'Buying from Mercari | WishDrop',
  description: "A guide to sourcing Mercari listings through WishDrop's concierge buying service.",
}

export default function MercariGuidePage() {
  return (
    <MarketplaceGuide
      name="Mercari"
      tagline="A peer-to-peer marketplace known for fashion, collectibles, and hobby finds."
      description="Mercari listings are sold by individual users rather than registered stores, so photos and descriptions are the best guide to real condition. Since listings can sell out quickly, we recommend requesting an item as soon as you've decided, and having a backup option in mind in case it's no longer available by the time we process your request."
      bestFor={[
        'Fashion, streetwear, and secondhand designer pieces',
        'Anime, gaming, and pop-culture collectibles',
        'One-off or limited-availability finds',
      ]}
      tips={[
        'Message the seller through Mercari first if you have condition questions — we purchase the listing as-is.',
        'Because stock is often single-unit, requests are first-come, first-served and may sell out before purchase.',
        'Read all listing photos carefully; secondhand items are quality-checked against the listing, not against "like new" assumptions.',
      ]}
      storeHref="/stores"
    />
  )
}
