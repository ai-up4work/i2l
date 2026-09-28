// hooks/useSellerPendingOrderCounts.ts
"use client"

import { useCallback, useEffect, useState } from "react"

export type PendingCountsStatus = "loading" | "ready" | "error"

/**
 * Fetches pending-order counts per seller in the background. The sellers
 * list renders immediately; counts fill in when this resolves.
 */
export function useSellerPendingOrderCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [status, setStatus] = useState<PendingCountsStatus>("loading")
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setStatus((s) => (s === "ready" ? s : "loading")) // keep old numbers visible on refresh
    setError(null)
    try {
      const res = await fetch("/api/admin/sellers/pending-orders", { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Failed to load pending orders")
      setCounts(body.counts ?? {})
      setStatus("ready")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending orders")
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { counts, status, error, refresh: load }
}