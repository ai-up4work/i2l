// components/CurrencySelect.tsx
'use client'

import { SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/currency/convert'

type CurrencySelectProps = {
  value: CurrencyCode
  onChange: (currency: CurrencyCode) => void
  className?: string
}

export default function CurrencySelect({ value, onChange, className }: CurrencySelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CurrencyCode)}
      className={className ?? 'rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold/50'}
    >
      {SUPPORTED_CURRENCIES.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
  )
}