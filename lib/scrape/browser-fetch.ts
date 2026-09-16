import type { Browser, BrowserContext, Page, Request } from 'playwright-core'

let browserPromise: Promise<Browser> | null = null

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_EXECUTION_ENV)

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY
const BROWSERLESS_WS_ENDPOINT =
  process.env.BROWSERLESS_WS_ENDPOINT || 'wss://production-sfo.browserless.io/chromium'
const BROWSERLESS_CONNECT_TIMEOUT_MS = Number(process.env.BROWSERLESS_CONNECT_TIMEOUT_MS) || 45000
const BROWSERLESS_CONNECT_MAX_ATTEMPTS = Number(process.env.BROWSERLESS_CONNECT_MAX_ATTEMPTS) || 2

// ---------------------------------------------------------------------
// NEW: Proxy configuration for the headless-render tier.
//
// Set these when you have residential/ISP proxy credentials (Bright
// Data, Oxylabs, Smartproxy, IPRoyal, etc). This is applied at the
// Playwright BrowserContext level via `proxy`, so it works whether the
// browser itself came from Browserless, serverless-launched Chromium,
// or a local/Docker launch — it's the CONTEXT's egress that changes,
// not how the browser process was started.
//
// PROXY_URL format: "http://username:password@host:port" or
// "http://host:port" if using IP-allowlisting instead of credentials.
// Some providers want the auth split out — see PROXY_USERNAME /
// PROXY_PASSWORD below for that shape instead.
//
// IMPORTANT: If you're connecting to a remote Browserless instance,
// check whether your Browserless plan already includes proxy/residential
// IP options server-side (many do, via query params on the WS endpoint
// itself) — that may be simpler and cheaper than layering your own
// proxy underneath a Browserless session. This PROXY_* config is for
// when you're launching your own browser (local/Docker/serverless
// Chromium) and need to control egress yourself.
// ---------------------------------------------------------------------
const PROXY_SERVER = process.env.PROXY_SERVER // e.g. "http://host:port"
const PROXY_USERNAME = process.env.PROXY_USERNAME
const PROXY_PASSWORD = process.env.PROXY_PASSWORD

// ---------------------------------------------------------------------
// NEW: Country targeting, specifically for sites (like Ajio) that
// geo-block at the edge based on request origin rather than doing
// classic bot/fingerprint detection. See the diagnostic writeup that
// led here: a residential IP in a non-India country got an immediate
// Akamai 403 with no CAPTCHA challenge — a signature of geo-blocking,
// not bot detection. A random residential IP anywhere in the world
// does NOT fix this; the proxy's exit node specifically needs to be in
// the target country.
//
// PROXY_COUNTRY: ISO 3166-1 alpha-2 code, e.g. "IN" for India. How this
// gets applied depends on your provider's convention — most major
// residential proxy providers use ONE of these two patterns:
//
//   1. Username-suffix targeting (Bright Data, Oxylabs, SOAX, IPRoyal,
//      most "rotating residential" style providers):
//        base username "customer-abc123" becomes
//        "customer-abc123-country-in" (Bright Data),
//        "customer-abc123-cc-IN" (Oxylabs), etc.
//      The exact separator/format is provider-specific — set
//      PROXY_USERNAME_COUNTRY_TEMPLATE to match yours, using {username}
//      and {country} as placeholders. Defaults to Bright Data's format
//      since it's the most common; override for other providers.
//
//   2. Dedicated country endpoint/subdomain (some providers give you a
//      literally different host per country, e.g.
//      "in.smartproxy.com:10000" instead of a generic gateway):
//      set PROXY_SERVER_COUNTRY_TEMPLATE instead, using {country} as a
//      placeholder, e.g. "http://{country}.smartproxy.com:10000".
//      When this is set it takes priority over the username-suffix
//      approach for PROXY_SERVER itself.
//
// Check your specific proxy provider's docs for their exact convention
// — these two templates cover the overwhelming majority of providers,
// but the separator/casing details vary (some want lowercase "in",
// some want uppercase "IN" — set PROXY_COUNTRY to match whatever your
// provider's docs show, template substitution does not alter its case).
// ---------------------------------------------------------------------
const PROXY_COUNTRY = process.env.PROXY_COUNTRY // e.g. "IN"
const PROXY_USERNAME_COUNTRY_TEMPLATE =
  process.env.PROXY_USERNAME_COUNTRY_TEMPLATE || '{username}-country-{country}' // Bright Data default shape
const PROXY_SERVER_COUNTRY_TEMPLATE = process.env.PROXY_SERVER_COUNTRY_TEMPLATE // e.g. "http://{country}.smartproxy.com:10000"

