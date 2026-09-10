// lib/store-detection.ts
//
// Given a store's URL, works out whether it's running on Shopify,
// WooCommerce, or neither — so a non-technical admin can paste a URL and
// have the right extractor picked for them, instead of hand-picking
// "Shopify" vs "WooCommerce" vs "Custom JSON" off a menu they don't
// understand.
//
// Server-side only. Import this from a route handler, not a client
// component — most storefronts don't send CORS headers that would let a
// browser fetch these endpoints directly, and requests to an arbitrary
// third-party domain shouldn't originate from the admin's browser anyway.
//
// Detection is signal-based rather than a single yes/no check, because
// either platform can be customized enough that any one signal alone can
// mislead: a Shopify store on a fully custom theme might not expose
// `Shopify.shop` in its markup, and a WooCommerce store can disable or
// restrict its REST API. Combining a couple of independent signals per
// platform and preferring the stronger *overall* match (see `score`
// below) is more reliable than trusting the first thing that happens to
// respond, or trusting a single 'high' confidence label in isolation.
//
// IMPORTANT, learned the hard way: a bare `/products.json` (or any other
// URL) returning a JSON body shaped like `{ products: [{id,title,
// variants}] }` is NOT proof of Shopify on its own. Plenty of WooCommerce
// stores run product-feed / multichannel-sync plugins (Google Shopping
// feeds, dropshipping tools, marketplace sync) that deliberately emit
// Shopify-compatible JSON at arbitrary paths as an interchange format.
// That shape match used to be treated as high-confidence Shopify evidence
// by itself, which produced false positives on real WooCommerce stores
// (e.g. keralaopticals.com — WooCommerce 11.0.1 per its generator tag,
// but matched as Shopify because some plugin's feed endpoint happened to
// satisfy the shape check). The fix: shape alone is only ever
// medium-confidence now. High confidence additionally requires a
// response header that only Shopify's own infrastructure sets
// (`x-shopid`, `x-sorting-hat-shopid`, or `x-shopify-stage`) — a feed
// plugin bolted onto WordPress/WooCommerce cannot produce those, because
// they come from Shopify's edge servers, not application code.

export type DetectedProviderType = 'shopify' | 'woocommerce' | 'none'

export interface StoreDetectionResult {
  type: DetectedProviderType
  baseUrl: string
  confidence: 'high' | 'medium' | 'low'
  /** Human-readable reasons behind the verdict — shown to the admin so a
   * wrong guess is easy to understand and correct rather than a black box. */
  signals: string[]
  storeName?: string
  currency?: string
  /** Only set when type is 'none' — why detection came up empty. */
  reason?: string
}

const FETCH_TIMEOUT_MS = 9000

// Weights used to build each platform's overall `score` (see PlatformSignal
// below). A 'high' signal is worth meaningfully more than a 'medium' one,
// but several 'medium' signals together can still legitimately outweigh a
// single, less-trustworthy 'high' one — that's the whole point of scoring
// instead of just comparing top confidence labels against each other.
const SIGNAL_WEIGHT = { high: 3, medium: 1 } as const

export function normalizeBaseUrl(input: string): string {
  let url = input.trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  return url.replace(/\/+$/, '')
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      // A genuine, full modern browser UA — deliberately NOT the
      // "Mozilla/5.0 (compatible; AppName/1.0)" shape used previously.
      // That "(compatible; X/1.0)" construction is exactly how real
      // crawlers self-identify (Googlebot, bingbot, etc.), so hosting-
      // level WAFs (Imunify360/CloudLinux being especially common) treat
      // it as a bot signature and 403 it outright — confirmed against a
      // real store where this exact string got blocked while curl's own
      // default UA (and a real browser) both succeeded. A UA that's
      // indistinguishable from an actual browser avoids that blocklist
      // category entirely, rather than just avoiding the word "bot".
      //
      // The rest of these headers matter too, not just the UA: a request
      // carrying only a browser User-Agent but none of the other headers
      // a real browser always sends alongside it (Accept,
      // Accept-Language, the Sec-Fetch-* trio, Upgrade-Insecure-Requests)
      // is itself a mismatch some WAF rule sets flag — a bare UA swap
      // isn't enough to look like a real navigation request. This still
      // won't get past a JS-challenge/TLS-fingerprint style WAF (nothing
      // header-based can), but it closes the gap for header-based bot
      // rules specifically.
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        ...init?.headers,
      },
    })
  } finally {
    clearTimeout(timeout)
  }
}

