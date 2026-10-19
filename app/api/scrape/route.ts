import { NextRequest, NextResponse } from "next/server";
import { scrapeProduct } from "@/lib/scrape/parsers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { recordPriceObservation } from "@/lib/checkout/server";
import { isRateLimited } from "@/lib/rate-limit";
import { isPublicHttpUrl } from "@/lib/url-safety";

// Per IP, shared by GET and POST: lookups cost paid scraper credit.
const LOOKUP_LIMIT = 40;
const LOOKUP_WINDOW_SECONDS = 10 * 60;

function tooManyResponse() {
  return NextResponse.json(
    { error: "You’re looking up links very quickly. Please wait a few minutes and try again." },
    { status: 429, headers: { "Retry-After": String(LOOKUP_WINDOW_SECONDS) } }
  );
}

function blockedUrlResponse() {
  return NextResponse.json({ error: "That link can’t be looked up." }, { status: 400 });
}

// Remembers the price we just read so checkout can price this item on the
// server (lib/checkout/server.ts) instead of trusting the browser. Only a
// full read with a price AND a currency counts — same rule as the item
// modal's "trusted price". Never blocks or fails the response.
function rememberPrice(requestUrl: string, result: Awaited<ReturnType<typeof scrapeProduct>>) {
  const price = result.price != null ? Number(String(result.price).replace(/[^0-9.]/g, "")) : NaN;
  if (result.error || result.ogOnly || !result.currencyCode || !Number.isFinite(price) || price <= 0) return;
  try {
    const admin = createServiceRoleClient();
    const weightKg = (result as { weightKg?: number | null }).weightKg ?? null;
    const urls = new Set([requestUrl, result.url].filter((u): u is string => typeof u === "string" && !!u));
    for (const url of urls) {
      void recordPriceObservation(admin, { url, site: result.site, price, currency: result.currencyCode, weightKg });
    }
  } catch (err) {
    console.error("[scrape] could not record price", err);
  }
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Maps a ScrapeResult to an HTTP status.
 * - `site: null` -> the URL itself was unparseable -> 400
 * - `error` present -> something failed upstream (blocked, JS shell,
 *   fetch failure, bad handle, etc.) -> 502 (we successfully talked to
 *   our own server, the *upstream* site is the problem)
 * - otherwise -> 200, even if some fields are null and a `warning` is
 *   attached (e.g. title found but price missing) — partial data is
 *   still useful to the caller.
 */
function statusFor(result: Awaited<ReturnType<typeof scrapeProduct>>): number {
  if (result.site === null) return 400;
  if (result.error) return 502;
  return 200;
}

export async function POST(req: NextRequest) {
  let body: { url?: string; needVariants?: boolean };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const { url, needVariants } = body;

  if (!url || typeof url !== "string" || !isValidUrl(url)) {
    return NextResponse.json(
      { error: "Please provide a valid 'url' field (http/https)." },
      { status: 400 }
    );
  }

  if (await isRateLimited(req, "scrape", LOOKUP_LIMIT, LOOKUP_WINDOW_SECONDS)) return tooManyResponse();
  if (!(await isPublicHttpUrl(url))) return blockedUrlResponse();

  try {
    const result = await scrapeProduct(url, {
      needVariants: !!needVariants,
      // Lets a client disconnect cancel in-flight upstream work —
      // including a billed ScraperAPI call — instead of letting it run
      // to completion with nobody left to receive the result.
      signal: req.signal,
    });

    rememberPrice(url, result);
    return NextResponse.json({ data: result }, { status: statusFor(result) });
  } catch (err: any) {
    // scrapeProduct is designed to return errors on the result object
    // rather than throw, so reaching here means something unexpected
    // (a bug, an uncaught extractor exception, etc.)
    return NextResponse.json(
      { error: err?.message || "Unexpected error while scraping the provided URL." },
      { status: 500 }
    );
  }
}

// GET support for quick testing: /api/scrape?url=...&needVariants=true
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const needVariants = req.nextUrl.searchParams.get("needVariants") === "true";

  if (!url || !isValidUrl(url)) {
    return NextResponse.json(
      { error: "Provide a 'url' query parameter, e.g. /api/scrape?url=..." },
      { status: 400 }
    );
  }

  if (await isRateLimited(req, "scrape", LOOKUP_LIMIT, LOOKUP_WINDOW_SECONDS)) return tooManyResponse();
  if (!(await isPublicHttpUrl(url))) return blockedUrlResponse();

  try {
    const result = await scrapeProduct(url, { needVariants, signal: req.signal });
    rememberPrice(url, result);
    return NextResponse.json({ data: result }, { status: statusFor(result) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unexpected error while scraping the provided URL." },
      { status: 500 }
    );
  }
}