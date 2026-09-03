// lib/mock-assets.ts
//
// Shared placeholder-image pool + picker. Used by both store mock data
// (data/stores/data.ts → mockProducts) and unrelated dashboard mock data
// (components/dashboard/data.ts → initialRequests, biddingRequests).
// Lives on its own so neither of those two data files needs to import
// from the other just to grab a random hero image.

export const productImage = [
  '/products/hero-product-1.png',
  '/products/hero-product-2.png',
  '/products/hero-product-3.png',
  '/products/hero-product-4.png',
  '/products/hero-product-5.png',
]

export const random = <T,>(array: T[]): T => {
  return array[Math.floor(Math.random() * array.length)]
}