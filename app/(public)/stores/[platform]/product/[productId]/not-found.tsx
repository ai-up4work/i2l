// Shown when the product doesn't exist (or isn't available) in this store.
import StoreUnavailable from '@/components/stores/StoreUnavailable'

export default function ProductNotFound() {
  return <StoreUnavailable kind="product" />
}