// Toggle verbose diagnostic logging (egress IP, response status/headers,
// screenshot-on-block) without permanently spamming production logs.
// Set DEBUG_SCRAPE_BROWSER=true when actively diagnosing a block.
const DEBUG_BROWSER = process.env.DEBUG_SCRAPE_BROWSER === 'true'

function applyCountryTemplate(template: string, country: string, username?: string): string {
  return template.replace('{country}', country).replace('{username}', username ?? '')
}

function getProxyConfig(): { server: string; username?: string; password?: string } | null {
  if (!PROXY_SERVER && !PROXY_SERVER_COUNTRY_TEMPLATE) return null

  // Country-specific server endpoint takes priority when configured —
  // e.g. "http://{country}.smartproxy.com:10000" -> "http://in.smartproxy.com:10000".
  const server =
    PROXY_COUNTRY && PROXY_SERVER_COUNTRY_TEMPLATE
      ? applyCountryTemplate(PROXY_SERVER_COUNTRY_TEMPLATE, PROXY_COUNTRY)
      : PROXY_SERVER

  if (!server) return null

  // Username-suffix targeting — only applied when PROXY_COUNTRY is set
  // AND we're not already using a country-specific server endpoint
  // (avoid double-targeting via both mechanisms at once, which some
  // providers reject as a malformed username).
  const username =
    PROXY_COUNTRY && PROXY_USERNAME && !PROXY_SERVER_COUNTRY_TEMPLATE
      ? applyCountryTemplate(PROXY_USERNAME_COUNTRY_TEMPLATE, PROXY_COUNTRY, PROXY_USERNAME)
      : PROXY_USERNAME

  return {
    server,
    ...(username ? { username } : {}),
    ...(PROXY_PASSWORD ? { password: PROXY_PASSWORD } : {}),
  }
}

async function connectToBrowserless(): Promise<Browser> {
  const { chromium } = await import('playwright-core')
  const separator = BROWSERLESS_WS_ENDPOINT.includes('?') ? '&' : '?'
  const wsEndpoint = `${BROWSERLESS_WS_ENDPOINT}${separator}token=${BROWSERLESS_API_KEY}`

  let lastErr: unknown
  for (let attempt = 0; attempt < BROWSERLESS_CONNECT_MAX_ATTEMPTS; attempt++) {
    try {
      return await chromium.connect(wsEndpoint, { timeout: BROWSERLESS_CONNECT_TIMEOUT_MS })
    } catch (e) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      if (/timeout/i.test(msg)) {
        console.warn(
          `[browser-fetch] Browserless connect attempt ${attempt + 1}/${BROWSERLESS_CONNECT_MAX_ATTEMPTS} timed out after ${BROWSERLESS_CONNECT_TIMEOUT_MS}ms. If Browserless's dashboard shows this request as received, this is very likely your account's concurrency limit — the request was queued, not lost. Check the request's status code in the dashboard (429 = over limit, 408 = Browserless's own queue timeout) rather than treating this as a network/config bug.`
        )
      }
      if (attempt < BROWSERLESS_CONNECT_MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 + attempt * 1500))
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

async function launchLocalBrowser(): Promise<Browser> {
  if (IS_SERVERLESS) {
    const { chromium: playwright } = await import('playwright-core')
    const chromium = (await import('@sparticuz/chromium')).default

    return (await playwright.launch({
      args: [...chromium.args, '--disable-blink-features=AutomationControlled'],
      executablePath: await chromium.executablePath(),
      headless: true,
    })) as unknown as Browser
  }

  const { chromium } = await import('playwright')

  const override = process.env.LOCAL_BROWSER_CHANNEL
  const isWindowsDev = process.platform === 'win32'

  let channel: 'chrome' | 'msedge' | undefined
  if (override === 'chrome' || override === 'msedge') {
    channel = override
  } else if (override !== 'none' && isWindowsDev) {
    channel = 'chrome'
  }

  try {
    return (await chromium.launch({
      ...(channel ? { channel } : {}),
      headless: true,
      args: [
        '--headless=new',
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-component-extensions-with-background-pages',
      ],
    })) as unknown as Browser
  } catch (e) {
    if (channel) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(
        `[browser-fetch] Launch via channel "${channel}" failed (${msg}). Falling back to Playwright's bundled Chromium — if that also fails, run \`pnpm exec playwright install chromium\`.`
      )
      return chromium.launch({
        headless: true,
        args: [
          '--headless=new',
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-component-extensions-with-background-pages',
        ],
      }) as unknown as Promise<Browser>
    }
    throw e
  }
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existingBrowser = await browserPromise.catch(() => null)
    if (existingBrowser && existingBrowser.isConnected()) {
      return existingBrowser
    }
    browserPromise = null
  }

  browserPromise = (async () => {
    if (BROWSERLESS_API_KEY) {
      try {
        return await connectToBrowserless()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(
          `[browser-fetch] Browserless connect failed after ${BROWSERLESS_CONNECT_MAX_ATTEMPTS} attempt(s) via ${BROWSERLESS_WS_ENDPOINT} (${msg}). Falling back to a locally launched browser. ` +
            `Check: (1) BROWSERLESS_API_KEY is valid and unexpired, (2) BROWSERLESS_WS_ENDPOINT matches your account's actual region/fleet — 'chrome.browserless.io' is the dedicated-fleet host and will hang, not error, if your account isn't on a dedicated fleet, (3) you haven't hit your plan's concurrency limit.`
        )
        return await launchLocalBrowser()
      }
    }
    return launchLocalBrowser()
  })()

  return browserPromise
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null)
    if (b && b.isConnected()) {
      await b.close()
    }
    browserPromise = null
  }
}

