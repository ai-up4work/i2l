// app/seller/(dashboard)/SellerSignOutButton.tsx -- imported by ../layout.tsx via relative path
'use client'

import { useAuth } from '@/contexts/AuthContext'

export default function SellerSignOutButton() {
  const { logout } = useAuth()
  return (
    <button type="button" onClick={logout} className="hover:text-ink">
      Log out
    </button>
  )
}