"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"

export interface AuthUser {
  id: string
  name: string
  email: string
  imageUrl?: string
  phoneVerified?: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  loading: boolean
  login: () => void
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null; sessionCreated: boolean }>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  requestPhoneVerification: (phone: string) => Promise<{ error: string | null }>
  verifyPhone: (phone: string, token: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const CACHE_KEY = "wishdrop:auth-user-cache:v1"

function readCachedUser(): AuthUser | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

function writeCachedUser(user: AuthUser | null) {
  if (typeof window === "undefined") return
  try {
    if (user) {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(user))
    } else {
      window.localStorage.removeItem(CACHE_KEY)
    }
  } catch {
    // Ignore quota errors / privacy modes that block localStorage.
  }
}

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null
  const meta = user.user_metadata ?? {}
  return {
    id: user.id,
    name: meta.full_name ?? user.email?.split("@")[0] ?? "Customer",
    email: user.email ?? "",
    imageUrl: meta.avatar_url,
    phoneVerified: Boolean(user.phone_confirmed_at),
  }
}

// Field-by-field comparison of the derived AuthUser. Supabase re-fires
// onAuthStateChange on tab focus / token refresh even when the underlying
// user hasn't changed, and toAuthUser() builds a brand-new object each
// time — without this check, every consumer of `user` (and any effect
// that depends on it) would re-run on every tab-focus event.
//
// chat_handle is intentionally NOT part of AuthUser anymore — profiles.
// chat_handle is the single source of truth, and ChatContext reads it
// directly from the profiles table instead of trusting auth metadata.
function sameAuthUser(a: AuthUser | null, b: AuthUser | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.email === b.email &&
    a.imageUrl === b.imageUrl &&
    a.phoneVerified === b.phoneVerified
  )
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Only replaces the `user` reference when something actually changed,
  // so components/effects keyed on `user` (object identity) don't fire
  // on routine session refreshes. Always writes the cache though, since
  // that's cheap and keeps it fresh regardless.
  const applyUser = (next: AuthUser | null) => {
    setUser((prev) => (sameAuthUser(prev, next) ? prev : next))
    writeCachedUser(next)
  }

  useEffect(() => {
    const cached = readCachedUser()
    if (cached) {
      setUser(cached)
      setLoading(false)
    }

    let cancelled = false

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      applyUser(toAuthUser(data.user))
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(toAuthUser(session?.user ?? null))
      setLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (!error && data.session) applyUser(toAuthUser(data.session.user))
    return { error: error?.message ?? null, sessionCreated: !!data.session }
  }

  const logout = async () => {
    applyUser(null)
    await supabase.auth.signOut()
    router.push("/")
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined" ? `${window.location.origin}/account/settings` : undefined,
    })
    return { error: error?.message ?? null }
  }

  const requestPhoneVerification = async (phone: string) => {
    const { error } = await supabase.auth.updateUser({ phone })
    return { error: error?.message ?? null }
  }

  const verifyPhone = async (phone: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: "phone_change" })
    if (!error) {
      const { data } = await supabase.auth.getUser()
      applyUser(toAuthUser(data.user))
      if (data.user) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ phone, phone_verified: true })
          .eq("id", data.user.id)
        if (profileError) console.error("[verifyPhone] profiles sync failed", profileError)
      }
    }
    return { error: error?.message ?? null }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login: () => router.push(`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`),
        signIn,
        signUp,
        logout,
        resetPassword,
        requestPhoneVerification,
        verifyPhone,
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