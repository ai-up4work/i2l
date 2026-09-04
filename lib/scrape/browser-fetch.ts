// lib/scrape/browser-fetch.ts
//
// Headless-browser fetch tier — replaces the Apify residential-proxy
// fallback. Used when a plain fetch() gets blocked/captcha'd, or when a
// site's variant picker only renders after client-side JS runs (Meesho,
// previously handled via REQUIRES_RENDER_FOR_VARIANTS warnings only).
//
// A real Chromium context with a believable UA/viewport/locale clears
// most basic bot-detection that a bare fetch() trips. IMPORTANT CAVEAT:
// this does NOT fix IP-reputation blocks — a sophisticated WAF (Akamai/
// PerimeterX/Imperva-class) can and often does block datacenter/cloud
// egress IP ranges wholesale regardless of what browser is behind them,
// headless or not, stealth-patched or not. This tier fixes "the page
// needs JS to render" problems; it does not reliably fix "this IP is
// blocked" problems. Block detection on whatever HTML comes back is the
// caller's job (see looksBlocked in parsers.ts) — this module doesn't
// try to distinguish IP-reputation blocks from fingerprint/behavioral
// blocks itself; see parsers.ts's BLOCKED message for how that's now
// phrased as an open question rather than an asserted cause.
//
// ---------------------------------------------------------------------
// STEALTH NOTES (read before touching newStealthContext/getBrowser)
// ---------------------------------------------------------------------
// A previous version of this file patched only navigator.webdriver,
// navigator.plugins (as five bare numbers — wrong shape, itself a tell),
// navigator.languages, and window.chrome (as an empty {runtime: {}} —
// also wrong shape). Those are the *first* things a fingerprinting
// script checks, but a script that checks navigator.plugins[0].name or
// chrome.runtime.connect and finds them missing/malformed learns "this
// is a shallow patch" just as fast as it would learn "this is
// unpatched" — a wrong-shaped spoof is not obviously better than no
// spoof. This version:
//   - Builds plugins/mimeTypes as realistic Plugin-shaped objects
//     (matching what real desktop Chrome reports for its built-in PDF
//     viewer), not bare numbers.
//   - Gives window.chrome.runtime real (no-op) method stubs instead of
//     an empty object.
//   - Patches WebGL vendor/renderer via getParameter — headless
//     Chromium's default software GPU backend reports as
//     "Google SwiftShader", which is one of the single most-checked
//     headless tells and was previously not addressed at all.
//   - Patches navigator.permissions.query for the Notifications
//     permission — real Chrome and headless Chrome diverge here by
//     default (a check popularized by puppeteer-extra-plugin-stealth).
//   - Does a small, randomized mouse-move + scroll after page load,
//     before reading content — a session with literally zero pointer
//     events between navigation and full-DOM-read is itself a
//     behavioral signal to interaction-scoring WAFs (PerimeterX/Akamai-
//     class), independent of any static fingerprint.
//
// None of this defeats a WAF that's decided to block on IP reputation
// alone (see the module-level caveat above), and none of it is a
// guarantee against a determined fingerprinting vendor that updates
// its checks — this narrows the gap, it doesn't close it.

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      // '--headless=new' asks Chromium for its newer headless
      // architecture (much closer to a real windowed browser — shares
      // more of the rendering/GPU/font stack) rather than falling back
      // to Playwright's separate "headless shell" binary, which has
      // known rendering differences fingerprinting scripts can key off
      // of. Playwright manages the underlying headless flag itself, but
      // explicitly requesting the new mode here still takes effect on
      // versions where it isn't already the default.
      args: [
        '--headless=new',
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        // Quiets a couple of other well-known automation-adjacent
        // signals: default-enabled features that differ between a
        // "real" Chrome profile and a fresh automated one.
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-component-extensions-with-background-pages',
      ],
    })
  }
  return browserPromise
}

// Closes the shared browser — call from a process 'exit'/'SIGTERM'
// handler if you want a clean shutdown; not required for correctness.
export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise
    await b.close()
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

