import type { Browser, BrowserContext, Page, Request } from 'playwright-core'

let browserPromise: Promise<Browser> | null = null

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_EXECUTION_ENV)

// When set, ALL environments (serverless and local/Docker alike) connect
// to this remote CDP endpoint instead of launching/bundling a local
// Chromium binary at all. This is what actually fixes "Playwright browser
// executable not found" in production — no local binary is ever touched.
// Takes priority over IS_SERVERLESS below.
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY

// IMPORTANT: `chrome.browserless.io` (the old default here) is Browserless's
// DEDICATED/ENTERPRISE fleet host as of their current docs — connecting to
// it on a normal Cloud-Unit account doesn't error, it just hangs until the
// connect timeout fires, which looks identical to a network problem. Normal
// accounts need a *regional shared-fleet* host (e.g. production-sfo) and an
// explicit CDP path. Override via BROWSERLESS_WS_ENDPOINT if your account is
// on a different region or is a genuine dedicated fleet.
// See: https://docs.browserless.io/overview/connection-urls
const BROWSERLESS_WS_ENDPOINT =
  process.env.BROWSERLESS_WS_ENDPOINT || 'wss://production-sfo.browserless.io/chromium'

// How long to wait for a single connect attempt, and how many attempts to
// make before giving up on Browserless entirely for this call.
//
// NOTE: a "timeout" here is NOT necessarily a network/config problem — if
// your account is at its concurrency limit, Browserless queues the
// connection server-side ("queues up to twice your concurrency limit")
// rather than rejecting it outright, and it may sit queued for a while
// before a session frees up. A short timeout makes a queued-but-otherwise-
// fine request look identical to a genuinely broken endpoint.
//
// FIX (was 45000ms x 2 attempts = ~91s worst case before even starting the
// local-browser fallback below): that default actively worked against the
// retry's own purpose — on a platform with a function max-duration shorter
// than ~91s + fallback time (Vercel included), the request died before the
// fallback got a chance to run at all. 8000ms keeps the one retry this
// still defaults to (a genuinely queued connection usually clears in low
// single-digit seconds, not 45), while capping the worst case around 17s.
// Override via env vars if your account's real queueing behavior needs
// more headroom — this is a safer default, not a claim that 8s is always
// enough for every account/plan.
const BROWSERLESS_CONNECT_TIMEOUT_MS = Number(process.env.BROWSERLESS_CONNECT_TIMEOUT_MS) || 8000
const BROWSERLESS_CONNECT_MAX_ATTEMPTS = Number(process.env.BROWSERLESS_CONNECT_MAX_ATTEMPTS) || 2

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
      // A timeout at this stage is consistent with being queued behind
      // your plan's concurrency limit rather than a broken connection —
      // said explicitly here so it doesn't get misread as a dead endpoint
      // when it's actually a "buy more concurrency, or send fewer
      // simultaneous scrapes" problem.
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

