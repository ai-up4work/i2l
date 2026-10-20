// components/admin/seller/JsonApiSettings.tsx
//
// The "Method" settings for a jsonapi seller. Every option the adapter
// supports (lib/store-config.ts → JsonApiProviderConfig) is editable
// here, grouped into collapsible sections so a simple flat feed only
// needs the two open-by-default groups, while a partner feed with auth,
// pagination, nested fields and a categories endpoint can be configured
// fully without touching code.
//
// "Load sample record" fetches the first raw record through the exact
// same request path the adapter uses (auth, query params, listPath), then
// offers every field path in it as autocomplete on each mapping input.
'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Copy, Loader2, X } from 'lucide-react'

import { inputClass, monoInputClass, groupClass } from '@/components/admin/seller/shared'
import type { JsonFieldsState } from '@/components/admin/seller/shared'
import {
  cleanJsonApiFields,
  flattenFieldPaths,
  jsonApiMissingRequired,
} from '@/lib/jsonapi-config'
import type { JsonApiAuthConfig, JsonApiPaginationConfig } from '@/lib/store-config'

type Scope = 'product' | 'variant' | 'option' | 'response' | 'category' | 'none'

type FieldDef = {
  key: keyof JsonFieldsState
  label: string
  placeholder?: string
  hint?: string
  required?: boolean
  /** Which sample record's paths to suggest. */
  scope?: Scope
  kind?: 'path' | 'text' | 'select' | 'bool' | 'list'
  options?: [string, string][]
}

type SectionDef = {
  id: string
  title: string
  description: string
  defaultOpen?: boolean
  fields?: FieldDef[]
  custom?: 'auth' | 'request' | 'pagination' | 'raw'
}

