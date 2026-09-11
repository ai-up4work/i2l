import { ADMIN_DISCOUNTS } from '@/data/discounts/data'
import DealCoupon from '@/components/admin/DealCoupon'

export default function DiscountPage() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ADMIN_DISCOUNTS.map((discount) => (
        <DealCoupon key={discount.id} discount={discount} />
      ))}
    </div>
  )
}