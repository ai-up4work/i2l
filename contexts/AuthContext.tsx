"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"

interface AuthUser {
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
  /** True until the initial session check completes. Gate real renders on
   *  this instead of treating `user === null` as "definitely logged out". */
  loading: boolean
  /**
   * Kept as a no-arg function so existing call sites (Header's "Sign in"
   * pill, ChatPanel/messages pages' "Log in to chat" buttons) don't need to
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
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(toAuthUser(data.user))
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAuthUser(session?.user ?? null))
    })

    return () => subscription.unsubscribe()
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
    if (!error && data.session) setUser(toAuthUser(data.session.user))
    // Supabase only returns a session immediately when email confirmation
    // is disabled in the project's auth settings. If confirmation is
    // required, data.session is null and the caller should show a
    // "check your email" state instead of assuming the user is logged in.
    return { error: error?.message ?? null, sessionCreated: !!data.session }
  }

  const logout = async () => {
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
      setUser(toAuthUser(data.user))
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
