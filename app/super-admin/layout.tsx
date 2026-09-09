import type { ReactNode } from 'react'

// TODO: role/auth guard for /super-admin root (auth guard)
export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}