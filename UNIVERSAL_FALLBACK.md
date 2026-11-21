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
| UNIVERSAL_SCRAPER_TRUST_PRICE | no | `1` = show as a full priced listing; default shows a preview and confirms price in chat |
| UNIVERSAL_SCRAPER_DEBUG | no | `1` logs response key names to tune the mapper |
| PRODUCT_LOOKUP_DEADLINE_MS | no | our scraper's budget, default 60000 |

Backup results are never stored as price observations, never used by checkout pricing, and never counted as a scrape-health success.
