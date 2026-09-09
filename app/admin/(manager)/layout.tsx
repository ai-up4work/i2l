import type { ReactNode } from 'react'

// TODO: role/auth guard for Manager
export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}