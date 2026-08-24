'use client'

import { useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { warehouseAddresses } from './data'

export default function WarehouseAddressesPage() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  async function copyAddress(key: string, lines: string[]) {
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000)
    } catch {
      // Clipboard access can be denied by the browser; nothing else to do here.
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pb-16 pt-8 lg:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Warehouse addresses</h1>

      <div className="mt-8 overflow-hidden rounded-2xl border border-ink/10 bg-card">
        <p className="px-5 pt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-rust">
          Multi-region consolidation
        </p>

        <div className="mt-3 flex flex-col divide-y divide-ink/10">
          {warehouseAddresses.map((warehouse, index) => {
            const key = `${warehouse.region}-${index}`
            const isCopied = copiedKey === key

            return (
              <button
                key={key}
                type="button"
                disabled={warehouse.disabled}
                onClick={() =>
                  copyAddress(key, [warehouse.recipientPrefix, ...warehouse.addressLines, warehouse.phone])
                }
                className="flex items-center gap-4 px-5 py-4 text-left transition-colors enabled:hover:bg-ink/5 disabled:cursor-not-allowed"
              >
                <span className="grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-full border border-ink/10 bg-paper text-lg leading-none">
                  {warehouse.flag}
                </span>
                <span className={`flex-1 text-sm font-semibold ${warehouse.disabled ? 'text-ink/40' : 'text-ink'}`}>
                  {warehouse.region}
                  {warehouse.note && <span className="font-normal text-muted"> ({warehouse.note})</span>}
                </span>
                {isCopied ? (
                  <Check size={17} className="flex-none text-rust" />
                ) : (
                  <ChevronRight size={17} className="flex-none text-ink/30" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <p className="mt-5 text-sm leading-relaxed text-ink/60">
        Before starting your international shipping, please check the Prohibited Items Catalog and shipment
        restrictions of different warehouses.
      </p>
      <a
        href="#"
        className="mt-2 flex w-max items-center gap-1 text-xs font-bold uppercase tracking-wide text-rust"
      >
        Details <ChevronRight size={13} />
      </a>
    </div>
  )
}
