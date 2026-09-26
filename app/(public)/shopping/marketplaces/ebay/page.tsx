import MarketplaceGuide from '@/components/shared/MarketplaceGuide'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/shopping/marketplaces/ebay',
  title: 'Buying from eBay | Wishdrop',
  description: "A guide to sourcing eBay listings through Wishdrop's concierge buying service.",
})

export default function EbayGuidePage() {
  return (
    <MarketplaceGuide
      name="eBay"
      tagline="Auctions, fixed-price listings, and everything from parts to collectibles."
      description="eBay hosts millions of individual sellers, so listings, condition, and shipping policies vary seller-to-seller. Wishdrop buys the specific listing you choose — we don't bid on auctions on your behalf, so auction items should be requested only once you've confirmed the current price and time remaining."
      bestFor={[
        'Used or refurbished electronics and computer parts',
        'Collectibles, trading cards, and hobby items',
        'Fixed-price "Buy It Now" listings',
      ]}
      tips={[
        'Prefer "Buy It Now" listings — auctions can end or change price before we can act on your request.',
        "Check the seller's item condition and return policy in the listing before requesting.",
        'Confirm the listing ships to a forwarding/third-party address, since some sellers restrict destinations.',
      ]}
      storeHref="/stores"
    />
  )
}