/** Same as tryJson, but also hands back the Response so callers can inspect
 * headers — needed for the Shopify infra-header check below, which plain
 * tryJson (body-only) can't support. */
async function tryJsonWithResponse<T = unknown>(
  url: string
): Promise<{ data: T; res: Response } | null> {
  try {
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) return null
    return { data: (await res.json()) as T, res }
  } catch {
    return null
  }
}

async function tryJson<T = unknown>(url: string): Promise<T | null> {
  const result = await tryJsonWithResponse<T>(url)
  return result?.data ?? null
}

async function tryText(url: string, retriesLeft = 2): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    return await res.text()
  } catch {
    // A single retry covers the common transient case on shared/managed
    // WordPress hosting: a WAF or rate limiter blips under a brief burst
    // of concurrent requests (this detector fires several at once — see
    // detectStoreProvider) but recovers within a second. Without this,
    // one flaky request could take down the only fallback signal a
    // locked-down WooCommerce site has left.
    if (retriesLeft > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      return tryText(url, retriesLeft - 1)
    }
    return null
  }
}

function extractSiteName(html: string): string | undefined {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
  if (og?.[1]) return og[1].trim()
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (title?.[1]) return title[1].split(/[|\u2013\u2014-]/)[0].trim()
  return undefined
}

/** True only when the response carries a header that Shopify's own edge
 * infrastructure sets on every request to a real Shopify storefront.
 * These come from Shopify's servers, not application code, so a
 * WordPress/WooCommerce site — even one running a plugin that emits
 * Shopify-shaped JSON — cannot reproduce them.
 *
 * Checks several of Shopify's known headers rather than just one: a CDN
 * or reverse proxy in front of a genuine Shopify store can strip an
 * individual header without stripping all of them, and requiring one
 * specific name was rejecting real Shopify stores unnecessarily. */
function hasShopifyInfraHeaders(res: Response): boolean {
  const shopifyHeaderNames = [
    'x-shopid',
    'x-sorting-hat-shopid',
    'x-sorting-hat-podid',
    'x-shopify-stage',
    'x-storefront-renderer-rendered',
    'x-shardid',
  ]
  return shopifyHeaderNames.some((name) => res.headers.has(name))
}

/** True only when the homepage's own <meta name="generator"> tag names
 * WooCommerce specifically — the strongest possible signal short of
 * authenticated API access, since it's WooCommerce/WordPress declaring
 * itself rather than us inferring it from a shape match.
 *
 * Deliberately attribute-order-independent: a single regex requiring
 * name="generator" to appear before content="..." within the tag missed
 * real WooCommerce sites that emit `<meta content="WooCommerce 11.0.1"
 * name="generator">` (content first) — this pulls out each whole <meta>
 * tag first, then checks name= and content= against it independently of
 * where either attribute sits. */
function hasWooCommerceGeneratorTag(html: string): boolean {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? []
  return metaTags.some(
    (tag) => /name=["']generator["']/i.test(tag) && /content=["'][^"']*woocommerce[^"']*["']/i.test(tag)
  )
}

/** Probes for WooCommerce's own plugin readme file — a static asset served
 * directly by the webserver, not routed through WordPress's application
 * layer. This matters because /wp-json/ and the Store API (the other
 * WooCommerce checks below) are both application-layer routes, and a
 * security plugin that locks down the REST API blocks exactly those —
 * this file is usually still reachable in that situation, since there's
 * nothing WordPress-specific gatekeeping static file serving.
 *
 * WooCommerce's readme.txt always opens with "=== WooCommerce ===" per
 * the WordPress.org plugin readme standard, so a match here is about as
 * unambiguous as the generator meta tag — it's the plugin identifying
 * itself, not a shape inference.
 */
async function checkWooCommercePluginReadme(baseUrl: string): Promise<boolean> {
  const text = await tryText(`${baseUrl}/wp-content/plugins/woocommerce/readme.txt`)
  if (!text) return false
  return /^\uFEFF?===\s*woocommerce\s*===/im.test(text)
}

