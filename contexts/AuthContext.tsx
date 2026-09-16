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
  chatHandle?: string
  /** Whether the user has verified their phone number. Drives things
   *  like the account WelcomeBanner's "Verify your phone" CTA — once
   *  true, that banner should stop showing regardless of dismiss state. */
  phoneVerified?: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  /** True until the initial session check completes AND there's no cached
   *  user to render optimistically. If a cached user exists from a
   *  previous session, we render it immediately and this is false right
   *  away — the background check below will correct it silently if it
   *  turns out to be stale. Gate skeleton UI on this, not on `user === null`. */
  loading: boolean
  /**
   * Kept as a no-arg function so existing call sites (Header's account CTA,
   * ChatPanel/messages pages' "Log in to chat" buttons) don't need to
   * change — real auth needs a credentials form, so this just routes to
   * /auth/login instead of instantly authenticating like the old mock did.
   */
  login: () => void
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null; sessionCreated: boolean }>
  logout: () => Promise<void>
  /** Sends a password-reset email. No dedicated /forgot-password route
   *  exists yet — callers show an inline "check your email" state instead. */
  resetPassword: (email: string) => Promise<{ error: string | null }>
  /** Sends an OTP to the given phone number via Supabase phone auth. */
  requestPhoneVerification: (phone: string) => Promise<{ error: string | null }>
  /** Verifies the OTP and flips phoneVerified to true on success. */
  verifyPhone: (phone: string, token: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// Cached copy of the derived AuthUser (not the Supabase session/tokens —
// those stay in Supabase's own storage). This is purely so the header can
// paint the right name/avatar on the very first render instead of flashing
// a logged-out state while getUser() round-trips.
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
    // Ignore quota errors / privacy modes that block localStorage — the
    // cache is a pure optimization, never a source of truth.
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
    chatHandle: meta.chat_handle,
    phoneVerified: Boolean(user.phone_confirmed_at),
  }
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const supabase = createClient()

  // Seed from cache so a returning user sees their name/avatar immediately,
  // before the real session check resolves. readCachedUser() returns null
  // during SSR (no window), so this doesn't cause a hydration mismatch —
  // both server and first client render start from null, then the client
  // synchronously upgrades to the cached value on mount.
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const applyUser = (next: AuthUser | null) => {
    setUser(next)
    writeCachedUser(next)
  }

  useEffect(() => {
    // Hydrate from cache first (client-only), so there's no flash of a
    // "guest" state on repeat visits while the network check is in flight.
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
    // Supabase only returns a session immediately when email confirmation
    // is disabled in the project's auth settings. If confirmation is
    // required, data.session is null and the caller should show a
    // "check your email" state instead of assuming the user is logged in.
    return { error: error?.message ?? null, sessionCreated: !!data.session }
  }

  const logout = async () => {
    // Clear the local view immediately so the header doesn't sit on the
    // old name/avatar while signOut() round-trips.
    applyUser(null)
    await supabase.auth.signOut()
    router.push("/")
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined" ? `${window.location.origin}/account/profile` : undefined,
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
      // Keep profiles.phone/phone_verified in sync — this is what the
      // WhatsApp chat panel and anything else outside Supabase Auth
      // itself (which only knows about auth.users.phone_confirmed_at)
      // actually reads. Best-effort: if this write fails, auth-level
      // verification still succeeded and phoneVerified above is still
      // correct, so we don't surface this as an error to the customer —
      // just log it so it doesn't disappear silently.
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