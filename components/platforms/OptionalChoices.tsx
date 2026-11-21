'use client'

// Optional Size / Colour / Anything-else boxes for listings we could only read
// partially (Open-Graph-level reads, where there are no variants at all). The
// shopper types what they want; it is reported up through onSelectionChange
// like a picked variant, so it lands on the cart line and the request.

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FIELDS = [
  { key: 'Size', label: 'Size', placeholder: 'e.g. M, XL, 32' },
  { key: 'Color', label: 'Colour', placeholder: 'e.g. Navy blue' },
  { key: 'Other', label: 'Anything else', placeholder: 'e.g. style, pack of 2, left/right' },
]

export default function OptionalChoices({
  resetKey,
  onSelectionChange,
}: {
  /** Changes when the shopper moves to another product. */
  resetKey: string
  onSelectionChange?: (selection: Record<string, string>) => void
}) {
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setTyped({})
    setOpen(false)
  }, [resetKey])
  useEffect(() => {
    if (!onSelectionChange) return
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(typed)) {
      const t = v.trim().slice(0, 80)
      if (t) out[k] = t
    }
    onSelectionChange(out)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(typed)])

  const filled = Object.values(typed).some((v) => v.trim())
  return (
    <div className="mt-4">
      {/* Collapsed by default: nothing is asked of the shopper unless they want to. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-deep hover:underline"
      >
        {filled ? 'Your size / colour notes' : 'Add size or colour'}
        {!filled && <span className="font-medium text-ink/40">(optional)</span>}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className={f.key === 'Other' ? 'sm:col-span-2' : ''}>
              <span className="mb-1 block text-xs font-semibold text-ink/55">{f.label}</span>
              <input
                value={typed[f.key] ?? ''}
                onChange={(e) => setTyped((prev) => ({ ...prev, [f.key]: e.target.value }))}
                maxLength={80}
                placeholder={f.placeholder}
                autoComplete="off"
                className="w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-teal/60 focus:ring-2 focus:ring-teal/10"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
