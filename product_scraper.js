/**
 * Single-product scraper for Myntra using got-scraping (Node's closest
 * equivalent to Python's curl_cffi: it spoofs TLS/HTTP2 fingerprints and
 * generates realistic browser headers to bypass basic bot detection)
 * + direct extraction of the embedded `window.__myx.pdpData` JSON object,
 * which contains the full structured product data server-side.
 *
 * NOTE: curl_cffi itself is a Python-only library (it binds to
 * curl-impersonate). There is no 1:1 Node port of it. `got-scraping`
 * (built by Apify) is the standard Node equivalent — it handles header
 * generation + HTTP/2 fingerprinting instead of TLS-level impersonation.
 * If you specifically need TLS/JA3-level impersonation in Node, you'd
 * need to shell out to the `curl-impersonate` binary instead (see the
 * commented alternative at the bottom of this file).
 *
 * Install:
 *     npm install got-scraping
 *
 * Usage:
 *     node product_scraper.js "https://www.myntra.com/.../buy"
 *     node product_scraper.js "https://www.myntra.com/.../buy" --dump-pdpdata
 */

const fs = require("fs");
const path = require("path");
const { gotScraping } = require("got-scraping");

async function fetchHtml(url) {
  const response = await gotScraping({
    url,
    responseType: "text",
    headerGeneratorOptions: {
      browsers: [{ name: "chrome", minVersion: 120 }],
      devices: ["desktop"],
      operatingSystems: ["windows"],
    },
    timeout: { request: 20000 },
  });

  console.log("Status code:", response.statusCode);

  fs.writeFileSync(path.join(process.cwd(), "debug_page.html"), response.body, "utf-8");

  return response.body;
}

function extractMyxState(html) {
  const match = html.match(/window\.__myx\s*=\s*(\{.*?\})\s*;?\s*<\/script>/s);
  if (!match) {
    throw new Error("Could not find window.__myx in page HTML.");
  }
  return JSON.parse(match[1]);
}

/**
 * Pulls out the commonly useful fields from pdpData. Myntra's pdpData
 * structure has been fairly consistent, but if any of these come back
 * null/undefined, run with --dump-pdpdata to see the full structure and
 * adjust the key paths below.
 */
function summarizePdpData(pdpData) {
  const summary = {};

  summary.brand =
    (pdpData.brand && typeof pdpData.brand === "object"
      ? pdpData.brand.name
      : pdpData.brand) ?? null;

  summary.product_name = pdpData.name ?? null;
  summary.myntra_id = pdpData.id ?? pdpData.styleId ?? null;

  const price = pdpData.price;
  if (price && typeof price === "object") {
    summary.mrp = price.mrp ?? null;
    summary.selling_price = price.discounted ?? price.selling ?? null;
    summary.discount_percent = price.discountPercent ?? price.discount ?? null;

    // Fallback: calculate discount if not directly provided
    if (!summary.discount_percent && summary.mrp && summary.selling_price) {
      const mrp = summary.mrp;
      const selling = summary.selling_price;
      if (mrp > 0) {
        summary.discount_percent = Math.round(((mrp - selling) / mrp) * 1000) / 10;
      }
    }
  }

  const ratings = pdpData.ratings;
  if (ratings && typeof ratings === "object") {
    summary.rating = ratings.averageRating ?? null;
    summary.rating_count = ratings.totalCount ?? null;
  }

  // Images
  const media = pdpData.media;
  if (media && typeof media === "object") {
    const albums = media.albums || [];
    if (albums.length) {
      const images = albums[0].images || [];
      summary.images = images
        .map((img) => img.src || img.secureUrl)
        .filter(Boolean)
        .slice(0, 5);
    }
  }

  summary.available_sizes = pdpData.sizes ?? pdpData.availableSizes ?? null;

  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log("Usage: node product_scraper.js <product_url> [--dump-pdpdata]");
    process.exit(1);
  }

  const productUrl = args[0];
  const dumpFull = args.includes("--dump-pdpdata");

  const html = await fetchHtml(productUrl);
  const myxState = extractMyxState(html);
  const pdpData = myxState.pdpData || {};

  // Always save the full pdpData to a file for reference/debugging
  fs.writeFileSync(
    path.join(process.cwd(), "pdpData_full.json"),
    JSON.stringify(pdpData, null, 2),
    "utf-8"
  );
  console.log("Full pdpData saved to pdpData_full.json");

  if (dumpFull) {
    console.log(JSON.stringify(pdpData, null, 2));
  } else {
    const summary = summarizePdpData(pdpData);
    console.log("\n--- Product Summary ---");
    console.log(JSON.stringify(summary, null, 2));
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

/* ------------------------------------------------------------------------
 * ALTERNATIVE: true TLS-level impersonation via the curl-impersonate binary
 * ------------------------------------------------------------------------
 * If got-scraping's header/HTTP2 spoofing isn't enough and you need actual
 * JA3/TLS fingerprint impersonation (what curl_cffi really does under the
 * hood), install the curl-impersonate binary (https://github.com/lwthiker/curl-impersonate)
 * and shell out to it from Node instead of using got-scraping:
 *
 *   const { execFile } = require("child_process");
 *   execFile(
 *     "curl_chrome124",           // installed curl-impersonate binary
 *     ["-s", productUrl],
 *     { maxBuffer: 1024 * 1024 * 20 },
 *     (err, stdout) => { ... }
 *   );
 *
 * This requires the curl-impersonate binaries to be installed on the host
 * system (they're not an npm package).
 * ------------------------------------------------------------------------ */