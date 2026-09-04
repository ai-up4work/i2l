import type { Browser, BrowserContext, Page } from 'playwright-core'

let browserPromise: Promise<Browser> | null = null

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_EXECUTION_ENV)

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
    if (IS_SERVERLESS) {
      // Serverless environment: use sparticuz + playwright-core
      const { chromium: playwright } = await import('playwright-core')
      const chromium = (await import('@sparticuz/chromium')).default

      return playwright.launch({
        args: [...chromium.args, '--disable-blink-features=AutomationControlled'],
        executablePath: await chromium.executablePath(),
        headless: true,
      })
    } else {
      // Node.js server / Docker / Local dev environment
      const { chromium } = await import('playwright')
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
  }: { timeoutMs?: number; waitForSelector?: string; settleMs?: number } = {}
): Promise<BrowserFetchResult> {
  let context: BrowserContext | null = null
  try {
    const browser = await getBrowser()
    context = await newStealthContext(browser)
    const page = await context.newPage()

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })

    await simulateHumanInteraction(page)

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 6000 }).catch(() => {})
    } else {
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