const SECTIONS: SectionDef[] = [
  {
    id: 'endpoint',
    title: 'Endpoints & response',
    description: 'Where products come from, and where the product array sits in the response.',
    defaultOpen: true,
    fields: [
      { key: 'listEndpoint', label: 'List endpoint', placeholder: '/api/products', required: true, kind: 'text', hint: 'Path on the base URL, or a full https URL.' },
      { key: 'listPath', label: 'Products path in response', placeholder: 'products', scope: 'response', hint: 'Blank = bare array, or auto-detect products/items/data/results.' },
      { key: 'countEndpoint', label: 'Product count endpoint (optional)', placeholder: '/api/products/count', kind: 'text', hint: 'For the live product count. Blank = use the pagination total, else count everything.' },
      { key: 'countPath', label: 'Count path in response', placeholder: 'total', kind: 'text', hint: "Blank = 'total' or 'count'." },
      { key: 'detailEndpoint', label: 'Detail endpoint (optional)', placeholder: '/api/products/{id}', kind: 'text', hint: '{id} or {handle} is substituted. Blank = look up in the list.' },
      { key: 'detailPath', label: 'Product path in detail response', placeholder: 'product', kind: 'text' },
      { key: 'searchQueryParam', label: 'Search query param', placeholder: 'search', kind: 'text', hint: 'Server-side search on the list endpoint. Blank = search locally.' },
      { key: 'searchEndpoint', label: 'Separate search endpoint', placeholder: '/api/search?q={q}', kind: 'text' },
      { key: 'categoryQueryParam', label: 'Category query param', placeholder: 'category', kind: 'text', hint: 'Blank = filter by category locally.' },
      {
        key: 'categoryQueryValue',
        label: 'Category param sends',
        kind: 'select',
        options: [
          ['', 'Category name (default)'],
          ['id', 'Category id (from categories endpoint)'],
        ],
      },
    ],
  },
  {
    id: 'core',
    title: 'Core product fields',
    description: 'The minimum mapping every product needs.',
    defaultOpen: true,
    fields: [
      { key: 'idField', label: 'Id field', placeholder: 'id', required: true },
      { key: 'nameField', label: 'Name field', placeholder: 'name', required: true },
      { key: 'priceField', label: 'Price field', placeholder: 'price', required: true, hint: 'Fallbacks with |, e.g. sale_price|price' },
      { key: 'imageField', label: 'Image field', placeholder: 'image', required: true, hint: 'Or set Images (array) below instead.' },
      { key: 'handleField', label: 'Handle / slug field', placeholder: 'slug', hint: 'Blank = the id doubles as the handle.' },
      { key: 'descriptionField', label: 'Description field', placeholder: 'description' },
      { key: 'fullDescriptionField', label: 'Long description field', placeholder: 'body_html' },
    ],
  },
  {
    id: 'auth',
    title: 'Authentication',
    description: 'API key or token the feed requires.',
    custom: 'auth',
  },
  {
    id: 'request',
    title: 'Request headers & query params',
    description: 'Fixed values sent on every request.',
    custom: 'request',
  },
  {
    id: 'pagination',
    title: 'Pagination',
    description: 'For feeds that return the catalogue a page at a time.',
    custom: 'pagination',
  },
  {
    id: 'pricing',
    title: 'Pricing & currency',
    description: 'Sale prices, minor units and per-product currency.',
    fields: [
      {
        key: 'priceUnit',
        label: 'Price unit',
        kind: 'select',
        options: [
          ['', 'Major (1100 = 1,100.00)'],
          ['minor', 'Minor (110000 cents = 1,100.00)'],
        ],
      },
      { key: 'regularPriceField', label: 'Regular price field', placeholder: 'regular_price' },
      { key: 'salePriceField', label: 'Sale price field', placeholder: 'sale_price' },
      { key: 'compareAtPriceField', label: 'Compare-at ("was") price field', placeholder: 'compare_at_price' },
      { key: 'currencyField', label: 'Currency field', placeholder: 'currency', hint: 'Per product. Blank = the store currency above.' },
    ],
  },
  {
    id: 'media',
    title: 'Images & links',
    description: 'Galleries and the product page on the seller’s own site.',
    fields: [
      { key: 'imagesField', label: 'Images (array) field', placeholder: 'images', hint: 'Strings or objects with src/url. Wins over Image field.' },
      { key: 'urlField', label: 'Product URL field', placeholder: 'url', hint: 'Absolute or relative to the base URL.' },
      { key: 'productUrlPath', label: 'Product URL template', placeholder: '/products/{handle}', kind: 'text', hint: 'Used when there is no URL field. {handle} / {id}.' },
    ],
  },
  {
    id: 'stock',
    title: 'Stock',
    description: 'How availability is read.',
    fields: [
      { key: 'stockField', label: 'Stock field', placeholder: 'inStock' },
      {
        key: 'stockFieldType',
        label: 'Stock field is a…',
        kind: 'select',
        options: [
          ['', 'Boolean (default)'],
          ['quantity', 'Quantity (> 0 = in stock)'],
          ['status', 'Status text'],
        ],
      },
      { key: 'outOfStockValues', label: 'Out-of-stock values', placeholder: 'sold out, unavailable', kind: 'list', hint: 'Comma separated. Status text only.' },
      {
        key: 'defaultInStock',
        label: 'When stock is unknown',
        kind: 'bool',
        options: [
          ['', 'Treat as in stock (default)'],
          ['false', 'Treat as out of stock'],
        ],
      },
    ],
  },
  {
    id: 'variants',
    title: 'Options & variants',
    description: 'Sizes, colors, option axes and per-variant price, stock and image.',
    fields: [
      { key: 'sizesField', label: 'Sizes field', placeholder: 'sizes' },
      { key: 'colorField', label: 'Color field (single)', placeholder: 'color' },
      { key: 'colorsField', label: 'Colors field (array)', placeholder: 'colors' },
      { key: 'optionsField', label: 'Options field', placeholder: 'options', hint: '[{ name, values }] option axes.' },
      { key: 'variantsField', label: 'Variants field', placeholder: 'variants' },
      { key: 'variantIdField', label: 'Variant id', placeholder: 'id', scope: 'variant' },
      { key: 'variantTitleField', label: 'Variant title', placeholder: 'title', scope: 'variant', hint: 'Blank = joined option values.' },
      { key: 'variantOptionsField', label: 'Variant option values', placeholder: 'options', scope: 'variant' },
      { key: 'variantPriceField', label: 'Variant price', placeholder: 'price', scope: 'variant' },
      { key: 'variantCompareAtPriceField', label: 'Variant compare-at price', placeholder: 'compare_at_price', scope: 'variant' },
      { key: 'variantAvailableField', label: 'Variant stock / available', placeholder: 'inStock', scope: 'variant', hint: 'Boolean, quantity or status text.' },
      { key: 'variantImageField', label: 'Variant image', placeholder: 'image', scope: 'variant' },
    ],
  },
  {
    id: 'categories',
    title: 'Categories',
    description: 'Product category field, and an optional real categories endpoint.',
    fields: [
      { key: 'categoryField', label: 'Product category field', placeholder: 'category' },
      { key: 'productTypeField', label: 'Product type field', placeholder: 'type' },
      { key: 'categoriesEndpoint', label: 'Categories endpoint', placeholder: '/api/categories', kind: 'text', hint: 'Blank = derive categories from products.' },
      { key: 'categoriesPath', label: 'Categories path in response', placeholder: 'categories', kind: 'text' },
      { key: 'categoryNameField', label: 'Category name', placeholder: 'name', kind: 'text' },
      { key: 'categoryIdField', label: 'Category id', placeholder: 'id', kind: 'text' },
      { key: 'categoryCountField', label: 'Category product count', placeholder: 'productCount', kind: 'text' },
      { key: 'categoryImageField', label: 'Category image', placeholder: 'image', kind: 'text' },
    ],
  },
  {
    id: 'meta',
    title: 'Extra product details',
    description: 'SKU, brand, tags, ratings, weight and more.',
    fields: [
      { key: 'skuField', label: 'SKU field', placeholder: 'sku' },
      { key: 'vendorField', label: 'Brand / vendor field', placeholder: 'brand' },
      { key: 'tagsField', label: 'Tags field', placeholder: 'tags' },
      { key: 'featuredField', label: 'Featured flag field', placeholder: 'featured', hint: 'true adds a "Featured" tag.' },
      { key: 'conditionField', label: 'Condition field', placeholder: 'condition' },
      { key: 'genderField', label: 'Gender field', placeholder: 'gender', hint: 'Values men / women / unisex.' },
      { key: 'averageRatingField', label: 'Average rating field', placeholder: 'rating' },
      { key: 'reviewCountField', label: 'Review count field', placeholder: 'reviewCount' },
      { key: 'weightField', label: 'Weight field', placeholder: 'weight' },
      {
        key: 'weightUnit',
        label: 'Weight unit',
        kind: 'select',
        hint: 'Required with the weight field.',
        options: [
          ['', '— not set —'],
          ['kg', 'kg'],
          ['g', 'g'],
          ['lb', 'lb'],
          ['oz', 'oz'],
        ],
      },
    ],
  },
  {
    id: 'raw',
    title: 'Full config (JSON)',
    description: 'View, copy, or paste an entire mapping at once.',
    custom: 'raw',
  },
]

