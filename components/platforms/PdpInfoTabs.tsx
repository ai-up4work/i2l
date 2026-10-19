'use client'

// components/platforms/PdpInfoTabs.tsx
//
// The Description / Details / Shipping & Returns section at the bottom of
// every store view in the item screen. One component, so every store
// behaves and looks the same; each store passes its own colour and any
// extras it has (Croma's key features, Nykaa's combo list, Myntra's style
// ID, eBay's item specifics…).
//
// Rules, the same for every store:
//   • A tab only shows when it has something real in it. No more "We
//     don't have a description… here's the title instead".
//   • Shipping & Returns always shows, and always ends with how delivery
//     to Sri Lanka works — that's the part the shopper actually needs.
//   • "Returns" only appears when the store told us; we never claim "Not
//     accepted" just because the field was empty.
//   • Rows with the same label are shown once.

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import PdpTabBar from './PdpTabBar'

export type InfoRow = { label: string; value: string }

export type PdpInfoTabsProps = {
  result: ScrapeResult
  /** Store colour: active tab, bullets, the highlighted size-chart row. */
  accent?: string
  /** Replaces the plain description text (e.g. a cleaned-up version). */
  descriptionText?: string | null
  /** Replaces the whole Description body (e.g. Nykaa's combo list). */
  description?: ReactNode
  /** Bullet list shown above the description. */
  keyFeatures?: string[] | null
  /** Replaces the default Details rows (brand, model, category, specifics). */
  details?: InfoRow[]
  /** Added after the Details rows. */
  extraDetails?: InfoRow[]
  /** Extra titled blocks under Details, e.g. "Legal & compliance". */
  detailSections?: { title: string; rows: InfoRow[] }[]
  /** Anything else under Details (a note, a warning). */
  detailsFooter?: ReactNode
  /** Show the scraped size chart under Details (default: yes, when there is one). */
  showSizeChart?: boolean
  /** Extra rows for Shipping & Returns, before the standard ones. */
  extraShipping?: InfoRow[]
}

const TABS = ['Description', 'Details', 'Shipping & Returns'] as const
type Tab = (typeof TABS)[number]

function clean(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).replace(/\s+\n/g, '\n').trim()
  return s ? s : null
}

function dedupe(rows: InfoRow[]): InfoRow[] {
  const seen = new Set<string>()
  const out: InfoRow[] = []
  for (const r of rows) {
    const label = clean(r.label)
    const value = clean(r.value)
    if (!label || !value) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label, value })
  }
  return out
}

export function defaultDetailRows(result: ScrapeResult): InfoRow[] {
  return [
    { label: 'Brand', value: result.brand ?? '' },
    { label: 'Model', value: result.mpn ?? '' },
    { label: 'Category', value: result.categoryPath ?? '' },
    ...(result.itemSpecifics ?? []).map((s) => ({ label: s.name, value: s.value })),
  ]
}

function Rows({ rows }: { rows: InfoRow[] }) {
  return (
    <dl className="flex w-full max-w-xl flex-col divide-y divide-ink/[0.06] text-[13px]">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="flex items-baseline justify-between gap-6 py-2 first:pt-0 last:pb-0">
          <dt className="flex-none font-semibold text-ink/60">{r.label}</dt>
          <dd className="min-w-0 text-right text-ink/75 [overflow-wrap:anywhere]">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function SizeChartTable({ chart }: { chart: NonNullable<ScrapeResult['sizeChart']> }) {
  return (
    <div className="flex flex-col gap-3">
      {chart.map((table, i) => (
        <div key={i} className="overflow-x-auto">
          {'title' in table && table.title && <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink/45">{table.title}</p>}
          {'columns' in table && (
            <table className="w-full border-collapse text-left text-xs text-ink">
              <thead>
                <tr className="border-b border-ink/10">
                  {table.columns.map((col) => (
                    <th key={col} className="whitespace-nowrap py-1.5 pr-4 font-semibold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-b border-ink/5 last:border-0">
                    {table.columns.map((col) => (
                      <td key={col} className="whitespace-nowrap py-1.5 pr-4">
                        {(row as Record<string, unknown>)[col] as ReactNode}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}

export default function PdpInfoTabs({
  result,
  accent,
  descriptionText,
  description,
  keyFeatures,
  details,
  extraDetails,
  detailSections,
  detailsFooter,
  showSizeChart = true,
  extraShipping,
}: PdpInfoTabsProps) {
  const text = descriptionText !== undefined ? clean(descriptionText) : clean(result.description)
  const features = (keyFeatures ?? []).map(clean).filter(Boolean) as string[]
  const hasDescription = !!description || !!text || features.length > 0

  const detailRows = useMemo(() => dedupe([...(details ?? defaultDetailRows(result)), ...(extraDetails ?? [])]), [details, extraDetails, result])
  const sections = (detailSections ?? []).map((s) => ({ ...s, rows: dedupe(s.rows) })).filter((s) => s.rows.length)
  const chart = showSizeChart && result.sizeChart && result.sizeChart.length ? result.sizeChart : null
  const hasDetails = detailRows.length > 0 || sections.length > 0 || !!chart || !!detailsFooter

  const shippingRows = dedupe([
    ...(extraShipping ?? []),
    { label: 'Sold by', value: result.seller ?? '' },
    { label: 'Ships from', value: result.itemLocation ?? '' },
    {
      label: 'Returns',
      value:
        result.returnsAccepted == null
          ? ''
          : result.returnsAccepted
            ? `Accepted${result.returnPeriodDays ? ` within ${result.returnPeriodDays} days` : ''}`
            : 'Not accepted',
    },
    { label: 'Availability', value: result.availability ?? '' },
  ])

  const tabs = TABS.filter((t) => (t === 'Description' ? hasDescription : t === 'Details' ? hasDetails : true))
  const [picked, setPicked] = useState<Tab>(tabs[0])
  const active: Tab = tabs.includes(picked) ? picked : tabs[0]

  const vars = (accent ? { '--pdp-tab-accent': accent } : {}) as CSSProperties

  return (
    <div className="mt-8 border-t border-ink/10 pt-6" style={vars}>
      <PdpTabBar tabs={tabs} active={active} onChange={setPicked} accent={accent} />
      <div
        key={active}
        className="mt-4 min-h-[96px] rounded-2xl border border-ink/[0.06] bg-ink/[0.015] p-4 text-sm leading-relaxed text-ink/70 motion-safe:[animation:tabFadeIn_0.18s_ease-out_both] sm:p-5"
      >
        {active === 'Description' && (
          <div className="flex flex-col gap-4">
            {features.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[var(--pdp-tab-accent,currentColor)]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}
            {description ?? (text && <p className="whitespace-pre-line">{text}</p>)}
          </div>
        )}

        {active === 'Details' && (
          <div className="flex flex-col gap-5">
            {detailRows.length > 0 && <Rows rows={detailRows} />}
            {sections.map((s) => (
              <div key={s.title}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/45">{s.title}</p>
                <Rows rows={s.rows} />
              </div>
            ))}
            {chart && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/45">Size chart</p>
                <div className="rounded-xl border border-ink/[0.08] bg-parchment p-3">
                  <SizeChartTable chart={chart} />
                </div>
              </div>
            )}
            {detailsFooter}
          </div>
        )}

        {active === 'Shipping & Returns' && (
          <div className="flex flex-col gap-4">
            {shippingRows.length > 0 && <Rows rows={shippingRows} />}
            <p className="text-[13px] text-ink/55">
              We buy it from the store and ship it to you in Sri Lanka. Delivery charges and timing are confirmed with your
              quote — you won&apos;t be charged until you agree.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
