# Universal scraper fallback

When our own scraper times out (60 s) or fails in `/api/product-lookup`, the link is sent to an external
"kkEnrichQuote" API (lib/scrape/universal-fallback.ts). Not configured = feature is off.

Env (server only):

| Var | Required | Notes |
|---|---|---|
| UNIVERSAL_SCRAPER_BASE_URL | yes | e.g. https://goknock.lk |
| UNIVERSAL_SCRAPER_APP_ID | yes | path + `x-app-id` header |
| UNIVERSAL_SCRAPER_TOKEN | yes | bearer token; expires -> 401/403 shows in logs |
| UNIVERSAL_SCRAPER_ORIGIN | no | Origin/Referer sent; defaults to BASE_URL |
| UNIVERSAL_SCRAPER_TIMEOUT_MS | no | default 15000 |
| UNIVERSAL_SCRAPER_TRUST_PRICE | no | default on: a backup result with a price shows as a normal priced listing. `0` = preview only ("we will confirm the price") |
| UNIVERSAL_SCRAPER_DEBUG | no | `1` logs response key names to tune the mapper |
| PRODUCT_LOOKUP_DEADLINE_MS | no | our scraper's budget, default 60000 |

Backup results are never stored as price observations, never used by checkout pricing, and never counted as a scrape-health success.

## When it runs (order)
1. Our scraper (60 s budget) in `/api/product-lookup`.
2. Universal scraper, if ours timed out / failed, **or** ours only produced a generic Open-Graph read (unrecognised store, no variants) — then its price + sizes/colours upgrade the result. Skipped on the client's silent retry (`retry=1`) and for staff QA traffic.
3. `og-lookup` (title + photo only) — only from the browser, after 1 and 2 both failed. It no longer runs in parallel at paste time.

Backup results render in the generic store layout (WooCommerceProductView) with the store's own name + favicon.
