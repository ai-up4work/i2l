# Universal scraper fallback

When our own scraper times out (60 s) or fails in `/api/product-lookup`, the link is sent to an external
"kkEnrichQuote" API (lib/scrape/universal-fallback.ts). Not configured = feature is off.

## Settings (Super Admin -> Integrations)

`/admin/super-admin/settings/integrations` (Super Admin only). Saved in **Redis** (`WISH_DROP_REDIS_URL`) under
`wd:settings:universal-scraper`; a change applies to new lookups within ~15 s, no redeploy.

- Fields: on/off, base URL (https), app ID, bearer token, optional origin, time limit (3-60 s, default 60 = one minute; capped to what is left of the 135 s request budget), trust price.
- The token is encrypted (AES-256-GCM, key derived from `SUPABASE_SERVICE_ROLE_KEY`) before it goes into Redis and is never sent to the browser (the page only shows "ends ...1234"). If the service-role key is rotated, the saved token reads as "not set" - just enter it again.
- "Test connection" makes one live call with the form's values, nothing stored.
- Saves and clears are written to the audit log (never the token).
- Env fallback (used only when nothing is saved in Redis): `UNIVERSAL_SCRAPER_BASE_URL`, `_APP_ID`, `_TOKEN`, `_ORIGIN`, `_TIMEOUT_MS`, `_TRUST_PRICE=0`. `UNIVERSAL_SCRAPER_DEBUG=1` logs response key names.

Backup results are never stored as price observations, never used by checkout pricing, and never counted as a scrape-health success.

## When it runs (order)
1. Our scraper (60 s budget) in `/api/product-lookup`.
2. Universal scraper, if ours timed out / failed, **or** ours only produced a generic Open-Graph read (unrecognised store, no variants) — then its price + sizes/colours upgrade the result. Skipped on the client's silent retry (`retry=1`) and for staff QA traffic.
3. `og-lookup` (title + photo only) — only from the browser, after 1 and 2 both failed. It no longer runs in parallel at paste time.

Backup results render in the generic store layout (WooCommerceProductView) with the store's own name + favicon.