// ── Small building blocks ────────────────────────────────────────────────────

function Section({
  title,
  description,
  setCount,
  defaultOpen,
  children,
}: {
  title: string
  description: string
  setCount: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="rounded-lg border border-ink/10 bg-white/70">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <ChevronDown size={14} className={`flex-none text-ink/40 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-ink">{title}</span>
          {!open && <span className="block truncate text-[11px] text-ink/40">{description}</span>}
        </span>
        {setCount > 0 && (
          <span className="flex-none rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-semibold text-teal-deep">
            {setCount} set
          </span>
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-ink/10 px-3 pb-3 pt-3">
          <p className="text-[11px] leading-relaxed text-ink/45">{description}</p>
          {children}
        </div>
      )}
    </div>
  )
}

function Label({ text, required, hint, children }: { text: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-ink/50">
        {text}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[10.5px] leading-snug text-ink/35">{hint}</span>}
    </label>
  )
}

function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  addLabel,
}: {
  rows: [string, string][]
  onChange: (rows: [string, string][]) => void
  keyPlaceholder: string
  valuePlaceholder: string
  addLabel: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
          <input
            className={monoInputClass}
            value={k}
            placeholder={keyPlaceholder}
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))}
          />
          <input
            className={monoInputClass}
            value={v}
            placeholder={valuePlaceholder}
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))}
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            title="Remove"
            className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-ink/10 text-ink/40 hover:bg-red-600/5 hover:text-red-600"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, ['', '']])}
        className="self-start text-xs font-semibold text-teal-deep hover:underline"
      >
        + {addLabel}
      </button>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

type SampleState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; first: Record<string, unknown> | null; count: number; topLevelKeys: string[] }

export function JsonApiSettings({
  value,
  onChange,
  baseUrl,
  currency,
  isNew,
}: {
  value: JsonFieldsState
  onChange: (next: JsonFieldsState) => void
  baseUrl: string
  currency: string
  isNew: boolean
}) {
  const set = <K extends keyof JsonFieldsState>(key: K, v: JsonFieldsState[K]) => onChange({ ...value, [key]: v })

  // Local row state for key/value editors so half-typed rows (empty key) survive re-renders.
  const [headerRows, setHeaderRows] = useState<[string, string][]>(() => Object.entries(value.headers ?? {}))
  const [queryRows, setQueryRows] = useState<[string, string][]>(() => Object.entries(value.queryParams ?? {}))
  const commitRows = (key: 'headers' | 'queryParams', rows: [string, string][]) => {
    if (key === 'headers') setHeaderRows(rows)
    else setQueryRows(rows)
    const rec = Object.fromEntries(rows.filter(([k]) => k.trim()))
    onChange({ ...value, [key]: Object.keys(rec).length ? rec : undefined })
  }

  const auth = value.auth
  const setAuth = (patch: Partial<JsonApiAuthConfig> | null) =>
    onChange({ ...value, auth: patch === null ? undefined : ({ ...(auth ?? { type: 'header' }), ...patch } as JsonApiAuthConfig) })

  const pg = value.pagination
  const setPg = (patch: Partial<JsonApiPaginationConfig> | null) =>
    onChange({
      ...value,
      pagination: patch === null ? undefined : ({ ...(pg ?? { type: 'page' }), ...patch } as JsonApiPaginationConfig),
    })

  // ── Sample record → path suggestions ──
  const [sample, setSample] = useState<SampleState>({ status: 'idle' })
  const missing = jsonApiMissingRequired(value)

  const loadSample = async () => {
    if (!baseUrl.trim() || !value.listEndpoint?.trim()) {
      setSample({ status: 'error', error: 'Enter a base URL and list endpoint first.' })
      return
    }
    setSample({ status: 'loading' })
    try {
      const res = await fetch('/api/admin/sellers/test-extractor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: 'jsonapi',
          baseUrl,
          currency,
          mode: 'raw-sample',
          jsonFields: cleanJsonApiFields(value),
        }),
      })
      const body = await res.json()
      if (!body.ok) setSample({ status: 'error', error: body.error ?? 'The request failed.' })
      else setSample({ status: 'ok', first: body.first, count: body.count, topLevelKeys: body.topLevelKeys ?? [] })
    } catch (err) {
      setSample({ status: 'error', error: err instanceof Error ? err.message : 'The request failed.' })
    }
  }

  const suggestions = useMemo(() => {
    const empty = { product: [], variant: [], option: [], response: [], category: [], none: [] } as Record<Scope, { path: string; preview: string }[]>
    if (sample.status !== 'ok' || !sample.first) {
      if (sample.status === 'ok') empty.response = sample.topLevelKeys.map((k) => ({ path: k, preview: '' }))
      return empty
    }
    const first = sample.first
    const variantArr = value.variantsField ? (readPath(first, value.variantsField) as unknown) : undefined
    const optionArr = value.optionsField ? (readPath(first, value.optionsField) as unknown) : undefined
    return {
      ...empty,
      product: flattenFieldPaths(first),
      variant: Array.isArray(variantArr) && variantArr[0] ? flattenFieldPaths(variantArr[0]) : [],
      option: Array.isArray(optionArr) && optionArr[0] ? flattenFieldPaths(optionArr[0]) : [],
      response: sample.topLevelKeys.map((k) => ({ path: k, preview: '' })),
    }
  }, [sample, value.variantsField, value.optionsField])

  const previewFor = (scope: Scope, path: string | undefined): string | undefined => {
    if (!path || sample.status !== 'ok' || !sample.first) return undefined
    if (scope === 'product') {
      const v = readPath(sample.first, path)
      return v === undefined ? '— not found in sample —' : short(v)
    }
    if (scope === 'variant' && value.variantsField) {
      const arr = readPath(sample.first, value.variantsField)
      if (!Array.isArray(arr) || !arr[0]) return undefined
      const v = readPath(arr[0], path)
      return v === undefined ? '— not found in first variant —' : short(v)
    }
    return undefined
  }

  const renderField = (f: FieldDef) => {
    const raw = value[f.key] as unknown
    const kind = f.kind ?? 'path'
    const scope = f.scope ?? (kind === 'path' ? 'product' : 'none')
    if (kind === 'select' || kind === 'bool') {
      const current = kind === 'bool' ? (raw === false ? 'false' : '') : ((raw as string | undefined) ?? '')
      return (
        <Label key={String(f.key)} text={f.label} hint={f.hint}>
          <select
            className={inputClass}
            value={current}
            onChange={(e) => {
              const v = e.target.value
              if (kind === 'bool') set(f.key, (v === 'false' ? false : undefined) as never)
              else set(f.key, (v || undefined) as never)
            }}
          >
            {f.options!.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Label>
      )
    }
    const text = kind === 'list' ? (Array.isArray(raw) ? (raw as string[]).join(', ') : ((raw as string) ?? '')) : ((raw as string) ?? '')
    const preview = kind === 'path' ? previewFor(scope, text) : undefined
    const listId = kind === 'path' && suggestions[scope]?.length ? `jsonapi-paths-${scope}` : undefined
    return (
      <Label key={String(f.key)} text={f.label} required={f.required} hint={preview ? `Sample: ${preview}` : f.hint}>
        <input
          type="text"
          className={monoInputClass}
          value={text}
          list={listId}
          placeholder={f.placeholder}
          onChange={(e) => set(f.key, e.target.value as never)}
        />
      </Label>
    )
  }

  const countSet = (s: SectionDef): number => {
    if (s.fields) return s.fields.filter((f) => !isBlank(value[f.key])).length
    if (s.custom === 'auth') return auth?.type ? 1 : 0
    if (s.custom === 'pagination') return pg?.type ? 1 : 0
    if (s.custom === 'request') return Object.keys(value.headers ?? {}).length + Object.keys(value.queryParams ?? {}).length
    return 0
  }

  // ── Raw JSON editor ──
  const cleaned = cleanJsonApiFields(value)
  const [rawDraft, setRawDraft] = useState<string | null>(null)
  const [rawError, setRawError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const applyRaw = () => {
    try {
      const parsed = JSON.parse(rawDraft ?? '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Must be a JSON object.')
      const next = cleanJsonApiFields(parsed) as JsonFieldsState
      onChange(next)
      setHeaderRows(Object.entries(next.headers ?? {}))
      setQueryRows(Object.entries(next.queryParams ?? {}))
      setRawDraft(null)
      setRawError(null)
    } catch (err) {
      setRawError(err instanceof Error ? err.message : 'Invalid JSON.')
    }
  }

  const renderCustom = (kind: SectionDef['custom']) => {
    if (kind === 'auth') {
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Label text="Method">
            <select
              className={inputClass}
              value={auth?.type ?? ''}
              onChange={(e) => (e.target.value ? setAuth({ type: e.target.value as JsonApiAuthConfig['type'] }) : setAuth(null))}
            >
              <option value="">None (public feed)</option>
              <option value="header">API key in a header</option>
              <option value="query">API key as a query param</option>
              <option value="bearer">Bearer token</option>
              <option value="basic">Basic auth (user:password)</option>
            </select>
          </Label>
          {(auth?.type === 'header' || auth?.type === 'query') && (
            <Label text={auth.type === 'header' ? 'Header name' : 'Query param name'}>
              <input
                className={monoInputClass}
                value={auth.name ?? ''}
                placeholder={auth.type === 'header' ? 'x-api-key' : 'api_key'}
                onChange={(e) => setAuth({ name: e.target.value })}
              />
            </Label>
          )}
          {auth?.type && (
            <>
              <Label text="Secret from server env var (recommended)" hint="Must start with STORE_SECRET_. Set it in the hosting environment, then redeploy.">
                <input
                  className={monoInputClass}
                  value={auth.valueEnv ?? ''}
                  placeholder="STORE_SECRET_OZ_SCENT"
                  onChange={(e) => setAuth({ valueEnv: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
                />
              </Label>
              <Label text="…or paste the key here" hint="Stored in the seller config — visible to anyone who can open this seller.">
                <input
                  type="password"
                  autoComplete="off"
                  className={monoInputClass}
                  value={auth.value ?? ''}
                  placeholder={auth.type === 'basic' ? 'user:password' : '••••••••'}
                  onChange={(e) => setAuth({ value: e.target.value })}
                />
              </Label>
              {auth.valueEnv && !auth.valueEnv.startsWith('STORE_SECRET_') && (
                <p className="text-[11px] font-semibold text-red-700 sm:col-span-2">
                  Env var names must start with STORE_SECRET_ — any other name is refused at request time.
                </p>
              )}
            </>
          )}
        </div>
      )
    }

    if (kind === 'request') {
      return (
        <>
          <p className="text-[11px] font-semibold text-ink/50">Headers</p>
          <KeyValueEditor
            rows={headerRows}
            onChange={(r) => commitRows('headers', r)}
            keyPlaceholder="User-Agent"
            valuePlaceholder="Mozilla/5.0 …"
            addLabel="Add header"
          />
          <p className="pt-1 text-[11px] font-semibold text-ink/50">Query params</p>
          <KeyValueEditor
            rows={queryRows}
            onChange={(r) => commitRows('queryParams', r)}
            keyPlaceholder="lang"
            valuePlaceholder="en"
            addLabel="Add query param"
          />
        </>
      )
    }

    if (kind === 'pagination') {
      const t = pg?.type
      const num = (k: 'pageSize' | 'startPage' | 'maxPages') => (e: React.ChangeEvent<HTMLInputElement>) =>
        setPg({ [k]: e.target.value === '' ? undefined : Number(e.target.value) } as Partial<JsonApiPaginationConfig>)
      const str = (k: keyof JsonApiPaginationConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setPg({ [k]: e.target.value } as Partial<JsonApiPaginationConfig>)
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Label text="Style">
            <select
              className={inputClass}
              value={t ?? ''}
              onChange={(e) => (e.target.value ? setPg({ type: e.target.value as JsonApiPaginationConfig['type'] }) : setPg(null))}
            >
              <option value="">None — one response has everything</option>
              <option value="page">Page number (?page=2&limit=100)</option>
              <option value="offset">Offset (?offset=100&limit=100)</option>
              <option value="cursor">Cursor (?cursor=token)</option>
            </select>
          </Label>
          {t && (
            <>
              <Label text={t === 'page' ? 'Page param' : t === 'offset' ? 'Offset param' : 'Cursor param'}>
                <input className={monoInputClass} value={pg?.pageParam ?? ''} placeholder={t === 'page' ? 'page' : t === 'offset' ? 'offset' : 'cursor'} onChange={str('pageParam')} />
              </Label>
              <Label text="Page-size param" hint="Blank = 'limit'. Type none if the feed has no page-size param.">
                <input className={monoInputClass} value={pg?.limitParam ?? ''} placeholder="limit" onChange={str('limitParam')} />
              </Label>
              <Label text="Page size" hint="Use the feed's max to save requests.">
                <input type="number" min={1} className={monoInputClass} value={pg?.pageSize ?? ''} placeholder="100" onChange={num('pageSize')} />
              </Label>
              {t === 'page' && (
                <Label text="First page number">
                  <input type="number" min={0} className={monoInputClass} value={pg?.startPage ?? ''} placeholder="1" onChange={num('startPage')} />
                </Label>
              )}
              <Label text="Max pages per load" hint="Safety cap.">
                <input type="number" min={1} className={monoInputClass} value={pg?.maxPages ?? ''} placeholder="20" onChange={num('maxPages')} />
              </Label>
              <Label text="Total items path" hint="e.g. total or meta.total">
                <input className={monoInputClass} value={pg?.totalPath ?? ''} placeholder="total" list={suggestions.response.length ? 'jsonapi-paths-response' : undefined} onChange={str('totalPath')} />
              </Label>
              <Label text="Total pages path">
                <input className={monoInputClass} value={pg?.totalPagesPath ?? ''} placeholder="totalPages" onChange={str('totalPagesPath')} />
              </Label>
              <Label text="Has-more flag path">
                <input className={monoInputClass} value={pg?.hasMorePath ?? ''} placeholder="hasMore" onChange={str('hasMorePath')} />
              </Label>
              {t === 'cursor' && (
                <Label text="Next cursor path">
                  <input className={monoInputClass} value={pg?.nextCursorPath ?? ''} placeholder="nextCursor" onChange={str('nextCursorPath')} />
                </Label>
              )}
            </>
          )}
        </div>
      )
    }

    // raw
    const shown = rawDraft ?? JSON.stringify(cleaned, null, 2)
    return (
      <>
        <textarea
          className={`${monoInputClass} min-h-[220px] text-xs leading-relaxed`}
          spellCheck={false}
          value={shown}
          onChange={(e) => {
            setRawDraft(e.target.value)
            setRawError(null)
          }}
        />
        {rawError && <p className="text-[11px] font-semibold text-red-700">{rawError}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={rawDraft === null}
            onClick={applyRaw}
            className="rounded-lg bg-teal-deep px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Apply JSON
          </button>
          {rawDraft !== null && (
            <button type="button" onClick={() => { setRawDraft(null); setRawError(null) }} className="text-xs font-semibold text-ink/50 hover:underline">
              Discard edits
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(cleaned, null, 2))
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              } catch {
                /* clipboard blocked — the text is selectable anyway */
              }
            }}
            className="flex items-center gap-1 text-xs font-semibold text-teal-deep hover:underline"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <span className="text-[11px] text-ink/40">Base URL and currency are set above, not here.</span>
        </div>
      </>
    )
  }

  return (
    <div className={`flex flex-col gap-3 p-4 ${groupClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold text-ink/50">
          JSON feed settings — confirm each against a real response before {isNew ? 'testing' : 'saving'}.
        </p>
        <button
          type="button"
          onClick={loadSample}
          disabled={sample.status === 'loading'}
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-teal/40 disabled:opacity-50"
        >
          {sample.status === 'loading' && <Loader2 size={12} className="animate-spin" />}
          {sample.status === 'ok' ? 'Reload sample record' : 'Load sample record'}
        </button>
      </div>

      {missing.length > 0 && (
        <p className="text-[11px] text-ink/45">Still needed: {missing.join(', ')}.</p>
      )}

      {sample.status === 'error' && (
        <div className="rounded-lg border border-red-600/25 bg-red-600/5 px-3 py-2 text-xs text-red-700">{sample.error}</div>
      )}
      {sample.status === 'ok' && (
        <details className="rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold text-ink/70">
            {sample.first
              ? `Sample loaded — ${sample.count} record(s) on the first page. Field paths now autocomplete.`
              : `Response reached, but no product array found${sample.topLevelKeys.length ? ` (top-level keys: ${sample.topLevelKeys.join(', ')})` : ''}. Set “Products path in response”.`}
          </summary>
          {sample.first && (
            <pre className="mt-2 max-h-72 overflow-auto rounded bg-ink/[0.03] p-2 text-[11px] leading-relaxed text-ink/70">
              {JSON.stringify(sample.first, null, 2)}
            </pre>
          )}
        </details>
      )}

      {(['product', 'variant', 'option', 'response'] as Scope[]).map((scope) =>
        suggestions[scope].length ? (
          <datalist key={scope} id={`jsonapi-paths-${scope}`}>
            {suggestions[scope].map((s) => (
              <option key={s.path} value={s.path}>
                {s.preview}
              </option>
            ))}
          </datalist>
        ) : null
      )}

      {SECTIONS.map((s) => (
        <Section key={s.id} title={s.title} description={s.description} setCount={countSet(s)} defaultOpen={s.defaultOpen}>
          {s.fields ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{s.fields.map(renderField)}</div>
          ) : (
            renderCustom(s.custom)
          )}
        </Section>
      ))}
    </div>
  )
}

// ── helpers ──

function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/** Client-side mirror of the adapter's path reader (dot paths, indexes, | fallbacks). */
function readPath(raw: unknown, field: string): unknown {
  for (const alt of field.split('|').map((f) => f.trim()).filter(Boolean)) {
    const v = alt.split('.').reduce<unknown>((acc, key) => {
      if (acc == null || typeof acc !== 'object') return undefined
      if (Array.isArray(acc)) {
        const i = Number(key)
        return Number.isInteger(i) ? acc[i < 0 ? acc.length + i : i] : undefined
      }
      return (acc as Record<string, unknown>)[key]
    }, raw)
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

function short(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 70 ? `${s.slice(0, 67)}…` : s
}
