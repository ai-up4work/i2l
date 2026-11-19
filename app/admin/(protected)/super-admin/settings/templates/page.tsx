// app/admin/(protected)/super-admin/settings/templates/page.tsx
//
// Message templates: the wording of every customer message the admin side
// drafts (price quotes, payment receipts, order updates…). Edit it here and
// every "Send message" box starts from your wording; staff can still change
// a message before sending.
//
// - Wording is fetched once when the admin side loads (MessageTemplatesContext)
//   and kept in memory, so drafting a message never waits on the network.
// - {placeholders} are filled in per order/request; click a chip to insert one.
// - The preview uses sample values through the same renderer the real
//   messages use.
// - Only changed wording is stored; "Reset to default" removes the change.
//
// Defaults and placeholder lists: lib/chat/messageTemplateDefs.ts.
'use client'

import { useMemo, useRef, useState } from 'react'
import { FileText, RotateCcw } from 'lucide-react'
import {
  btnPrimary,
  btnSecondary,
  card,
  FullPageLoading,
  IconTile,
  Notice,
  PageHeader,
  PageShell,
  StatusPill,
} from '@/components/admin/catalogue/ui'
import { useMessageTemplates } from '@/contexts/MessageTemplatesContext'
import {
  fillTemplate,
  MAX_TEMPLATE_LENGTH,
  TEMPLATE_DEFS,
  unknownPlaceholders,
  type TemplateKey,
} from '@/lib/chat/messageTemplateDefs'

