// lib/types/collection.ts

export type CollectionStatus = "draft" | "published"

export type CollectionItem = {
  id: string
  productId: string
  productName: string
  sellerName: string
  image: string
  price: number
  position: number
}

export type Collection = {
  id: string
  name: string
  slug: string
  description: string
  status: CollectionStatus
  items: CollectionItem[]
  updatedAt: string
}

// A product available to add into a collection — cross-seller, sourced
// from either feed-integrated or manual-mode sellers. Collections don't
// care which; that distinction lives on the Sellers/Catalogues side.
export type PickableProduct = {
  id: string
  name: string
  sellerName: string
  image: string
  price: number
}