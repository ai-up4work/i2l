// app/admin/(protected)/(common)/quote/page.tsx
//
// Staff quote calculator. The calculator itself lives in
// components/quote/QuoteCalculator.tsx so the public /demo/quote page can
// render the same calculator in its customer mode.
import QuoteCalculator from '@/components/quote/QuoteCalculator'

export default function AdminQuotePage() {
  return <QuoteCalculator />
}
