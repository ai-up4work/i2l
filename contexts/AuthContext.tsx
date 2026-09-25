"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { clearServiceWorkerCaches } from "@/components/pwa/ServiceWorkerRegister"

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
  /** Sends an OTP to the given phone number over WhatsApp (this app's own
   *  Cloud API integration, not Supabase's phone auth — see
   *  requestPhoneVerification's own implementation comment for why). */
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
    // Drop any pages/images the service worker cached during this session
    // (see public/sw.js) so a shared device doesn't keep them around.
    clearServiceWorkerCaches()
    router.push("/")
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined" ? `${window.location.origin}/account/profile` : undefined,
    })
    return { error: error?.message ?? null }
  }

  // WhatsApp-delivered OTP, not Supabase Auth's own (SMS-only)
  // phone_change flow — see app/api/account/whatsapp/send-code and
  // verify-code's own header comments for exactly why: the installed
  // @supabase/supabase-js's updateUser() has no `channel` option at all
  // for phone changes, only signInWithOtp() does, and that's a
  // different (sign-in) flow, not "verify and attach to my existing
  // account." Function signatures kept identical to the old
  // updateUser/verifyOtp-based versions so nothing calling these needs
  // to change.
  const requestPhoneVerification = async (phone: string) => {
    try {
      const res = await fetch('/api/account/whatsapp/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return { error: body.error ?? 'Could not send a verification code. Please try again.' }
      return { error: null }
    } catch {
      return { error: 'Could not send a verification code. Please try again.' }
    }
  }

  // `phone` is unused in the body now — verify-code already knows the
  // pending number from the profiles row send-code wrote it to, and
  // trusting a second copy from the client here would just be another
  // thing that could disagree with it. Kept in the signature so every
  // existing call site (ProfilePage's handleVerifyOtp) doesn't need to
  // change.
  const verifyPhone = async (phone: string, token: string) => {
    try {
      const res = await fetch('/api/account/whatsapp/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: token }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return { error: body.error ?? 'Could not verify that code. Please try again.' }
      // Refresh the session's own user object so phoneVerified (derived
      // from auth.users.phone_confirmed_at — see toAuthUser above)
      // reflects the service-role sync verify-code just performed,
      // same as the old flow did after its own verifyOtp call.
      const { data } = await supabase.auth.getUser()
      applyUser(toAuthUser(data.user))
      return { error: null }
    } catch {
      return { error: 'Could not verify that code. Please try again.' }
    }
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