// lib/scrape/fetchRendered.ts
//
// JS-rendering fetch tier using Playwright. This is the fallback used when
// a plain fetch() comes back without variant data (color/size pickers) on
// sites known/suspected to serve a reduced page to non-browser clients —
// see VARIANT_REQUIRES_RENDER in parsers.ts.
//
// Kept as its own module (rather than inlined in parsers.ts) so the browser
// process lifecycle (launch/reuse/close) is centralized in one place.

import { chromium, type Browser } from 'playwright'

let browserPromise: Promise<Browser> | null = null

// Reuse one browser instance across requests instead of launching per-call —
// launching Chromium is the expensive part (~1-2s), reusing the process
// brings a render call down to roughly just navigation + wait time.
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    })
  }
  return browserPromise
}

export type RenderResult = { html: string | null; error: string | null }

export async function fetchRendered(
  url: string,
  {
    timeoutMs = 25000,
    waitForSelector,
  }: { timeoutMs?: number; waitForSelector?: string } = {}
): Promise<RenderResult> {
  const browser = await getBrowser()
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale: 'en-IN',
    extraHTTPHeaders: { 'Accept-Language': 'en-IN,en;q=0.9' },
  })

  // Block heavy assets we don't need — images/fonts/media — so the render
  // is faster and cheaper. Keep CSS/JS since layout-dependent hydration
  // sometimes depends on stylesheet load completing.
  await context.route('**/*', (route) => {
    const type = route.request().resourceType()
    if (type === 'image' || type === 'font' || type === 'media') {
      return route.abort()
    }
    return route.continue()
  })

  const page = await context.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })

    if (waitForSelector) {
      // Don't hard-fail if the selector never shows — some listings
      // genuinely won't have it (e.g. sold out, no variants). Just proceed
      // and let the parser report what it actually found.
      await page.waitForSelector(waitForSelector, { timeout: 8000 }).catch(() => {})
    } else {
      // Generic settle time for hydration when we don't know what to wait for.
      await page.waitForTimeout(1500)
    }

    const html = await page.content()
    return { html, error: null }
  } catch (e) {
    return { html: null, error: `Render failed: ${e instanceof Error ? e.message : String(e)}` }
  } finally {
    await context.close()
  }
}

// Call this on process shutdown (or periodically) to avoid leaking a zombie
// Chromium process if the app is long-running.
export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise
    await b.close()
    browserPromise = null
  }
}