/** Detects WordPress from markup that's already been fetched — no extra
 * request needed. WordPress core injects a `<link rel="https://api.w.org/"
 * href=".../wp-json/">` tag into every page's <head> by default via
 * wp_head(), regardless of whether the REST API endpoint itself is
 * locked down by a security plugin — the tag is just static markup, not
 * a live API call, so it survives exactly the kind of REST API
 * lockdowns that block the direct wp-json/ checks above. Falls back to
 * generic /wp-content/ or /wp-includes/ path references, which show up
 * in asset URLs on virtually any unmodified WordPress theme. */
function hasWordPressFingerprint(html: string): boolean {
  return (
    /<link[^>]+rel=["']https:\/\/api\.w\.org\/["']/i.test(html) ||
    /\/wp-content\/|\/wp-includes\//i.test(html)
  )
}

/** WordPress's virtual robots.txt (generated by core, present even on
 * sites that never touched the file) always disallows /wp-admin/. This
 * is a separate static resource from the homepage, so it's an
 * independent chance to catch the fingerprint if the homepage fetch
 * itself got blocked but robots.txt didn't. Generic to any WordPress
 * site, not WooCommerce-specific — see hasWooCommerceRobotsSignal below
 * for the stronger, platform-specific version of this same idea. */
function hasWordPressRobotsSignal(robotsTxt: string): boolean {
  return /disallow:\s*\/wp-admin\//i.test(robotsTxt)
}

/** Stronger than the generic WordPress check above: WooCommerce creates
 * dedicated pages at /cart/, /checkout/, and /my-account/ by default on
 * every install, and the SEO plugin nearly every WooCommerce store runs
 * (Yoast or RankMath) disallows exactly those slugs in robots.txt to
 * keep them out of search results. A generic WordPress blog with no
 * shop plugin has no reason to have any of these page slugs at all, so
 * finding them here is meaningfully more specific than just "this is
 * WordPress" — it's "this WordPress site has a cart and a checkout". */
function hasWooCommerceRobotsSignal(robotsTxt: string): boolean {
  const wooPathPattern = /disallow:\s*\/(cart|checkout|my-account)\//i
  return wooPathPattern.test(robotsTxt)
}

/** A real Shopify checkout, unless the merchant has set up a fully
 * custom checkout domain (rare), redirects to Shopify's own checkout
 * infrastructure (myshopify.com or shop.app). This works even when a
 * store's theme is customized heavily enough to hide every other
 * Shopify signal, since checkout itself can't be re-themed away from
 * Shopify's servers. Uses `redirect: 'manual'` so the redirect can be
 * inspected instead of silently followed. */
async function checkShopifyCheckoutRedirect(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/checkout`, { redirect: 'manual' })
    if (res.status < 300 || res.status >= 400) return false
    const location = res.headers.get('location') ?? ''
    return /myshopify\.com|shop\.app/i.test(location)
  } catch {
    return false
  }
}

interface PlatformSignal {
  matched: boolean
  confidence: 'high' | 'medium'
  /** Weighted sum of every individual signal that fired — used to break
   * ties when both platforms show some evidence, since a label like
   * 'high' collapses away how much evidence actually backs it up. */
  score: number
  signals: string[]
  storeName?: string
  currency?: string
}

// ---------------------------------------------------------------------------
// Shopify
// ---------------------------------------------------------------------------

interface ShopifyProductsResponse {
  products?: Array<{ id: number; title: string; variants?: Array<{ price: string }> }>
}

interface ShopifyCartResponse {
  currency?: string
  item_count?: number
}

async function checkShopify(baseUrl: string, homepageHtmlPromise: Promise<string | null>): Promise<PlatformSignal> {
  const signals: string[] = []
  let matched = false
  let confidence: 'high' | 'medium' = 'medium'
  let score = 0
  let storeName: string | undefined
  let currency: string | undefined

  // /products.json shape check. On its own this is only medium-confidence
  // evidence — see the file-level comment above for why (feed/sync plugins
  // on other platforms can emit this exact shape). It's upgraded to high
  // confidence only if the response also carries a genuine Shopify infra
  // header, which a non-Shopify server cannot fake.
  const productsResult = await tryJsonWithResponse<ShopifyProductsResponse>(
    `${baseUrl}/products.json?limit=1`
  )
  if (productsResult?.data.products && Array.isArray(productsResult.data.products) && productsResult.data.products.length > 0) {
    matched = true
    if (hasShopifyInfraHeaders(productsResult.res)) {
      confidence = 'high'
      score += SIGNAL_WEIGHT.high
      signals.push('products.json returned Shopify-shaped data, confirmed by Shopify infrastructure headers')
    } else {
      score += SIGNAL_WEIGHT.medium
      signals.push('products.json returned Shopify-shaped product data (shape only — no confirming Shopify headers, could be a feed plugin on another platform)')
    }
  }

  // Currency + a second confirmation: /cart.js is Shopify's public cart
  // endpoint. Shape-only match here is medium-confidence for the same
  // reason as above; also checked against infra headers for a high-
  // confidence bump.
  const cartResult = await tryJsonWithResponse<ShopifyCartResponse>(`${baseUrl}/cart.js`)
  if (cartResult && typeof cartResult.data.item_count === 'number') {
    matched = true
    if (hasShopifyInfraHeaders(cartResult.res)) {
      confidence = 'high'
      score += SIGNAL_WEIGHT.high
      signals.push('cart.js responded with a Shopify-shaped cart, confirmed by Shopify infrastructure headers')
    } else {
      score += SIGNAL_WEIGHT.medium
      signals.push('cart.js responded with a Shopify-shaped cart (shape only — no confirming Shopify headers)')
    }
    if (cartResult.data.currency) currency = cartResult.data.currency
  }

  // Best-effort name + a third confirmation: homepage markup usually
  // references Shopify's CDN or embeds `Shopify.shop`. Unlike the shape
  // checks above, an actual reference to Shopify's own CDN/JS in the
  // page source isn't something another platform's plugin would
  // incidentally produce, so this one is trusted at high confidence
  // directly.
  //
  // Uses the homepage HTML fetch started once in detectStoreProvider and
  // shared with checkWooCommerce, rather than fetching it again here —
  // halves the number of concurrent requests this detector sends to the
  // same origin, which matters on hosts with aggressive rate limiting. By
  // this point the shared fetch has usually already resolved (it started
  // at the same time as this function's own products.json/cart.js
  // calls), so this await rarely adds real latency.
  const homepageHtml = await homepageHtmlPromise
  if (homepageHtml) {
    if (/cdn\.shopify\.com|Shopify\.shop|window\.Shopify/i.test(homepageHtml)) {
      matched = true
      confidence = 'high'
      score += SIGNAL_WEIGHT.high
      signals.push('homepage markup references Shopify (CDN or Shopify.shop)')
    }
    storeName = extractSiteName(homepageHtml)
  }

  return { matched, confidence, score, signals, storeName, currency }
}

// ---------------------------------------------------------------------------
// WooCommerce
// ---------------------------------------------------------------------------

interface WpRestRoot {
  name?: string
  namespaces?: string[]
}

interface WcStoreProduct {
  prices?: { currency_code?: string }
}

async function checkWooCommerce(
  baseUrl: string,
  homepageHtmlPromise: Promise<string | null>,
  robotsTxtPromise: Promise<string | null>
): Promise<PlatformSignal> {
  const signals: string[] = []
  let matched = false
  let confidence: 'high' | 'medium' = 'medium'
  let score = 0
  let storeName: string | undefined
  let currency: string | undefined

  // Strong signal + gives us the store name for free: the WordPress REST
  // API root is public by default and lists which namespaces are active.
  // `wc/store` or `wc/v3` being present confirms WooCommerce specifically,
  // not just "this happens to be a WordPress site". `name` is the site
  // title, which for a storefront is usually the store's display name.
  //
  // Run alongside the plugin-readme probe (a static file, unaffected by
  // REST API lockdowns) and the robots.txt check (another static file,
  // independent of both) rather than only falling back to these after
  // every application-layer check fails — a site that blocks /wp-json/
  // outright shouldn't have to wait through several rounds of failed
  // requests before these cheap, independent signals get a chance to
  // fire.
  const [root, pluginReadmeFound, robotsTxt] = await Promise.all([
    tryJson<WpRestRoot>(`${baseUrl}/wp-json/`),
    checkWooCommercePluginReadme(baseUrl),
    robotsTxtPromise,
  ])

  if (pluginReadmeFound) {
    matched = true
    confidence = 'high'
    score += SIGNAL_WEIGHT.high
    signals.push('WooCommerce plugin readme file found at its standard path (a static asset, unaffected by REST API restrictions)')
  }

  if (robotsTxt && hasWooCommerceRobotsSignal(robotsTxt)) {
    matched = true
    confidence = 'high'
    score += SIGNAL_WEIGHT.high
    signals.push('robots.txt disallows /cart/, /checkout/, or /my-account/ \u2014 WooCommerce\u2019s own default page slugs, not generic WordPress paths (another static file, unaffected by REST API restrictions)')
  }

  if (root) {
    const namespaces = root.namespaces ?? []
    if (namespaces.some((ns) => ns.startsWith('wc/'))) {
      matched = true
      confidence = 'high'
      score += SIGNAL_WEIGHT.high
      signals.push('wp-json root lists an active WooCommerce namespace')
    }
    if (root.name) storeName = root.name
  }

  // Currency + a second confirmation: the public Store API lists products
  // with a currency code on every item. This is a WooCommerce-specific
  // route (not something another platform would serve), so a successful
  // hit here is high-confidence in its own right, not just a supporting
  // "medium" signal — previously this never raised confidence above the
  // default, which let a coincidental Shopify shape-match outrank a real,
  // confirmed WooCommerce Store API response in the tie-break below.
  const products = await tryJson<WcStoreProduct[]>(`${baseUrl}/wp-json/wc/store/v1/products?per_page=1`)
  if (Array.isArray(products) && products.length > 0) {
    matched = true
    confidence = 'high'
    score += SIGNAL_WEIGHT.high
    signals.push('WooCommerce Store API returned product data')
    const code = products[0]?.prices?.currency_code
    if (code) currency = code
  }

  // Best-effort fallback for stores that lock the REST API down. Split
  // into two tiers: the site's own <meta name="generator"> tag naming
  // WooCommerce is about as unambiguous as evidence gets (the platform is
  // declaring itself), so that's high confidence. A looser "the word
  // woocommerce appears somewhere in the markup" match is kept as a
  // weaker medium-confidence fallback for sites that strip the generator
  // tag but still reference WooCommerce elsewhere (e.g. asset paths like
  // /wp-content/plugins/woocommerce/).
  const homepageHtml = matched ? null : await homepageHtmlPromise
  if (!matched && homepageHtml) {
    if (hasWooCommerceGeneratorTag(homepageHtml)) {
      matched = true
      confidence = 'high'
      score += SIGNAL_WEIGHT.high
      signals.push('homepage generator meta tag identifies WooCommerce')
    } else if (/woocommerce/i.test(homepageHtml)) {
      matched = true
      score += SIGNAL_WEIGHT.medium
      signals.push('homepage markup references WooCommerce')
    }
    if (!storeName) storeName = extractSiteName(homepageHtml)
  }

  return { matched, confidence, score, signals, storeName, currency }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function detectStoreProvider(rawUrl: string): Promise<StoreDetectionResult> {
  const baseUrl = normalizeBaseUrl(rawUrl)

  // Started once here and shared with both checks below (as a promise,
  // not an awaited value) — halves the concurrent request count this
  // detector sends to a single origin, since each check would otherwise
  // fetch the same homepage independently on top of its own
  // wp-json/products.json/cart.js/store-API calls. Passing the promise
  // rather than awaiting it up front means this fetch still runs
  // concurrently with everything else instead of serializing in front of
  // it — each check only awaits it at the point it actually needs the
  // HTML (after its own faster checks have already had a chance to
  // resolve first).
  const homepageHtmlPromise = tryText(baseUrl)
  // Same reasoning as homepageHtmlPromise above: fetched once here and
  // shared with checkWooCommerce (for the cart/checkout/my-account
  // signal) and the last-resort tier below (for the generic wp-admin
  // fallback), rather than each fetching robots.txt independently.
  const robotsTxtPromise = tryText(`${baseUrl}/robots.txt`)

  const [shopify, woocommerce] = await Promise.all([
    checkShopify(baseUrl, homepageHtmlPromise),
    checkWooCommerce(baseUrl, homepageHtmlPromise, robotsTxtPromise),
  ])

  if (shopify.matched && !woocommerce.matched) {
    return {
      type: 'shopify',
      baseUrl,
      confidence: shopify.confidence,
      signals: shopify.signals,
      storeName: shopify.storeName,
      currency: shopify.currency,
    }
  }

  if (woocommerce.matched && !shopify.matched) {
    return {
      type: 'woocommerce',
      baseUrl,
      confidence: woocommerce.confidence,
      signals: woocommerce.signals,
      storeName: woocommerce.storeName,
      currency: woocommerce.currency,
    }
  }

  if (shopify.matched && woocommerce.matched) {
    // Both showed some signal — this used to pick whichever had 'high'
    // confidence, which meant a single coincidental high-confidence
    // Shopify match (e.g. a WooCommerce feed plugin's JSON happening to
    // match Shopify's shape) could beat a WooCommerce match resting on
    // several real, corroborating signals. Comparing the accumulated
    // weighted `score` instead means the platform with more (and
    // stronger) independent evidence wins, and confidence labels only
    // break an exact score tie.
    const shopifyWins =
      shopify.score !== woocommerce.score
        ? shopify.score > woocommerce.score
        : shopify.confidence === 'high' && woocommerce.confidence !== 'high'
    const winner = shopifyWins ? shopify : woocommerce
    return {
      type: shopifyWins ? 'shopify' : 'woocommerce',
      baseUrl,
      confidence: 'low',
      signals: [
        ...shopify.signals,
        ...woocommerce.signals,
        'Both platforms showed signals \u2014 picked the stronger match, worth confirming manually.',
      ],
      storeName: winner.storeName,
      currency: winner.currency,
    }
  }

  // ── Last resort: guess rather than give up ──────────────────────────
  // Neither primary check found a confirmed platform. Rather than report
  // "none" here — which just pushes the admin into manual jsonapi/scrape
  // setup even when this genuinely is a Shopify or WooCommerce store that
  // happened to lock down every signal the checks above rely on — try a
  // couple of much harder-to-block fingerprints and guess from those.
  // A wrong guess here just gets corrected by the admin looking at the
  // pre-filled Method section; a missed detection means they never get
  // that head start at all. Confidence is always 'low' on this path,
  // and the signal text says outright that this is inferred, not
  // confirmed, so it's never presented as more certain than it is.
  const [homepageHtml, robotsTxt, shopifyViaCheckout] = await Promise.all([
    homepageHtmlPromise,
    robotsTxtPromise,
    checkShopifyCheckoutRedirect(baseUrl),
  ])
  const wordpressViaRobots = robotsTxt != null && hasWordPressRobotsSignal(robotsTxt)

  if (shopifyViaCheckout) {
    return {
      type: 'shopify',
      baseUrl,
      confidence: 'low',
      signals: [
        "The /checkout page redirects to Shopify's own checkout infrastructure \u2014 this confirms Shopify even though no other signal on the storefront did. Worth a quick manual look, since every other check came back empty.",
      ],
      storeName: homepageHtml ? extractSiteName(homepageHtml) : undefined,
    }
  }

  if (hasWordPressFingerprint(homepageHtml ?? '') || wordpressViaRobots) {
    return {
      type: 'woocommerce',
      baseUrl,
      confidence: 'low',
      signals: [
        'Detected WordPress (via page markup or robots.txt) but could not confirm WooCommerce specifically \u2014 guessing WooCommerce since it\u2019s by far the most common WordPress commerce plugin. Worth confirming manually, since a WordPress site could in principle run different storefront software.',
      ],
      storeName: homepageHtml ? extractSiteName(homepageHtml) : undefined,
    }
  }

  const reachable = homepageHtml != null
  return {
    type: 'none',
    baseUrl,
    confidence: 'low',
    signals: [],
    reason: reachable
      ? 'This store is reachable but showed no Shopify or WooCommerce signals \u2014 it may be a custom-built store.'
      : "We couldn't reach this store's homepage at all \u2014 before assuming it's a custom platform, check whether the URL is correct and whether the store's host blocks automated requests (some hosting-level firewalls block server-to-server traffic outright).",
  }
}