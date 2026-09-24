// components/stores/ProductInfoTabs.tsx
'use client'

import { useEffect, useState } from 'react'
import { normalizeDescription } from '@/lib/scrape/normalize-description'

// Structural, not tied to StoreProduct — anything shaped like this
// works (StoreProduct already satisfies it; ScrapeResult-derived
// adapters, e.g. from ShopifyProductView, do too), so this component
// stays reusable across platform views instead of forking per-source.
export interface ProductInfoTabsData {
  description?: string | null
  fullDescription?: string | null
  vendor?: string | null
  productType?: string | null
  sku?: string | null
  condition?: string | null
  seller?: string | null
  itemLocation?: string | null
  weightKg?: number | null
  returnsAccepted?: boolean | null
  returnPeriodDays?: number | null
  sizeChart?: Array<Record<string, string> & { size: string }> | null
}

const ALL_TABS = ['Description', 'Details', 'Shipping & Returns', 'Size chart', 'FAQs'] as const
type InfoTab = (typeof ALL_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="font-semibold text-ink/70">{label}</dt>
      <dd className="text-right text-ink/55">{value}</dd>
    </div>
  )
}

export default function ProductInfoTabs({ product }: { product: ProductInfoTabsData }) {
  const p = product

  const rawDescription = p.fullDescription || p.description || ''
  const hasRawDescription = rawDescription.trim().length > 0

  // Runs the merchant's raw body_html (or the flat plain-text
  // description as a fallback) through normalizeDescription() — strips
  // theme-breaking inline styles, decorative wrapper divs, and
  // unresolved lazy-load images, and pulls a spec table / FAQ block out
  // into structured data instead of leaving them as prose. This used to
  // go through a bare `DOMPurify.sanitize(rawDescription)` call, which
  // only strips XSS vectors (script tags, event handlers) — it left
  // every merchant-specific styling problem (white-on-nothing text,
  // full-bleed banner divs, a buried spec <table>, broken <img>s
  // waiting on a lazy-load script we don't run) completely intact.
  const [normalized, setNormalized] = useState<ReturnType<typeof normalizeDescription> | null>(null)
  useEffect(() => {
    if (hasRawDescription) {
      setNormalized(normalizeDescription(p.fullDescription, p.description))
    } else {
      setNormalized(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fullDescription, p.description, hasRawDescription])

  const cleanDescriptionHtml = normalized?.html ?? ''
  const extractedSpecs = normalized?.specs ?? []
  const extractedFaqs = normalized?.faqs ?? []

  const hasDescription = hasRawDescription
  const hasDetails = !!(p.vendor || p.productType || p.sku || p.condition || extractedSpecs.length)
  const hasShipping = !!(p.seller || p.itemLocation || p.weightKg != null || p.returnsAccepted != null)
  const hasSizeChart = !!p.sizeChart?.length
  const hasFaqs = extractedFaqs.length > 0

  const tabs = ALL_TABS.filter((t) =>
    t === 'Description'
      ? hasDescription
      : t === 'Details'
        ? hasDetails
        : t === 'Shipping & Returns'
          ? hasShipping
          : t === 'Size chart'
            ? hasSizeChart
            : hasFaqs
  )

  const [activeTab, setActiveTab] = useState<InfoTab | null>(tabs[0] ?? null)

  if (!tabs.length || !activeTab) return null

  const sizeChartCols = hasSizeChart ? Object.keys(p.sizeChart![0]).filter((k) => k !== 'size') : []

  return (
    <div className="mt-8 border-t border-ink/10 pt-6">
      <div className="flex gap-5 overflow-x-auto border-b border-ink/10">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'border-teal-deep text-ink'
                : 'border-transparent text-ink/40 hover:text-ink/70'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div
        key={activeTab}
        className="min-h-[96px] pb-2 pt-4 text-sm leading-relaxed text-ink/65 motion-safe:[animation:tabFadeIn_0.18s_ease-out_both]"
      >
        {activeTab === 'Description' && (
          cleanDescriptionHtml ? (
            <div className="merchant-description" dangerouslySetInnerHTML={{ __html: cleanDescriptionHtml }} />
          ) : (
            <div className="animate-pulse space-y-2">
              <div className="h-3 w-full rounded bg-ink/10" />
              <div className="h-3 w-5/6 rounded bg-ink/10" />
              <div className="h-3 w-2/3 rounded bg-ink/10" />
            </div>
          )
        )}

        {activeTab === 'Details' && (
          <dl className="flex flex-col divide-y divide-ink/5 text-xs">
            {p.vendor && <DetailRow label="Brand" value={p.vendor} />}
            {p.productType && <DetailRow label="Type" value={p.productType} />}
            {p.sku && <DetailRow label="SKU" value={p.sku} />}
            {p.condition && <DetailRow label="Condition" value={p.condition} />}
            {/* Specs pulled out of the merchant's own spec table (see
                normalizeDescription's extractSpecs) — additive to the
                manual fields above, not a replacement, since a given
                platform may populate one, the other, or both. */}
            {extractedSpecs.map((spec) => (
              <DetailRow key={spec.name} label={spec.name} value={spec.value} />
            ))}
          </dl>
        )}

        {activeTab === 'Shipping & Returns' && (
          <dl className="flex flex-col divide-y divide-ink/5 text-xs">
            {p.seller && <DetailRow label="Sold by" value={p.seller} />}
            {p.itemLocation && <DetailRow label="Ships from" value={p.itemLocation} />}
            {p.weightKg != null && <DetailRow label="Weight" value={`${p.weightKg} kg`} />}
            {p.returnsAccepted != null && (
              <DetailRow
                label="Returns"
                value={
                  p.returnsAccepted
                    ? `Accepted${p.returnPeriodDays ? ` within ${p.returnPeriodDays} days` : ''}`
                    : 'Not accepted by seller'
                }
              />
            )}
          </dl>
        )}

        {activeTab === 'Size chart' && hasSizeChart && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-ink/10 text-left text-ink/45">
                  <th className="py-1.5 pr-4 font-semibold">Size</th>
                  {sizeChartCols.map((col) => (
                    <th key={col} className="py-1.5 pr-4 font-semibold capitalize">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.sizeChart!.map((row) => (
                  <tr key={row.size} className="border-b border-ink/5 last:border-0">
                    <td className="py-1.5 pr-4 font-semibold text-ink/70">{row.size}</td>
                    {sizeChartCols.map((col) => (
                      <td key={col} className="py-1.5 pr-4 text-ink/55">
                        {row[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'FAQs' && hasFaqs && (
          <div className="flex flex-col divide-y divide-ink/5">
            {extractedFaqs.map((faq) => (
              <details key={faq.question} className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-ink/80 marker:content-none">
                  {faq.question}
                  <span className="text-teal-deep transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-xs leading-relaxed text-ink/55">{faq.answer}</p>
              </details>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .merchant-description :global(p) {
          margin-bottom: 0.9em;
        }
        .merchant-description :global(h1),
        .merchant-description :global(h2),
        .merchant-description :global(h3) {
          font-weight: 700;
          color: inherit;
          margin-top: 1.25em;
          margin-bottom: 0.5em;
        }
        .merchant-description :global(h1) {
          font-size: 1.25rem;
        }
        .merchant-description :global(h2) {
          font-size: 1.1rem;
        }
        .merchant-description :global(h3) {
          font-size: 1rem;
        }
        .merchant-description :global(ul),
        .merchant-description :global(ol) {
          margin: 0.75em 0;
          padding-left: 1.25em;
        }
        .merchant-description :global(ul) {
          list-style: disc;
        }
        .merchant-description :global(ol) {
          list-style: decimal;
        }
        .merchant-description :global(li) {
          margin-bottom: 0.35em;
        }
        .merchant-description :global(strong),
        .merchant-description :global(b) {
          font-weight: 600;
        }
        .merchant-description :global(a) {
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .merchant-description :global(> *:first-child) {
          margin-top: 0;
        }
        .merchant-description :global(> *:last-child) {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  )
}