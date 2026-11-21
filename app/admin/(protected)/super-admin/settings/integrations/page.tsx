// app/admin/(protected)/super-admin/settings/integrations/page.tsx
//
// Super Admin only (middleware.ts gates /admin/super-admin/**, and every call
// below is re-checked on the server). The backup ("universal") scraper's
// connection: base URL, app ID, bearer token, origin, time limit, price trust.
//
// Saved in Redis (lib/scrape/universal-settings.ts), so a change applies to
// new lookups within ~15 seconds without a redeploy. The token is encrypted
// there and never sent back to this page — only "saved, ends …1234".
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plug, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import {
  btnPrimary,
  btnSecondary,
  card,
  FieldLabel,
  FullPageLoading,
  IconTile,
  input,
  Notice,
  PageHeader,
  PageShell,
  Section,
  StatusPill,
} from '@/components/admin/catalogue/ui'

type View = {
  enabled: boolean
  baseUrl: string
  appId: string
  origin: string
  timeoutMs: number
  trustPrice: boolean
  tokenSet: boolean
  tokenPreview: string | null
  source: 'redis' | 'env' | 'none'
  ready: boolean
  updatedAt: string | null
  updatedBy: string | null
  redisAvailable: boolean
  timeoutLimits: { min: number; max: number }
  sampleUrl: string
}

type TestResult =
  | { ok: true; ms: number; title: string | null; brand: string | null; price: string | null; mrp: string | null; currency: string | null; image: string | null; sizes: string[]; colors: string[] }
  | { ok: false; error: string; ms?: number }