// Local/non-serverless launch. Two sub-cases:
//
//   - Windows dev machine: default to `channel: 'chrome'` (or `msedge` if
//     you set LOCAL_BROWSER_CHANNEL=msedge) so Playwright drives your
//     already-installed system browser instead of needing its own
//     ~300MB Chromium download via `playwright install`. Zero-download,
//     but only safe because a Windows dev box almost always has Chrome
//     or Edge already installed.
//   - Any other non-serverless environment (Docker/Linux container, a
//     plain Linux VM, CI): do NOT default to a system channel — a bare
//     Linux image essentially never has Chrome/Edge preinstalled, so
//     `channel: 'chrome'` there fails with "unable to find browser
//     executable" instead of the download-missing error it's meant to
//     avoid. These environments still need Playwright's own bundled
//     binary, i.e. `playwright install --with-deps chromium` (or the
//     other browsers you use) baked into the image/build step.
//
// Override in either direction with LOCAL_BROWSER_CHANNEL:
//   - set to 'chrome' or 'msedge' to force a system-channel launch
//     anywhere (including Linux, if you know the browser is present)
//   - set to 'none' to force Playwright's own bundled binary even on
//     Windows (e.g. if you deliberately want a pinned Chromium version
//     rather than whatever Chrome build happens to be installed)
async function launchLocalBrowser(): Promise<Browser> {
  if (IS_SERVERLESS) {
    // Serverless environment: use sparticuz + playwright-core
    const { chromium: playwright } = await import('playwright-core')
    const chromium = (await import('@sparticuz/chromium')).default

    return playwright.launch({
      args: [...chromium.args, '--disable-blink-features=AutomationControlled'],
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }

  const { chromium } = await import('playwright')

  const override = process.env.LOCAL_BROWSER_CHANNEL // 'chrome' | 'msedge' | 'none' | undefined
  const isWindowsDev = process.platform === 'win32'

  let channel: 'chrome' | 'msedge' | undefined
  if (override === 'chrome' || override === 'msedge') {
    channel = override
  } else if (override !== 'none' && isWindowsDev) {
    channel = 'chrome'
  }

  try {
    return await chromium.launch({
      ...(channel ? { channel } : {}),
      headless: true,
      args: [
        '--headless=new',
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-component-extensions-with-background-pages',
      ],
    })
  } catch (e) {
    // If a system-channel launch fails (e.g. Chrome genuinely isn't
    // installed despite being on Windows), fall back to Playwright's own
    // bundled binary rather than failing outright — this only helps if
    // `playwright install` has actually been run at some point; if not,
    // the resulting error is the same "executable doesn't exist" message
    // as before, which is the correct signal to run that command.
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
      })
    }
    throw e
  }
}

async function getBrowser(): Promise<Browser> {
  // Reuse existing browser if active and connected
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
        // Don't let a bad token, wrong region, or Browserless outage take
        // down every render-tier scrape — fall back to a locally launched
        // browser (same path used when BROWSERLESS_API_KEY isn't set at
        // all) so the request can still succeed. This is a real, loggable
        // problem worth fixing (it means the "no local binary ever
        // touched" guarantee isn't holding), so it's surfaced loudly here
        // rather than silently swallowed.
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
      // A browser we're discarding specifically BECAUSE it looks
      // unhealthy (see BROWSER_UNHEALTHY_RE below) may not close
      // cleanly either — swallow that failure too, same as
      // context.close() already does in fetchRendered's own finally.
      // The goal here is just to null out browserPromise so the next
      // getBrowser() call starts fresh; a close() that hangs or throws
      // shouldn't block that.
      await b.close().catch(() => {})
    }
    browserPromise = null
  }
}

// Matches error text from a browser process that's still technically
// "connected" (isConnected() stays true) but internally unhealthy —
// getBrowser()'s own reuse check only ever discards a browser once the
// connection itself drops, so a degraded-but-connected browser (out of
// memory, too many zombie renderer processes, ...) was never being
// recycled at all. On a warm serverless instance, every subsequent
// request kept reusing the SAME poisoned browser for the rest of that
// instance's lifetime — one bad request effectively broke every render-
// tier scrape after it, until a cold start happened to reset module
// state. Confirmed against real production logs: one domain showing "1
// succeeded, 17 failed", all 17 failures reading
// "page.goto: net::ERR_INSUFFICIENT_RESOURCES" — a resource-exhaustion
// signature, not a per-site block. Not an exhaustive list — extend if a
// different degraded-but-connected failure mode turns up.
const BROWSER_UNHEALTHY_RE = /ERR_INSUFFICIENT_RESOURCES|Target closed|Target page, context or browser has been closed|ERR_CONNECTION_(CLOSED|RESET|ABORTED)|Session closed/i

