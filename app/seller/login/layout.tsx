// app/seller/login/layout.tsx
// The login page itself is a client component, so its metadata lives here.
import { noIndexMetadata } from '@/lib/seo'

export const metadata = noIndexMetadata('Seller login')

export default function SellerLoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
