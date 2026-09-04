import { NextRequest, NextResponse } from "next/server";
import { scrapeProduct } from "@/lib/scrape/parsers";

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

  try {
    const result = await scrapeProduct(url, {
      needVariants: !!needVariants,
      // Lets a client disconnect cancel in-flight upstream work —
      // including a billed ScraperAPI call — instead of letting it run
      // to completion with nobody left to receive the result.
      signal: req.signal,
    });

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

  try {
    const result = await scrapeProduct(url, { needVariants, signal: req.signal });
    return NextResponse.json({ data: result }, { status: statusFor(result) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unexpected error while scraping the provided URL." },
      { status: 500 }
    );
  }
}