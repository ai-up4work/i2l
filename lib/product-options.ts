import type { StoreProduct } from '@/lib/store.types'

/**
 * Cross-references a product's full option list (e.g. all 5 sizes the
 * store carries) against its real variants to determine which specific
 * values are actually purchasable right now. A value with no matching
 * variant at all is treated as unavailable — the shopper can't buy it
 * either way. If the product has no variants data at all, every value is
 * shown as available by default since there's no basis to say otherwise.
 */
export function optionAvailability(product: StoreProduct, optionName: string): Map<string, boolean> {
  const map = new Map<string, boolean>()
  const optionIndex = product.options?.findIndex((o) => o.name.toLowerCase() === optionName.toLowerCase()) ?? -1
  const values = optionIndex >= 0 ? product.options![optionIndex].values : []
  if (!values.length) return map

  for (const value of values) {
    if (!product.variants?.length) {
      map.set(value, true)
      continue
    }
    const matched = product.variants.some(
      (v) => v.available && (v.options[optionIndex]?.toLowerCase() ?? '') === value.toLowerCase()
    )
    map.set(value, matched)
  }
  return map
}

/**
 * For a given color value, finds the first variant carrying that color and
 * returns its photo, if the upstream feed provided one.
 */
export function colorImageMap(product: StoreProduct): Map<string, string> {
  const map = new Map<string, string>()
  if (!product.variants?.length || !product.options?.length) return map

  const colorIndex = product.options.findIndex((o) => o.name.toLowerCase() === 'color')
  if (colorIndex < 0) return map

  for (const v of product.variants) {
    const value = v.options[colorIndex]
    if (value && v.image && !map.has(value)) map.set(value, v.image)
  }
  return map
}

/**
 * Finds the variant matching a full set of selected option values (e.g.
 * { Size: 'M', Color: 'Black' }), case-insensitively on both the option
 * name and the value. A size that's available on its own can still be
 * sold out in the specific color chosen — this checks the real
 * combination instead of each option in isolation. Returns:
 *  - the matching variant, if one is in stock for that exact combo
 *  - undefined if every required value is selected but nothing matches
 *  - null if the product has no per-variant data to check against
 */
export function findMatchingVariant(
  product: StoreProduct,
  selected: Record<string, string>
) {
  if (!product.options?.length) return null
  if (!product.variants?.length) return null

  const selectedLower = new Map(
    Object.entries(selected).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()])
  )

  return (
    product.variants.find(
      (v) =>
        v.available &&
        product.options!.every((opt, i) => {
          const chosen = selectedLower.get(opt.name.toLowerCase())
          return chosen == null || (v.options[i]?.toLowerCase() ?? '') === chosen
        })
    ) ?? undefined
  )
}