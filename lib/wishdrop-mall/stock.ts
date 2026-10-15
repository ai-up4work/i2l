// lib/wishdrop-mall/stock.ts
//
// SERVER-ONLY. Wishdrop Mall stock check (before an order) and deduction
// (after it). Shared by /api/mall/stock/check, /api/mall/orders/[id]/stock
// and the server checkout (lib/checkout/server.ts).

import 'server-only'
import type { AdminClient } from './admin'
import { isMallLineUrl, resolveMallLines } from './order-lines'

export type StockProblem = { url: string; name: string; available: number }

export async function checkMallStock(admin: AdminClient, items: { url: string; qty: number }[]): Promise<StockProblem[]> {
  const clean = items.filter((i) => isMallLineUrl(i.url) && Number.isFinite(i.qty) && i.qty > 0).slice(0, 100)
  if (clean.length === 0) return []

  const resolved = await resolveMallLines(admin, clean.map((i) => i.url))
  const wanted = new Map<string, number>()
  for (const i of clean) wanted.set(i.url, (wanted.get(i.url) ?? 0) + i.qty)

  const problems: StockProblem[] = []
  for (const [url, qty] of wanted) {
    const line = resolved.get(url)
    if (!line) {
      problems.push({ url, name: 'An item in your cart', available: 0 })
      continue
    }
    if (line.stock == null) continue // not tracked
    if (qty > line.stock) {
      const name = line.variantLabel ? `${line.productName} (${line.variantLabel})` : line.productName
      problems.push({ url, name, available: Math.max(line.stock, 0) })
    }
  }
  return problems
}

export async function deductMallStockForOrder(
  admin: AdminClient,
  orderId: string,
): Promise<{ applied: number; shortages: { productId: string; variantId: string | null; shortage: number }[] }> {
  const { data: items, error } = await admin.from('order_items').select('id, store_url, quantity').eq('order_id', orderId)
  if (error) throw error

  const mallItems = ((items ?? []) as { id: string; store_url: string | null; quantity: number }[]).filter((i) =>
    isMallLineUrl(i.store_url),
  )
  if (mallItems.length === 0) return { applied: 0, shortages: [] }

  const resolved = await resolveMallLines(admin, mallItems.map((i) => i.store_url as string))
  let applied = 0
  const shortages: { productId: string; variantId: string | null; shortage: number }[] = []

  for (const item of mallItems) {
    const line = resolved.get(item.store_url as string)
    if (!line) continue
    const { data, error: rpcError } = await admin.rpc('mall_deduct_stock', {
      p_product_id: line.productId,
      p_variant_id: line.variantId,
      p_quantity: item.quantity,
      p_order_id: orderId,
      p_order_item_id: item.id,
    })
    if (rpcError) {
      console.error('[mall stock] deduct failed', item.id, rpcError.message)
      continue
    }
    const row = (data ?? [])[0]
    if (row?.applied) applied++
    if (row?.shortage) shortages.push({ productId: line.productId, variantId: line.variantId, shortage: row.shortage })
  }
  return { applied, shortages }
}
