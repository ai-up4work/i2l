// lib/delivery-dates.ts
//
// "Arrives around 28 Oct – 2 Nov" from a day range, so shoppers see dates
// rather than a count of days. Isomorphic; Sri Lanka time.

const fmt = (d: Date, withMonth = true) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', ...(withMonth ? { month: 'short' } : {}), timeZone: 'Asia/Colombo' })

export function arrivalRange(minDays: number, maxDays: number, from: Date = new Date()): string {
  const a = new Date(from.getTime() + minDays * 86_400_000)
  const b = new Date(from.getTime() + maxDays * 86_400_000)
  const sameMonth = fmt(a).split(' ')[1] === fmt(b).split(' ')[1]
  return sameMonth ? `${fmt(a, false)} – ${fmt(b)}` : `${fmt(a)} – ${fmt(b)}`
}
