// app/api/seller/lib.ts
//
// Kept for older imports. The product rules now live in
// lib/catalogue-products.ts, shared by the seller portal and staff.

export {
  MAX_IMAGES,
  MAX_VIDEOS,
  PRODUCT_EDIT_COLUMNS as SELLER_PRODUCT_COLUMNS,
  friendlyDbError,
  listedPrice as sellerPrice,
  cleanProductInput as cleanSellerInput,
  type ProductInput as SellerProductInput,
} from '@/lib/catalogue-products'