const DESKTOP_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function installStealthPatches() {
  try {
    delete (navigator as any).webdriver
  } catch {}
  Object.defineProperty(Navigator.prototype, 'webdriver', {
    get: () => undefined,
    configurable: true,
  })

  const fakePluginData = [
    { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
  ]
  const makePlugin = (data: (typeof fakePluginData)[number]) => ({
    name: data.name,
    filename: data.filename,
    description: data.description,
    length: 1,
    item: () => null,
    namedItem: () => null,
  })
  const fakePlugins = fakePluginData.map(makePlugin)
  const pluginArray: any = fakePlugins.slice()
  pluginArray.item = (i: number) => fakePlugins[i] ?? null
  pluginArray.namedItem = (name: string) => fakePlugins.find((p) => p.name === name) ?? null
  pluginArray.refresh = () => {}
  Object.defineProperty(navigator, 'plugins', { get: () => pluginArray, configurable: true })

  const mimeTypeArray: any = []
  mimeTypeArray.item = () => null
  mimeTypeArray.namedItem = () => null
  Object.defineProperty(navigator, 'mimeTypes', { get: () => mimeTypeArray, configurable: true })

  Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en-US', 'en'], configurable: true })

  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true })
  try {
    Object.defineProperty(navigator as any, 'deviceMemory', { get: () => 8, configurable: true })
  } catch {}

  ;(window as any).chrome = {
    runtime: {
      connect: () => ({ postMessage: () => {}, onMessage: { addListener: () => {} }, disconnect: () => {} }),
      sendMessage: () => {},
      onMessage: { addListener: () => {} },
      id: undefined,
    },
    loadTimes: () => ({}),
    csi: () => ({}),
    app: { isInstalled: false },
  }

  const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions)
  // @ts-ignore
  window.navigator.permissions.query = (parameters: any) =>
    parameters?.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission, name: 'notifications' } as PermissionStatus)
      : originalQuery(parameters)

  const spoofGetParameter = (proto: any) => {
    if (!proto || !proto.getParameter) return
    const original = proto.getParameter
    proto.getParameter = function (parameter: number) {
      if (parameter === 37445) return 'Google Inc. (NVIDIA)'
      if (parameter === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)'
      return original.call(this, parameter)
    }
  }
  try {
    // @ts-ignore
    spoofGetParameter(WebGLRenderingContext.prototype)
    // @ts-ignore
    if (typeof WebGL2RenderingContext !== 'undefined') spoofGetParameter(WebGL2RenderingContext.prototype)
  } catch {}
}

async function newStealthContext(browser: Browser): Promise<BrowserContext> {
  const viewport = DESKTOP_VIEWPORTS[Math.floor(Math.random() * DESKTOP_VIEWPORTS.length)]
  const proxy = getProxyConfig()

  if (DEBUG_BROWSER) {
    if (proxy) {
      console.log('[browser-fetch][diag] proxy configured:', proxy.server)
      console.log(
        '[browser-fetch][diag] proxy username:',
        proxy.username ? proxy.username.replace(/./g, '*').slice(0, 20) + ' (masked)' : '(none)'
      )
      console.log('[browser-fetch][diag] country targeting:', PROXY_COUNTRY || '(none set — exit node country is whatever the proxy pool assigns, which may not match the target site)')
    } else {
      console.log('[browser-fetch][diag] proxy configured: (none — using direct egress)')
    }
  }

  const context = await browser.newContext({
    userAgent: UA,
    viewport,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
    },
    // NEW: per-context proxy. Undefined (omitted) when PROXY_SERVER isn't
    // set, so behavior is byte-identical to before when you don't opt in.
    ...(proxy ? { proxy } : {}),
  })

  await context.addInitScript(installStealthPatches)
  return context
}

