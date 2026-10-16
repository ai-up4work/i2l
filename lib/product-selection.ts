// lib/product-selection.ts
//
// One answer, shared by the product page, the store grid, the bag and the
// server checkout, to: "does this product need a size / colour picked,
// and which variant does a choice point to?"
//
// The rule matches ProductPurchasePanel: a size or colour is REQUIRED only
// when the product shows that list AND it is a real variant axis
// (isMatchableOption) — a size list that's only informational never blocks
// buying. Selected options are stored as { Size, Color } (the keys the
// product page writes); matching is case-insensitive.
//
// Isomorphic — safe in client and server code.

import type { StoreProduct, StoreProductVariant } from '@/lib/store.types'
import { isMatchableOption } from '@/lib/product-options'

export type SelectionKey = 'Size' | 'Color'

const LABEL: Record<SelectionKey, string> = { Size: 'size', Color: 'colour' }

/** The choices a shopper must make before this product can go in the bag. */
export function requiredSelections(product: StoreProduct): SelectionKey[] {
  const out: SelectionKey[] = []
  if (product.sizes?.length && isMatchableOption(product, 'size')) out.push('Size')
  if (product.colors?.length && isMatchableOption(product, 'color')) out.push('Color')
  return out
}

/** Grid / quick-add check: true when the product has anything to choose,
 *  so a one-tap "Add to bag" would have to guess. Lenient on purpose —
 *  list results sometimes carry sizes/colours without full option data. */
export function hasChoices(product: StoreProduct): boolean {
  return requiredSelections(product).length > 0 || !!product.sizes?.length || !!product.colors?.length || (product.variants?.length ?? 0) > 1
}

function valueOf(selected: Record<string, string> | null | undefined, key: SelectionKey): string | undefined {
  if (!selected) return undefined
  const hit = Object.keys(selected).find((k) => k.toLowerCase() === key.toLowerCase() || (key === 'Color' && k.toLowerCase() === 'colour'))
  return hit ? selected[hit] : undefined
}

/** Required choices not made yet. */
export function missingSelections(product: StoreProduct, selected: Record<string, string> | null | undefined): SelectionKey[] {
  return requiredSelections(product).filter((k) => !valueOf(selected, k))
}

/** "Choose a size and colour" style hint. */
export function selectionHint(missing: SelectionKey[]): string {
  return `Choose a ${missing.map((k) => LABEL[k]).join(' and ')}`
}

/** The variant a choice points to (in stock or not), or null. */
export function variantFor(product: StoreProduct, selected: Record<string, string> | null | undefined): StoreProductVariant | null {
  if (!selected || !product.variants?.length || !product.options?.length) return null
  const chosen = new Map(Object.entries(selected).map(([k, v]) => [k.toLowerCase() === 'colour' ? 'color' : k.toLowerCase(), v.toLowerCase()]))
  if (!chosen.size) return null
  const axes = product.options.map((o) => (o.name.toLowerCase() === 'colour' ? 'color' : o.name.toLowerCase()))
  if (!axes.some((a) => chosen.has(a))) return null
  return (
    product.variants.find((v) => axes.every((a, i) => !chosen.has(a) || (v.options[i]?.toLowerCase() ?? '') === chosen.get(a))) ??
    null
  )
}

/** Keeps only the option keys this product really has (Size / Color). */
export function cleanSelection(product: StoreProduct, selected: Record<string, string> | null | undefined): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  const size = valueOf(selected, 'Size')
  const color = valueOf(selected, 'Color')
  if (size && product.sizes?.length) out.Size = size
  if (color && product.colors?.length) out.Color = color
  return Object.keys(out).length ? out : undefined
}
