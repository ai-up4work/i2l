// app/api/store-product/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { fetchStoreProduct } from '@/lib/store-providers/product'
import { getDualDeliveryPricing } from '@/lib/pricing'

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get('platform')
  const productId = req.nextUrl.searchParams.get('productId')

  if (!platform || !productId) {
    return NextResponse.json({ error: 'Missing platform or productId' }, { status: 400 })
  }

  try {
    const product = await fetchStoreProduct(platform, productId)
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const dual = getDualDeliveryPricing(product)

    return NextResponse.json({
      title: product.name,
      image: product.image,
      currencyCode: product.currency,
      price: dual.economy.formattedPrice,
      inStock: product.inStock,
    })
  } catch (err) {
    console.error(`[api/store-product] ${platform}/${productId}`, err)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}