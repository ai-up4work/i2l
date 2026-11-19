// contexts/MessageTemplatesContext.tsx
//
// Fetches the saved customer-message wording ONCE when the admin side
// mounts and installs it in lib/chat/messageTemplateDefs.ts, so every
// "draft a message" button reads it from memory — no request at send time.
// Until the fetch lands (or if it fails) the built-in wording is used, so
// sending never waits on this.
//
// The last good copy is also kept in sessionStorage so a page reload
// starts with the right wording immediately.
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getTemplateOverrides, setTemplateOverrides, type TemplateKey, type TemplateOverrides } from '@/lib/chat/messageTemplateDefs'

type Ctx = {
  overrides: TemplateOverrides
  canEdit: boolean
  needsMigration: boolean
  updatedAt: Record<string, string>
  updatedBy: Record<string, string | null>
  ready: boolean
  refresh: () => Promise<void>
  /** Called by the editor after a successful save/reset so this tab updates at once. */
  applySaved: (key: TemplateKey, body: string | null, meta?: { updatedAt?: string; updatedBy?: string | null }) => void
}

const MessageTemplatesContext = createContext<Ctx | null>(null)
const STORAGE_KEY = 'wishdrop.messageTemplates.v1'

export function MessageTemplatesProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<TemplateOverrides>(() => getTemplateOverrides())
  const [canEdit, setCanEdit] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Record<string, string>>({})
  const [updatedBy, setUpdatedBy] = useState<Record<string, string | null>>({})
  const [ready, setReady] = useState(false)

  const install = useCallback((next: TemplateOverrides) => {
    setTemplateOverrides(next)
    setOverrides(getTemplateOverrides())
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(getTemplateOverrides()))
    } catch {
      /* storage unavailable — fine */
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/message-templates', { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as {
        overrides: TemplateOverrides
        updatedAt: Record<string, string>
        updatedBy: Record<string, string | null>
        needsMigration: boolean
        canEdit: boolean
      }
      install(json.overrides ?? {})
      setUpdatedAt(json.updatedAt ?? {})
      setUpdatedBy(json.updatedBy ?? {})
      setNeedsMigration(!!json.needsMigration)
      setCanEdit(!!json.canEdit)
    } catch {
      /* keep whatever we have; built-in wording still works */
    } finally {
      setReady(true)
    }
  }, [install])

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(STORAGE_KEY)
      if (cached) install(JSON.parse(cached))
    } catch {
      /* ignore */
    }
    void refresh()
  }, [install, refresh])

  const applySaved = useCallback<Ctx['applySaved']>(
    (key, body, meta) => {
      const next = { ...getTemplateOverrides() }
      if (body === null) delete next[key]
      else next[key] = body
      install(next)
      setUpdatedAt((m) => {
        const c = { ...m }
        if (body === null) delete c[key]
        else if (meta?.updatedAt) c[key] = meta.updatedAt
        return c
      })
      setUpdatedBy((m) => {
        const c = { ...m }
        if (body === null) delete c[key]
        else c[key] = meta?.updatedBy ?? null
        return c
      })
    },
    [install],
  )

  const value = useMemo(
    () => ({ overrides, canEdit, needsMigration, updatedAt, updatedBy, ready, refresh, applySaved }),
    [overrides, canEdit, needsMigration, updatedAt, updatedBy, ready, refresh, applySaved],
  )
  return <MessageTemplatesContext.Provider value={value}>{children}</MessageTemplatesContext.Provider>
}

export function useMessageTemplates(): Ctx {
  const ctx = useContext(MessageTemplatesContext)
  if (!ctx) throw new Error('useMessageTemplates must be used inside MessageTemplatesProvider')
  return ctx
}
