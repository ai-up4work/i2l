"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

interface AuthUser {
  name: string
  email: string
  imageUrl?: string
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  login: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// Swap this out for a real session once auth is wired up.
const MOCK_USER: AuthUser = { name: "Safnas Kaldeen", email: "safnas@gmail.com", imageUrl: "/default-avatar.png" }

interface AuthProviderProps {
  children: ReactNode
  /** Start logged out so you can preview the "Sign in" state on load. */
  initiallySignedIn?: boolean
}

export default function AuthProvider({ children, initiallySignedIn = true }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(initiallySignedIn ? MOCK_USER : null)

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login: () => setUser(MOCK_USER),
        logout: () => setUser(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}