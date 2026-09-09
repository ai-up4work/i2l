import type { ReactNode } from 'react'

// TODO: role/auth guard for /admin root (auth + role fetch)
export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
