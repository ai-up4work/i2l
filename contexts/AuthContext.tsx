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
  // Sourced from profiles.chat_handle, not auth user_metadata — see
  // hydrateAuthUser below. null means "no handle set yet" (distinct from
  // undefined/not-yet-loaded, which callers won't see since we always
  // resolve this before calling applyUser).
  chatHandle: string | null
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
  // Re-reads just chat_handle from profiles and merges it into the current
  // user. Lets other parts of the app (e.g. the profile page, right after a
  // successful handle update) refresh without waiting for a full auth
  // round trip, a remount, or a token refresh to pick it up.
  refreshChatHandle: () => Promise<void>
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

// Everything we can derive from the Supabase auth user alone, before the
// profiles.chat_handle lookup. Kept separate from AuthUser so it's obvious
// chatHandle always comes from a second source.
function toBaseAuthUser(user: User | null): Omit<AuthUser, "chatHandle"> | null {
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
// user hasn't changed, and hydrateAuthUser() builds a brand-new object each
// time — without this check, every consumer of `user` (and any effect
// that depends on it) would re-run on every tab-focus event.
function sameAuthUser(a: AuthUser | null, b: AuthUser | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.email === b.email &&
    a.imageUrl === b.imageUrl &&
    a.phoneVerified === b.phoneVerified &&
    a.chatHandle === b.chatHandle
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

  // chat_handle lives only in profiles.chat_handle (not in auth
  // user_metadata), so building a full AuthUser always costs one extra
  // round trip alongside whatever auth call produced the raw User.
  const fetchChatHandle = async (userId: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("chat_handle")
      .eq("id", userId)
      .maybeSingle()
    if (error) {
      console.error("[auth] failed to load chat_handle", error)
      return null
    }
    return data?.chat_handle ?? null
  }

  // The single place a raw Supabase auth User becomes a full AuthUser.
  // Every code path that produces a user (initial load, auth state change,
  // sign up, phone verify) goes through this so chat_handle is never
  // missing on the object consumers read.
  const hydrateAuthUser = async (authUser: User | null): Promise<AuthUser | null> => {
    const base = toBaseAuthUser(authUser)
    if (!base) return null
    const chatHandle = await fetchChatHandle(base.id)
    return { ...base, chatHandle }
  }

  useEffect(() => {
    const cached = readCachedUser()
    if (cached) {
      setUser(cached)
      setLoading(false)
    }

    let cancelled = false

    supabase.auth.getUser().then(async ({ data }) => {
      const next = await hydrateAuthUser(data.user)
      if (cancelled) return
      applyUser(next)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      hydrateAuthUser(session?.user ?? null).then((next) => {
        if (cancelled) return
        applyUser(next)
        setLoading(false)
      })
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
    if (!error && data.session) applyUser(await hydrateAuthUser(data.session.user))
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
      applyUser(await hydrateAuthUser(data.user))
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

  const refreshChatHandle = async () => {
    if (!user) return
    const chatHandle = await fetchChatHandle(user.id)
    applyUser({ ...user, chatHandle })
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
        refreshChatHandle,
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