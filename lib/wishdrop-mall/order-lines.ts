// lib/wishdrop-mall/order-lines.ts
//
// SERVER-ONLY. Maps a Wishdrop Mall cart/order line back to the product
// and variant it refers to, for stock checks and deductions.
//
// A Mall line's url/store_url is built by toCartSnapshot
// (components/stores/AddToBagButton.tsx) as:
//   wishdrop-mall:<product uuid>                         (no variant)
//   wishdrop-mall:<product uuid>:Color=Red,Size=M        (keys sorted)
// Rather than parsing the option text back apart (a value containing a
// comma or "=" would break that), we rebuild the same suffix for each of
// the product's variants and compare the strings exactly.

import { WISHDROP_MALL_SLUG } from '@/lib/wishdrop-mall'
import type { AdminClient } from './admin'

const PREFIX = `${WISHDROP_MALL_SLUG}:`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function isMallLineUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.startsWith(PREFIX)
}

/** Same format as toCartSnapshot's variant suffix. */
function optionsSuffix(options: Record<string, string>): string {
  const keys = Object.keys(options).sort()
  return keys.length ? `:${keys.map((k) => `${k}=${options[k]}`).join(',')}` : ''
}

export type ResolvedMallLine = {
  productId: string
  productName: string
  variantId: string | null
  variantLabel: string | null
  /** Quantity on hand right now (null = not tracked). */
  stock: number | null
}

/** Resolves many line urls at once. Unresolvable urls are left out. */
export async function resolveMallLines(admin: AdminClient, urls: string[]): Promise<Map<string, ResolvedMallLine>> {
  const out = new Map<string, ResolvedMallLine>()
  const parsed = urls
    .filter(isMallLineUrl)
    .map((url) => {
      const rest = url.slice(PREFIX.length)
      const m = rest.match(UUID)
      return m ? { url, productId: m[0].toLowerCase(), suffix: rest.slice(m[0].length) } : null
    })
    .filter((x): x is { url: string; productId: string; suffix: string } => !!x)
  if (parsed.length === 0) return out

  const productIds = Array.from(new Set(parsed.map((p) => p.productId)))
  const [{ data: products }, { data: variants }] = await Promise.all([
    admin.from('products').select('id, name, stock_count').in('id', productIds),
    admin.from('product_variants').select('id, product_id, label, options, stock').in('product_id', productIds),
  ])
  const productById = new Map(
    ((products ?? []) as { id: string; name: string; stock_count: number | null }[]).map((p) => [p.id, p]),
  )
  const variantsByProduct = new Map<string, { id: string; label: string; options: Record<string, string>; stock: number | null }[]>()
  for (const v of (variants ?? []) as { id: string; product_id: string; label: string; options: Record<string, string> | null; stock: number | null }[]) {
    const list = variantsByProduct.get(v.product_id) ?? []
    list.push({ id: v.id, label: v.label, options: v.options ?? {}, stock: v.stock })
    variantsByProduct.set(v.product_id, list)
  }

  for (const p of parsed) {
    const product = productById.get(p.productId)
    if (!product) continue
    const vs = variantsByProduct.get(p.productId) ?? []
    if (vs.length === 0 || !p.suffix) {
      out.set(p.url, { productId: product.id, productName: product.name, variantId: null, variantLabel: null, stock: product.stock_count })
      continue
    }
    const match = vs.find((v) => optionsSuffix(v.options) === p.suffix)
    if (match) {
      out.set(p.url, {
        productId: product.id,
        productName: product.name,
        variantId: match.id,
        variantLabel: match.label,
        stock: product.stock_count == null ? null : match.stock ?? 0,
      })
    }
  }
  return out
}
