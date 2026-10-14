// components/store-modules/casecraft/seller/ModelChecklist.tsx
// Tick phone models, grouped by brand, with "all" / "none" per brand.
'use client'

import { BRANDS, type CaseModel } from '@/lib/store-modules/casecraft/catalog'

export default function ModelChecklist({
  models,
  checked,
  onChange,
}: {
  models: CaseModel[]
  checked: Set<string>
  onChange: (next: Set<string>) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {BRANDS.map((b) => {
        const list = models.filter((m) => m.brand === b.id)
        if (!list.length) return null
        const on = list.filter((m) => checked.has(m.label)).length
        const setAll = (value: boolean) => {
          const next = new Set(checked)
          for (const m of list) {
            if (value) next.add(m.label)
            else next.delete(m.label)
          }
          onChange(next)
        }
        return (
          <div key={b.id}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-body text-sm font-semibold text-ink">
                {b.label} <span className="font-normal text-ink/50">({on}/{list.length})</span>
              </p>
              <span className="flex gap-3 font-body text-xs font-semibold text-teal-deep">
                <button type="button" onClick={() => setAll(true)} className="hover:underline">
                  All
                </button>
                <button type="button" onClick={() => setAll(false)} className="hover:underline">
                  None
                </button>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((m) => {
                const isOn = checked.has(m.label)
                return (
                  <label
                    key={m.label}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 font-body text-xs transition-colors ${
                      isOn ? 'bg-teal/8 text-ink ring-1 ring-teal/30' : 'text-ink/50 ring-1 ring-ink/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => {
                        const next = new Set(checked)
                        if (isOn) next.delete(m.label)
                        else next.add(m.label)
                        onChange(next)
                      }}
                      className="accent-[var(--color-teal)]"
                    />
                    <span className="truncate">{m.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
