// app/auth/signup/page.tsx
import AccountAccess from '@/components/auth/AccountAccess'
import { noIndexMetadata } from '@/lib/seo'

export const metadata = noIndexMetadata('Create your account', 'Create a WishDrop account to shop Indian stores with delivery to Sri Lanka.')

export default function SignupPage() {
  return <AccountAccess initialMode="register" />
}
