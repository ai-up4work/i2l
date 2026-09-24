// lib/platform-logos.ts
//
// Single source of truth for "which /public/logos/*.png file represents
// this scrape result's site" — used by BOTH the per-platform product
// views (components/platforms/*.tsx, e.g. AmazonProductView's own logo
// badge) AND ItemInfoModal.tsx's generic failure-fallback screen, so a
// scrape that fails for a known platform shows the exact same brand
// mark a successful scrape of that platform would have. One path to
// update when a logo file changes, not the same string repeated in
// every file that needs it — see the request that created this file:
// "make a shared file of those logos so we can make it open for
// modifications and scaling at both."
//
// Keys match ScrapeResult['site'] literals exactly (see the SiteId
// union in lib/scrape/parsers.ts, and ItemInfoModal.tsx's own switch
// statement) — this is deliberately a SEPARATE map from
// data/stores/data.ts's own (currently unused) platformLogos, which
// serves a different purpose (marketplace listing cards on /stores)
// and uses its own, differently-hyphenated key set (e.g. 'tata-cliq'
// vs this file's 'tatacliq'). Conflating the two risked a silent
// key-mismatch bug rather than a missing-file one.
//
// tatacliq is intentionally ABSENT — its product view has never shown a
// logo at all (confirmed by reading the file), so the failure-fallback
// screen shouldn't either. Add an entry the moment it gets a real logo
// and every screen that reads this map (viewer + fallback) picks it up
// automatically, with nothing else to change.
export const SITE_LOGOS: Partial<Record<string, string>> = {
  ajio: '/logos/ajio.png',
  amazon: '/logos/amazon.png',
  ebay: '/logos/ebay.png',
  firstcry: '/logos/firstcry.png',
  flipkart: '/logos/flipkart.png',
  hopscotch: '/logos/hopscotch.png',
  jiomart: '/logos/jiomart.png',
  meesho: '/logos/meesho.png',
  myntra: '/logos/myntra.png',
  nykaa: '/logos/nykaa.png',
  boat: '/logos/boat.png',
  lenskart: '/logos/lenskart.png',
  tatacliq: '/logos/tata-cliq.png',
  seleqt: '/logos/seleqt.png',
  shopify: '/logos/shopify.png',
  snapdeal: '/logos/snapdeal.png',
  westside: '/logos/westside.png',
  woocommerce: '/logos/woocommerce.png',
}
