// lib/scrape/fetchRendered.ts
//
// JS-rendering fetch tier using Playwright. This is the fallback used when
// a plain fetch() comes back without variant data (color/size pickers) on
// sites known/suspected to serve a reduced page to non-browser clients —
// see VARIANT_REQUIRES_RENDER in parsers.ts.
//
// Kept as its own module (rather than inlined in parsers.ts) so the browser
// process lifecycle (launch/reuse/close) is centralized in one place.
//
// FIX: this used to import chromium straight from the full `playwright`
// package unconditionally. That works locally because `playwright`'s own
// postinstall step downloads a real Chromium binary into a local cache
// directory outside node_modules — but that download never happens as
// part of a Vercel build, and the cache directory isn't part of the
// deployed function bundle either. The result was exactly the reported
// production error: "Cannot find module .../playwright-core/browsers.json"
// — real code, missing binary, working locally and failing identically
// every time on Vercel. @sparticuz/chromium was already a dependency in
// package.json, clearly intended for exactly this, just never actually
// wired up here. Now: local dev keeps using the full `playwright` package
// (already confirmed working there, no reason to change it), and anything
// that looks like a real deployment uses playwright-core + @sparticuz
// /chromium's serverless-safe prebuilt binary instead. Both are already
// auto-externalized by Next.js's own default serverExternalPackages list
// (confirmed — no next.config.mjs change needed for this).

import type { Browser } from 'playwright-core'

let browserPromise: Promise<Browser> | null = null

async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    const { chromium } = await import('playwright-core')
    const sparticuzChromium = (await import('@sparticuz/chromium')).default
    // UNVERIFIED against this exact @sparticuz/chromium version (149.x)
    // beyond what its own docs/examples show — if this specific call
    // shape has changed (executablePath() argument, args/headless
    // property names), this is the first place to check. The package
    // itself is the well-established, standard fix for this exact
    // Vercel + Playwright combination, so a remaining failure after this
    // change most likely means a small API-shape mismatch here, not
    // that the overall approach is wrong.
    return chromium.launch({
      args: sparticuzChromium.args,
      executablePath: await sparticuzChromium.executablePath(),
      headless: true,
    })
  }

  const { chromium } = await import('playwright')
  return chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  })
}

// Reuse one browser instance across requests instead of launching per-call —
// launching Chromium is the expensive part (~1-2s), reusing the process
// brings a render call down to roughly just navigation + wait time.
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser()
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