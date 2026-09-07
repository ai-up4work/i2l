// components/stores/ProductInfoTabs.tsx
'use client'

import { useState } from 'react'
import type { StoreProduct } from '@/lib/store.types'

const ALL_TABS = ['Description', 'Details', 'Shipping & Returns', 'Size chart'] as const
type InfoTab = (typeof ALL_TABS)[number]

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="font-semibold text-ink/70">{label}</dt>
      <dd className="text-right text-ink/55">{value}</dd>
    </div>
  )
}

/**
 * Bottom-most, full-width Description / Details / Shipping & Returns /
 * Size chart tab strip — same visual language as ShopifyProductView's
 * ProductInfoTabs (teal active underline, fade-in on tab switch), but
 * driven by StoreProduct fields instead of a ScrapeResult.
 *
 * Availability-driven: a tab only appears if the product actually has
 * data for it — no "we don't have this" placeholder tabs. If nothing
 * qualifies at all, the whole section renders null.
 */
export default function ProductInfoTabs({ product }: { product: StoreProduct }) {
  // Some fields here (itemLocation, returnsAccepted, returnPeriodDays,
  // sizeChart) aren't confirmed on StoreProduct yet — narrow this cast
  // once you confirm the shape; everything is optional-chained so it's
  // safe either way.
  const p = product as StoreProduct & {
    itemLocation?: string
    returnsAccepted?: boolean
    returnPeriodDays?: number
    sizeChart?: Array<Record<string, string> & { size: string }>
  }

  const hasDescription = !!(p.description || p.fullDescription)
  const hasDetails = !!(p.vendor || p.productType || p.sku || p.condition)
  const hasShipping = !!(p.seller || p.itemLocation || p.weightKg != null || p.returnsAccepted != null)
  const hasSizeChart = !!p.sizeChart?.length

  const tabs = ALL_TABS.filter((t) =>
    t === 'Description'
      ? hasDescription
      : t === 'Details'
        ? hasDetails
        : t === 'Shipping & Returns'
          ? hasShipping
          : hasSizeChart
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
          <p className="whitespace-pre-line">{p.fullDescription || p.description}</p>
        )}

        {activeTab === 'Details' && (
          <dl className="flex flex-col divide-y divide-ink/5 text-xs">
            {p.vendor && <DetailRow label="Brand" value={p.vendor} />}
            {p.productType && <DetailRow label="Type" value={p.productType} />}
            {p.sku && <DetailRow label="SKU" value={p.sku} />}
            {p.condition && <DetailRow label="Condition" value={p.condition} />}
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
      </div>
    </div>
  )
}