// Runs inside the page, before any site script — must be a plain
// function (no closures over outer scope) since Playwright serializes
// it into the page context via addInitScript.
function installStealthPatches() {
  // ---- navigator.webdriver ----
  // Delete first, then redefine — some detection scripts walk the
  // prototype chain looking for an own-property override on the
  // instance and treat "own property exists, even if it reads
  // undefined" as itself suspicious (real Chrome's `webdriver` is a
  // prototype getter, not an own property). Deleting first avoids
  // leaving a stray own-property behind if this script re-runs.
  try {
    // @ts-ignore
    delete (navigator as any).webdriver
  } catch {}
  Object.defineProperty(Navigator.prototype, 'webdriver', {
    get: () => undefined,
    configurable: true,
  })

  // ---- navigator.plugins / mimeTypes ----
  // Real desktop Chrome reports a small, specific plugin list (Chrome's
  // built-in PDF viewer shows up twice under slightly different names,
  // plus the native client / NaCl entries on older versions). Shape
  // matters more than count here — a script checking `.name`,
  // `.filename`, or `.description` on the first entry should get real
  // strings back, not undefined.
  const fakePluginData = [
    { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
  ]
  const makePlugin = (data: (typeof fakePluginData)[number]) => {
    const plugin: any = {
      name: data.name,
      filename: data.filename,
      description: data.description,
      length: 1,
      item: () => null,
      namedItem: () => null,
    }
    return plugin
  }
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
  // Headless environments sometimes report unusually low or unusually
  // uniform values (e.g. exactly 2 or 4 every time) if run in a
  // constrained container — pin to common real-desktop values.
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true })
  // deviceMemory isn't on all navigator typings; guard with a cast.
  try {
    Object.defineProperty(navigator as any, 'deviceMemory', { get: () => 8, configurable: true })
  } catch {}

  // ---- window.chrome ----
  // Real Chrome's window.chrome.runtime has actual (mostly no-op
  // outside an extension context) methods — an empty object is an easy
  // tell. These stubs don't need to *work*, they just need to exist
  // with the right shape and not throw when referenced.
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
  // Headless Chrome and real Chrome diverge on the default Notification
  // permission state; a common check compares `Notification.permission`
  // against what `navigator.permissions.query({name:'notifications'})`
  // reports and flags a mismatch.
  const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions)
  // @ts-ignore
  window.navigator.permissions.query = (parameters: any) =>
    parameters?.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission, name: 'notifications' } as PermissionStatus)
      : originalQuery(parameters)

  // ---- WebGL vendor/renderer ----
  // Headless Chromium's default software rasterizer reports as "Google
  // SwiftShader" for both UNMASKED_VENDOR_WEBGL and
  // UNMASKED_RENDERER_WEBGL — one of the most-checked single headless
  // signals (a real desktop machine almost always has a hardware GPU
  // string here). Patch both WebGL1 and WebGL2 getParameter.
  const spoofGetParameter = (proto: any) => {
    if (!proto || !proto.getParameter) return
    const original = proto.getParameter
    proto.getParameter = function (parameter: number) {
      // 37445 = UNMASKED_VENDOR_WEBGL, 37446 = UNMASKED_RENDERER_WEBGL
      if (parameter === 37445) return 'Intel Inc.'
      if (parameter === 37446) return 'Intel Iris OpenGL Engine'
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

/** Small, randomized pointer movement + scroll — gives interaction-
 * scoring WAFs (PerimeterX/Akamai-class) something other than "zero
 * events between navigation and full-DOM-read" to look at. Best-effort:
 * swallow failures rather than let a flaky mouse move fail the whole
 * fetch. */
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
  }: { timeoutMs?: number; waitForSelector?: string; settleMs?: number } = {}
): Promise<BrowserFetchResult> {
  let context: BrowserContext | null = null
  try {
    const browser = await getBrowser()
    context = await newStealthContext(browser)
    const page = await context.newPage()

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })

    // Interact before reading content, not after — a bot-scoring script
    // that's already decided to serve a CAPTCHA by the time we look for
    // the selector won't be un-decided by mouse movement afterward. This
    // has to happen while the page still has a chance to observe it.
    await simulateHumanInteraction(page)

    if (waitForSelector) {
      // Best-effort — don't fail the whole fetch if a specific selector
      // (e.g. the size-chip row) never shows up; the caller still gets
      // whatever HTML did render, and parsers.ts's looksBlocked() will
      // catch it if that HTML turns out to be a block page rather than
      // the real product page.
      await page.waitForSelector(waitForSelector, { timeout: 6000 }).catch(() => {})
    } else {
      // Give client-side hydration a moment even with no selector to
      // wait for — same idea as the old jitterDelay, but for JS settle
      // time rather than anti-rate-limit pacing.
      await page.waitForTimeout(settleMs)
    }

    const html = await page.content()
    return { html, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { html: null, error: `Browser fetch failed: ${msg}` }
  } finally {
    if (context) await context.close().catch(() => {})
  }
}