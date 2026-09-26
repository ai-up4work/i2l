// app/auth/login/page.tsx
import AccountAccess from '@/components/auth/AccountAccess'
import { noIndexMetadata } from '@/lib/seo'

export const metadata = noIndexMetadata('Log in', 'Log in to your Wishdrop account to track requests, orders, and deliveries.')

export default function LoginPage() {
  return <AccountAccess initialMode="login" />
}