function when(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function IntegrationsPage() {
  const [view, setView] = useState<View | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [enabled, setEnabled] = useState(true)
  const [baseUrl, setBaseUrl] = useState('')
  const [appId, setAppId] = useState('')
  const [token, setToken] = useState('')
  const [origin, setOrigin] = useState('')
  const [timeoutSec, setTimeoutSec] = useState(60)
  const [trustPrice, setTrustPrice] = useState(true)
  const [testUrl, setTestUrl] = useState('')

  const [busy, setBusy] = useState<'save' | 'test' | 'clear' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [test, setTest] = useState<TestResult | null>(null)

  const apply = useCallback((v: View) => {
    setView(v)
    setEnabled(v.enabled)
    setBaseUrl(v.baseUrl)
    setAppId(v.appId)
    setOrigin(v.origin)
    setTimeoutSec(Math.round(v.timeoutMs / 1000))
    setTrustPrice(v.trustPrice)
    setToken('')
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/admin/universal-scraper', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!alive) return
        if (!r.ok) setLoadError((j as { error?: string }).error ?? 'Could not load the settings.')
        else apply(j as View)
      })
      .catch(() => alive && setLoadError('Could not load the settings.'))
    return () => {
      alive = false
    }
  }, [apply])

  if (loadError) {
    return (
      <PageShell narrow>
        <Notice tone="red">{loadError}</Notice>
      </PageShell>
    )
  }
  if (!view) return <FullPageLoading label="Loading integrations…" />

  const form = () => ({
    enabled,
    baseUrl,
    appId,
    token,
    origin,
    timeoutMs: timeoutSec * 1000,
    trustPrice,
  })

  async function save() {
    setBusy('save')
    setError(null)
    setSaved(null)
    try {
      const res = await fetch('/api/admin/universal-scraper', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form()),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) return setError((j as { error?: string }).error ?? 'Could not save. Please try again.')
      apply(j as View)
      setSaved('Saved. New lookups use this within about 15 seconds.')
    } finally {
      setBusy(null)
    }
  }

  async function runTest() {
    setBusy('test')
    setError(null)
    setSaved(null)
    setTest(null)
    try {
      const res = await fetch('/api/admin/universal-scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', url: testUrl.trim() || undefined, ...form() }),
      })
      const j = (await res.json().catch(() => ({}))) as TestResult & { error?: string }
      if (!res.ok) return setError(j.error ?? 'The test could not run.')
      setTest(j)
    } finally {
      setBusy(null)
    }
  }

  async function clearSaved() {
    if (!window.confirm('Remove the saved settings from Redis? Environment variables (if any) will apply again.')) return
    setBusy('clear')
    setError(null)
    setSaved(null)
    try {
      const res = await fetch('/api/admin/universal-scraper', { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) return setError((j as { error?: string }).error ?? 'Could not clear.')
      apply(j as View)
      setSaved('Saved settings removed.')
    } finally {
      setBusy(null)
    }
  }

  const canSave = view.redisAvailable && !!baseUrl.trim() && !!appId.trim() && (view.tokenSet || !!token.trim() || view.source === 'env')
  const sourceLabel = view.source === 'redis' ? 'Saved in Redis' : view.source === 'env' ? 'From environment variables' : 'Not set up'

  return (
    <PageShell narrow>
      <PageHeader
        leading={
          <IconTile>
            <Plug size={22} strokeWidth={1.75} />
          </IconTile>
        }
        title="Integrations"
        meta="Backup scraper for links our own scraper can't read in time. Settings live in Redis, so a change applies without a redeploy."
        badges={
          view.ready ? <StatusPill tone="live">Active</StatusPill> : <StatusPill tone="hidden">{view.enabled ? 'Not set up' : 'Switched off'}</StatusPill>
        }
      />

      {!view.redisAvailable && (
        <div className="mt-6">
          <Notice tone="red">
            Redis isn&apos;t connected on this server (<code>WISH_DROP_REDIS_URL</code>), so settings can&apos;t be saved here. The environment variables are used instead.
          </Notice>
        </div>
      )}

      <Section
        title="Universal scraper"
        description={
          <>
            {sourceLabel}
            {view.updatedAt ? ` · last saved ${when(view.updatedAt)}${view.updatedBy ? ` by ${view.updatedBy}` : ''}` : ''}
          </>
        }
        className="mt-6"
      >
        <div className="space-y-5">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="mt-1 h-4 w-4 accent-teal-deep" />
            <span>
              <span className="block text-sm font-semibold text-ink">Use the backup scraper</span>
              <span className="block text-xs text-ink/50">When off, links our scraper can&apos;t read go straight to the photo-and-name fallback.</span>
            </span>
          </label>

          <FieldLabel label="Base URL" hint="The provider's address, https only.">
            <input className={input} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" autoComplete="off" spellCheck={false} />
          </FieldLabel>

          <FieldLabel label="App ID">
            <input className={input} value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="6a50f8a1…" autoComplete="off" spellCheck={false} />
          </FieldLabel>

          <FieldLabel
            label="Bearer token"
            hint={
              view.tokenSet
                ? `Saved (${view.tokenPreview}). Leave blank to keep it; type a new one to replace it. It is encrypted and never shown again.`
                : 'Paste the token only, without “Bearer”. It is encrypted when saved and never shown again.'
            }
          >
            <input
              className={input}
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={view.tokenSet ? '•••••••• (unchanged)' : 'Paste token'}
              autoComplete="new-password"
              spellCheck={false}
            />
          </FieldLabel>

          <div className="grid gap-5 sm:grid-cols-2">
            <FieldLabel label="Origin (optional)" hint="Sent as Origin / Referer. Leave empty to use the base URL.">
              <input className={input} value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="https://…" autoComplete="off" spellCheck={false} />
            </FieldLabel>
            <FieldLabel label="Time limit (seconds)" hint={`${view.timeoutLimits.min / 1000}–${view.timeoutLimits.max / 1000} s. The backup gets up to 1 minute; a whole lookup is capped at about 135 s.`}>
              <input
                className={input}
                type="number"
                min={view.timeoutLimits.min / 1000}
                max={view.timeoutLimits.max / 1000}
                value={timeoutSec}
                onChange={(e) => setTimeoutSec(Number(e.target.value))}
              />
            </FieldLabel>
          </div>

          <label className="flex items-start gap-3">
            <input type="checkbox" checked={trustPrice} onChange={(e) => setTrustPrice(e.target.checked)} className="mt-1 h-4 w-4 accent-teal-deep" />
            <span>
              <span className="block text-sm font-semibold text-ink">Show its price as a normal priced listing</span>
              <span className="block text-xs text-ink/50">
                Off: the shopper sees a preview and &quot;we&apos;ll confirm the price&quot;. Either way, checkout never prices from it.
              </span>
            </span>
          </label>

          {error && <Notice tone="red">{error}</Notice>}
          {saved && <Notice tone="teal">{saved}</Notice>}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={btnPrimary} onClick={save} disabled={!!busy || !canSave}>
              {busy === 'save' && <Loader2 size={15} className="animate-spin" />} Save
            </button>
            {view.source === 'redis' && (
              <button type="button" className={btnSecondary} onClick={clearSaved} disabled={!!busy}>
                Remove saved settings
              </button>
            )}
          </div>
        </div>
      </Section>

      <Section title="Test connection" description="One live call with the values above (even if not saved yet). Nothing is stored." className="mt-6">
        <FieldLabel label="Product link to try (optional)" hint="Empty uses a sample link.">
          <input className={input} value={testUrl} onChange={(e) => setTestUrl(e.target.value)} placeholder={view.sampleUrl} autoComplete="off" spellCheck={false} />
        </FieldLabel>
        <div className="mt-4">
          <button type="button" className={btnSecondary} onClick={runTest} disabled={!!busy || !baseUrl.trim() || !appId.trim()}>
            {busy === 'test' && <Loader2 size={15} className="animate-spin" />} Run test
          </button>
        </div>

        {test && (
          <div className={`${card} mt-4 p-4 text-sm`}>
            {test.ok ? (
              <div className="space-y-1.5">
                <p className="flex items-center gap-2 font-semibold text-teal-deep">
                  <CheckCircle2 size={16} /> Works — answered in {(test.ms / 1000).toFixed(1)} s
                </p>
                <p className="text-ink/80">{test.title ?? 'No title'}{test.brand ? ` · ${test.brand}` : ''}</p>
                <p className="text-ink/60">
                  {test.price ? `${test.currency ?? ''} ${test.price}` : 'No price'}
                  {test.mrp ? ` (was ${test.mrp})` : ''}
                </p>
                <p className="text-ink/60">
                  Sizes: {test.sizes.length ? test.sizes.join(', ') : 'none'} · Colours: {test.colors.length ? test.colors.join(', ') : 'none'}
                </p>
              </div>
            ) : (
              <p className="flex items-start gap-2 font-semibold text-red-700">
                <XCircle size={16} className="mt-0.5 flex-none" /> <span>{test.error}</span>
              </p>
            )}
          </div>
        )}
      </Section>
    </PageShell>
  )
}