async function simulateHumanInteraction(page: Page): Promise<void> {
  try {
    const steps = 3 + Math.floor(Math.random() * 3)
    let x = 100 + Math.random() * 200
    let y = 100 + Math.random() * 200
    for (let i = 0; i < steps; i++) {
      x += (Math.random() - 0.5) * 300
      y += (Math.random() - 0.5) * 200
      await page.mouse.move(Math.max(0, x), Math.max(0, y), { steps: 5 + Math.floor(Math.random() * 5) })
      await page.waitForTimeout(60 + Math.random() * 120)
    }
    await page.mouse.wheel(0, 300 + Math.random() * 400)
    await page.waitForTimeout(150 + Math.random() * 200)
  } catch {
    // Non-fatal — proceed to content extraction regardless.
  }
}

// ---------------------------------------------------------------------
// NEW: Diagnostic helper — reports the egress IP/ASN this browser
// CONTEXT is actually using, via a real page navigation to ipinfo.io.
// Only called when DEBUG_BROWSER is on, since it costs an extra
// navigation per call. Wrapped in try/catch so a diagnostic failure
// (ipinfo down, blocked, whatever) never breaks the real scrape.
// ---------------------------------------------------------------------
async function logEgressIp(context: BrowserContext, label: string): Promise<void> {
  if (!DEBUG_BROWSER) return
  let diagPage: Page | null = null
  try {
    diagPage = await context.newPage()
    await diagPage.goto('https://ipinfo.io/json', { timeout: 10000 })
    const body = await diagPage.textContent('body')
    console.log(`[browser-fetch][diag] (${label}) egress IP info:`, body?.trim())
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[browser-fetch][diag] (${label}) egress IP lookup failed (non-fatal): ${msg}`)
  } finally {
    if (diagPage) await diagPage.close().catch(() => {})
  }
}

export type BrowserFetchResult = {
  html: string | null
  error: string | null
}

export async function fetchRendered(
  url: string,
  {
    timeoutMs = 25000,
    waitForSelector,
    settleMs = 800,
    postNavigate,
    onRequest,
  }: {
    timeoutMs?: number
    waitForSelector?: string
    settleMs?: number
    postNavigate?: (page: Page) => Promise<void>
    onRequest?: (request: Request) => void
  } = {}
): Promise<BrowserFetchResult> {
  let context: BrowserContext | null = null
  try {
    const browser = await getBrowser()
    context = await newStealthContext(browser)

    // NEW: diagnostic egress-IP check, gated behind DEBUG_SCRAPE_BROWSER.
    await logEgressIp(context, url)

    const page = await context.newPage()

    if (onRequest) page.on('request', onRequest)

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })

    // NEW: log the actual navigation response status/headers. A hard
    // 403 returned immediately (before JS/hydration) points toward an
    // edge/IP-level block; a 200 that later renders an "Access Denied"
    // body points toward a client-side/behavioral check instead.
    if (DEBUG_BROWSER && response) {
      console.log(`[browser-fetch][diag] navigation status for ${url}:`, response.status())
      console.log('[browser-fetch][diag] navigation headers:', response.headers())
    }

    await simulateHumanInteraction(page)

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 6000 }).catch(() => {})
    } else {
      await page.waitForTimeout(settleMs)
    }

    if (postNavigate) {
      try {
        await postNavigate(page)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[browser-fetch] postNavigate hook failed for ${url}: ${msg}. Continuing with page as-is.`)
      }
    }

    const html = await page.content()

    // NEW: screenshot-on-block, gated behind DEBUG_SCRAPE_BROWSER. Uses
    // the same looksBlocked-style heuristic inline (checking for common
    // block-page phrasing) rather than importing from shared.ts, to keep
    // this module's diagnostic path self-contained. If you want it to
    // use the exact same looksBlocked() parsers.ts uses, import it
    // instead of this inline check.
    if (DEBUG_BROWSER && /access denied|captcha|are you a robot|blocked/i.test(html.slice(0, 5000))) {
      try {
        const shotPath = `/tmp/browser-fetch-block-${Date.now()}.png`
        await page.screenshot({ path: shotPath, fullPage: true })
        console.log(`[browser-fetch][diag] possible block page detected — screenshot saved to ${shotPath}`)
      } catch (e) {
        console.warn('[browser-fetch][diag] screenshot capture failed (non-fatal):', e)
      }
    }

    return { html, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { html: null, error: `Browser fetch failed: ${msg}` }
  } finally {
    if (context) await context.close().catch(() => {})
  }
}