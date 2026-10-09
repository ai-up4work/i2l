// Shown when there's no store (or no product) at the address.
import StoreUnavailable from '@/components/stores/StoreUnavailable'

export default function StoreNotFound() {
  return <StoreUnavailable kind="missing" />
}
