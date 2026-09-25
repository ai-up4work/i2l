// components/stores/ProductInfoTabs.tsx
'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
    <div className="flex items-baseline justify-between gap-4 rounded-lg px-2.5 py-2 transition-colors hover:bg-ink/[0.03]">
      <dt className="text-ink/50">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  )
}

// Sliding pill indicator behind the active tab — measured from real DOM
// rects rather than fixed percentages, since the tab set here is
// dynamic (only tabs with content render at all) and each has a
// different label width.
//
// FIX: previously took `tabs` (a freshly-filtered array from the
// caller, so a new reference on every render) directly as an effect
// dependency, and called `setStyle` with a brand-new object every time
// it ran. Reference-unstable deps meant the effect re-ran on every
// single render regardless of whether anything actually changed, and
// each run's unconditional setStyle() triggered another render — an
// infinite ("Maximum update depth exceeded") loop. Two independent
// fixes close it: the caller now memoizes `tabs` so its reference is
// stable across renders where the underlying tab set hasn't changed,
// and this hook now only calls setStyle when the computed left/width
// actually differ from the last measurement, so even a spurious re-run
// (new tabs reference, unrelated parent re-render, etc.) can't cause
// another state update.
function useSlidingIndicator(activeTab: InfoTab | null, tabs: readonly InfoTab[]) {
  const railRef = useRef<HTMLDivElement | null>(null)
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [style, setStyle] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const rail = railRef.current
    const btn = activeTab ? btnRefs.current.get(activeTab) : null
    if (!rail || !btn) return
    const railRect = rail.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    const left = btnRect.left - railRect.left + rail.scrollLeft
    const width = btnRect.width

    setStyle((prev) => {
      if (prev && prev.left === left && prev.width === width) return prev
      return { left, width }
    })
  }, [activeTab, tabs])

  return { railRef, btnRefs, style }
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

  // FIX: memoized so this array keeps the SAME reference across renders
  // where the underlying has* flags haven't changed. Previously this
  // was recomputed with a bare `ALL_TABS.filter(...)` on every render,
  // producing a new array every time — which fed straight into
  // useSlidingIndicator's effect dependency array below and was the
  // root cause of the infinite update loop (see that hook's comment).
  const tabs = useMemo(
    () =>
      ALL_TABS.filter((t) =>
        t === 'Description'
          ? hasDescription
          : t === 'Details'
            ? hasDetails
            : t === 'Shipping & Returns'
              ? hasShipping
              : t === 'Size chart'
                ? hasSizeChart
                : hasFaqs
      ),
    [hasDescription, hasDetails, hasShipping, hasSizeChart, hasFaqs]
  )

  const [activeTab, setActiveTab] = useState<InfoTab | null>(tabs[0] ?? null)
  const { railRef, btnRefs, style: indicatorStyle } = useSlidingIndicator(activeTab, tabs)

  // Keep activeTab valid if the tab set changes underneath it (e.g. the
  // description finishes normalizing after FAQs already picked an
  // earlier active tab, or a prop update removes the currently active
  // tab entirely) — falls back to the first available tab rather than
  // rendering a panel for a tab that no longer exists.
  useEffect(() => {
    if (activeTab && tabs.includes(activeTab)) return
    setActiveTab(tabs[0] ?? null)
  }, [tabs, activeTab])

  if (!tabs.length || !activeTab) return null

  const sizeChartCols = hasSizeChart ? Object.keys(p.sizeChart![0]).filter((k) => k !== 'size') : []

  return (
    <div className="mt-8 border-t border-ink/10 pt-6">
      <div
        ref={railRef}
        className="relative flex gap-1 overflow-x-auto rounded-full bg-ink/[0.035] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {indicatorStyle && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 rounded-full bg-parchment shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-ink/[0.06] transition-[transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: indicatorStyle.width, transform: `translateX(${indicatorStyle.left}px)` }}
          />
        )}
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            ref={(el) => {
              if (el) btnRefs.current.set(tab, el)
              else btnRefs.current.delete(tab)
            }}
            onClick={() => setActiveTab(tab)}
            aria-pressed={activeTab === tab}
            className={`relative z-10 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors duration-200 ${
              activeTab === tab ? 'text-ink' : 'text-ink/45 hover:text-ink/70'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div
        key={activeTab}
        className="mt-4 min-h-[96px] rounded-2xl border border-ink/[0.06] bg-ink/[0.015] p-4 text-sm leading-relaxed text-ink/70 motion-safe:[animation:tabFadeIn_0.18s_ease-out_both] sm:p-5"
      >
        {activeTab === 'Description' && (
          cleanDescriptionHtml ? (
            <div className="merchant-description" dangerouslySetInnerHTML={{ __html: cleanDescriptionHtml }} />
          ) : (
            <div className="animate-pulse space-y-2.5">
              <div className="h-3 w-full rounded-full bg-ink/10" />
              <div className="h-3 w-5/6 rounded-full bg-ink/10" />
              <div className="h-3 w-2/3 rounded-full bg-ink/10" />
            </div>
          )
        )}

        {activeTab === 'Details' && (
          <dl className="-mx-2.5 flex flex-col divide-y divide-ink/[0.06] text-xs">
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
          <dl className="-mx-2.5 flex flex-col divide-y divide-ink/[0.06] text-xs">
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
          <div className="-m-4 overflow-x-auto sm:-m-5">
            <table className="w-full min-w-[320px] border-collapse text-xs">
              <thead>
                <tr className="text-left text-ink/45">
                  <th className="py-2 pl-4 pr-4 font-semibold sm:pl-5">Size</th>
                  {sizeChartCols.map((col) => (
                    <th key={col} className="py-2 pr-4 font-semibold capitalize">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.sizeChart!.map((row, i) => (
                  <tr key={row.size} className={i % 2 === 1 ? 'bg-ink/[0.025]' : undefined}>
                    <td className="py-2 pl-4 pr-4 font-semibold text-ink sm:pl-5">{row.size}</td>
                    {sizeChartCols.map((col) => (
                      <td key={col} className="py-2 pr-4 text-ink/60">
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
          <div className="-mx-1 flex flex-col divide-y divide-ink/[0.06]">
            {extractedFaqs.map((faq) => (
              <details key={faq.question} className="group px-1 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-ink/80 marker:content-none">
                  {faq.question}
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-ink/[0.05] text-[13px] leading-none text-ink/50 transition-transform duration-200 group-open:rotate-45 group-open:bg-teal/10 group-open:text-teal-deep">
                    +
                  </span>
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