const DESKTOP_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function installStealthPatches() {
  // ---- navigator.webdriver ----
  try {
    delete (navigator as any).webdriver
  } catch {}
  Object.defineProperty(Navigator.prototype, 'webdriver', {
    get: () => undefined,
    configurable: true,
  })

  // ---- navigator.plugins / mimeTypes ----
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

  // ---- navigator.languages ----
  Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en-US', 'en'], configurable: true })

  // ---- navigator.hardwareConcurrency / deviceMemory ----
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true })
  try {
    Object.defineProperty(navigator as any, 'deviceMemory', { get: () => 8, configurable: true })
  } catch {}

  // ---- window.chrome ----
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

  // ---- navigator.permissions.query (Notifications) ----
  const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions)
  // @ts-ignore
  window.navigator.permissions.query = (parameters: any) =>
    parameters?.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission, name: 'notifications' } as PermissionStatus)
      : originalQuery(parameters)

  // ---- WebGL vendor/renderer ----
  // Fixed: Matched Windows ANGLE renderer string to align with Windows NT UA
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
  const context = await browser.newContext({
    userAgent: UA,
    viewport,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
    },
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
    /**
     * Optional hook run AFTER the initial page-load wait
     * (waitForSelector or settleMs, whichever applied) and BEFORE
     * page.content() is captured. Intended for sites where some data
     * only appears after a genuine user interaction — e.g. clicking a
     * "view size chart" trigger that mounts a modal — rather than
     * merely waiting longer for something to hydrate on its own.
     *
     * Deliberately generic and site-agnostic: this file has no
     * knowledge of which sites need this or why. Callers (parsers.ts,
     * via a helper the relevant extractor module owns — see e.g.
     * extractors/hopscotch.ts's openHopscotchSizeChartModal) supply
     * the actual interaction. Any error thrown here is caught and
     * logged, not rethrown — a failed click shouldn't take down an
     * otherwise-successful render fetch; the caller's own DOM
     * extraction simply won't find what the click would have
     * revealed, which is a normal (if disappointing) partial-data
     * outcome elsewhere in this pipeline too.
     */
    postNavigate?: (page: Page) => Promise<void>
    /**
     * Optional hook fired for EVERY outgoing network request the page
     * makes, registered via page.on('request', ...) BEFORE navigation
     * starts, so nothing fired during initial load is missed. Intended
     * for callers that need to observe a request itself (URL, headers)
     * rather than the final rendered DOM — e.g. shopify-plus.ts's
     * discovery step, which needs to see the outgoing Storefront
     * GraphQL call and its access-token header, not anything visible in
     * page.content().
     *
     * Purely observational: this does NOT intercept/mutate/abort
     * requests (page.route would be needed for that) and does not
     * affect the normal html/waitForSelector/postNavigate flow below —
     * a caller only interested in request data can ignore the returned
     * html entirely. Sync callback (matches Playwright's Page 'request'
     * event); if a caller needs to do async work per-request, have it
     * push into a queue/promise it resolves itself rather than
     * returning a promise here, since 'request' listeners aren't
     * awaited by Playwright.
     */
    onRequest?: (request: Request) => void
  } = {}
): Promise<BrowserFetchResult> {
  let context: BrowserContext | null = null
  try {
    const browser = await getBrowser()
    context = await newStealthContext(browser)
    const page = await context.newPage()

    if (onRequest) page.on('request', onRequest)

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })

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
    return { html, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // If the underlying browser process itself looks unhealthy (not
    // just this one navigation), discard it now rather than leaving
    // getBrowser()'s reuse check to keep handing it out — see
    // BROWSER_UNHEALTHY_RE's own comment above for why isConnected()
    // alone doesn't catch this. Every request on this warm instance
    // AFTER this one gets a fresh browser instead of inheriting this
    // same degraded one. Best-effort: closeBrowser() itself never
    // throws into this catch (it swallows its own close() failure).
    if (BROWSER_UNHEALTHY_RE.test(msg)) {
      await closeBrowser()
    }
    return { html: null, error: `Browser fetch failed: ${msg}` }
  } finally {
    if (context) await context.close().catch(() => {})
  }
}