function when(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function MessageTemplatesPage() {
  const { overrides, canEdit, needsMigration, ready, updatedAt, updatedBy, applySaved } = useMessageTemplates()
  const [selected, setSelected] = useState<TemplateKey>(TEMPLATE_DEFS[0].key)
  // Unsaved edits per template, so switching between them doesn't lose work.
  const [drafts, setDrafts] = useState<Partial<Record<TemplateKey, string>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const def = TEMPLATE_DEFS.find((d) => d.key === selected)!
  const current = overrides[selected] ?? def.defaultBody
  const draft = drafts[selected] ?? current
  const dirty = draft !== current
  const isCustom = selected in overrides
  const unknown = useMemo(() => unknownPlaceholders(selected, draft), [selected, draft])
  const tooLong = draft.length > MAX_TEMPLATE_LENGTH
  const empty = !draft.trim()

  const preview = useMemo(
    () => fillTemplate(draft, Object.fromEntries(def.placeholders.map((p) => [p.name, p.example]))),
    [draft, def],
  )

  if (!ready) return <FullPageLoading label="Loading templates…" />

  function setDraft(v: string) {
    setDrafts((d) => ({ ...d, [selected]: v }))
    setError(null)
    setSaved(null)
  }

  function insert(name: string) {
    const el = areaRef.current
    const token = `{${name}}`
    if (!el) return setDraft(draft + token)
    const start = el.selectionStart ?? draft.length
    const end = el.selectionEnd ?? draft.length
    const next = draft.slice(0, start) + token + draft.slice(end)
    setDraft(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  async function send(body: string | null) {
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      const res = await fetch('/api/admin/message-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: selected, body }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; updatedAt?: string; updatedBy?: string }
      if (!res.ok) {
        setError(json.error ?? 'Could not save. Please try again.')
        return
      }
      // A body identical to the built-in wording is stored as "no override".
      applySaved(selected, body, { updatedAt: json.updatedAt, updatedBy: json.updatedBy })
      setDrafts((d) => {
        const c = { ...d }
        delete c[selected]
        return c
      })
      setSaved(body === null ? 'Back to the built-in wording.' : 'Saved. New messages use this wording straight away.')
    } finally {
      setBusy(false)
    }
  }

  const disabledEdit = !canEdit || busy

  return (
    <PageShell>
      <PageHeader
        leading={
          <IconTile>
            <FileText size={22} strokeWidth={1.75} />
          </IconTile>
        }
        title="Message templates"
        meta="The wording customers get when you quote, confirm, update or deliver. Staff can still edit a message before sending it."
      />

      {needsMigration && (
        <div className="mt-6">
          <Notice tone="gold">
            Saving needs one database update first: run <code>data/wishdrop-message-templates.sql</code> in Supabase. Until then the built-in wording is used.
          </Notice>
        </div>
      )}
      {!canEdit && (
        <div className="mt-6">
          <Notice tone="gold">Only a Super Admin can change these. You can read them here.</Notice>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <nav aria-label="Templates" className={`${card} h-fit p-2`}>
          <ul className="space-y-0.5">
            {TEMPLATE_DEFS.map((d) => {
              const active = d.key === selected
              const custom = d.key in overrides
              const edited = drafts[d.key] !== undefined && drafts[d.key] !== (overrides[d.key] ?? d.defaultBody)
              return (
                <li key={d.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(d.key)
                      setError(null)
                      setSaved(null)
                    }}
                    aria-current={active ? 'true' : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                      active ? 'bg-teal-deep text-parchment' : 'text-ink/75 hover:bg-ink/[0.04]'
                    }`}
                  >
                    <span className="truncate">{d.label}</span>
                    {(edited || custom) && (
                      <span
                        className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          active ? 'bg-parchment/20 text-parchment' : edited ? 'bg-gold/25 text-ink' : 'bg-teal/10 text-teal-deep'
                        }`}
                      >
                        {edited ? 'Unsaved' : 'Custom'}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <section className={`${card} p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-ink">{def.label}</h2>
              <p className="mt-0.5 text-sm text-ink/55">{def.when}</p>
            </div>
            {isCustom ? <StatusPill tone="live">Custom wording</StatusPill> : <StatusPill tone="draft">Built-in wording</StatusPill>}
          </div>

          <label htmlFor="template-body" className="mt-5 block text-xs font-semibold text-ink/55">
            Message
          </label>
          <textarea
            id="template-body"
            ref={areaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            readOnly={!canEdit}
            rows={7}
            className="mt-1.5 w-full resize-y rounded-xl border border-ink/15 bg-card px-3.5 py-3 text-sm leading-relaxed text-ink outline-none transition-colors focus:border-teal focus:ring-2 focus:ring-teal/20"
          />
          <div className="mt-1 flex justify-between text-xs text-ink/45">
            <span>{unknown.length === 0 && !empty ? 'Looks good.' : ''}</span>
            <span className={tooLong ? 'font-semibold text-red-600' : ''}>
              {draft.length}/{MAX_TEMPLATE_LENGTH}
            </span>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold text-ink/55">Fill-ins — click to add at the cursor</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {def.placeholders.map((p) => (
                <li key={p.name}>
                  <button
                    type="button"
                    disabled={disabledEdit}
                    onClick={() => insert(p.name)}
                    title={`${p.help} — e.g. ${p.example.trim()}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-card px-3 py-1.5 text-xs font-semibold text-ink/75 transition-colors hover:border-teal hover:text-teal-deep disabled:opacity-50"
                  >
                    <code className="font-mono">{`{${p.name}}`}</code>
                    <span className="font-normal text-ink/50">{p.help.split(',')[0]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {unknown.length > 0 && (
            <div className="mt-4">
              <Notice tone="red">
                {unknown.map((u) => `{${u}}`).join(', ')} isn’t available here. Use only {def.placeholders.map((p) => `{${p.name}}`).join(', ')}.
              </Notice>
            </div>
          )}

          <div className="mt-5">
            <p className="text-xs font-semibold text-ink/55">Preview with sample details</p>
            <div className="mt-2 max-w-xl whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-teal-deep/[0.08] px-4 py-3 text-sm leading-relaxed text-ink">
              {empty ? <span className="text-ink/40">Nothing to show yet.</span> : preview}
            </div>
          </div>

          {error && (
            <div className="mt-4" role="alert">
              <Notice tone="red">{error}</Notice>
            </div>
          )}
          {saved && (
            <div className="mt-4" role="status">
              <Notice tone="teal">{saved}</Notice>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={disabledEdit || !dirty || empty || tooLong || unknown.length > 0}
              onClick={() => void send(draft.trim() === def.defaultBody ? null : draft)}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className={btnSecondary} disabled={!dirty || busy} onClick={() => setDraft(current)}>
              Discard changes
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={disabledEdit || (!isCustom && draft === def.defaultBody)}
              onClick={() => (isCustom ? void send(null) : setDraft(def.defaultBody))}
            >
              <RotateCcw size={14} /> Reset to default
            </button>
            {isCustom && updatedAt[selected] && (
              <span className="ml-auto text-xs text-ink/45">
                Last saved {when(updatedAt[selected])}
                {updatedBy[selected] ? ` by ${updatedBy[selected]}` : ''}
              </span>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  )
}
