"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

interface AuthUser {
  name: string
  email: string
  imageUrl?: string
  chatHandle?: string
  /** Whether the user has verified their phone number. Drives things
   *  like the account WelcomeBanner's "Verify your phone" CTA — once
   *  true, that banner should stop showing regardless of dismiss state. */
  phoneVerified?: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  login: () => void
  logout: () => void
  /** Mock action for now — flips phoneVerified to true. Swap for a real
   *  API call once phone verification is actually wired up. */
  verifyPhone: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// Swap this out for a real session once auth is wired up.
const MOCK_USER: AuthUser = {
  name: "Safnas Kaldeen",
  email: "safnas@gmail.com",
  imageUrl: "/default-avatar.png",
  chatHandle: "@safnas",
  phoneVerified: false,
}

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
        verifyPhone: () => setUser((prev) => (prev ? { ...prev, phoneVerified: true } : prev)),
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