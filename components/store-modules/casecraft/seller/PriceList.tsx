// components/store-modules/casecraft/seller/PriceList.tsx
//
// Case Craft seller portal → Prices & models. The seller sets their price
// per case type and phone size, which phones are on sale, delivery and
// payment. The margin card shows only in staff view (a Super Admin /
// Manager who opened the portal with their own login).
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { CASE_TYPES, modelKey, SIZE_CLASSES, type CaseTypeId } from '@/lib/store-modules/casecraft/catalog'
import { formatRs, shopperPrice, type CaseCraftSettings } from '@/lib/store-modules/casecraft/settings'
import ModelChecklist from './ModelChecklist'
import { field, label, Notice, Panel, SellerPageTitle, Toggle } from './ui'

type Margin = { percent: number; updatedAt: string | null; updatedBy: string | null } | null

export default function PriceList() {
  const [saved, setSaved] = useState<CaseCraftSettings | null>(null)
  const [draft, setDraft] = useState<CaseCraftSettings | null>(null)
  const [staff, setStaff] = useState(false)
  const [margin, setMargin] = useState<Margin>(null)
  const [marginDraft, setMarginDraft] = useState('')
  const [needsMigration, setNeedsMigration] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/seller/casecraft/settings')
      .then((r) => r.json())
      .then((b) => {
        setSaved(b.settings)
        setDraft(b.settings)
        setStaff(Boolean(b.staff))
        setMargin(b.margin ?? null)
        setMarginDraft(b.margin ? String(b.margin.percent) : '')
        setNeedsMigration(Boolean(b.needsMigration))
      })
      .catch(() => setMsg({ ok: false, text: 'Could not load your prices.' }))
  }, [])

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft])
  const marginDirty = staff && margin !== null && Number(marginDraft) !== margin.percent && marginDraft !== ''

  if (!draft) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 font-body text-sm text-ink/50">
        <Loader2 size={16} className="animate-spin" aria-hidden /> Loading…
      </p>
    )
  }

  const update = (fn: (s: CaseCraftSettings) => CaseCraftSettings) => setDraft((cur) => (cur ? fn(structuredClone(cur)) : cur))

  async function save(includeMargin: boolean) {
    setBusy(true)
    setMsg(null)
    const res = await fetch('/api/seller/casecraft/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(dirty ? { settings: draft } : {}), ...(includeMargin ? { marginPercent: Number(marginDraft) } : {}) }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg({ ok: false, text: body.error ?? 'Could not save.' })
    setSaved(body.settings)
    setDraft(body.settings)
    if (body.margin) {
      setMargin(body.margin)
      setMarginDraft(String(body.margin.percent))
    }
    setMsg({ ok: true, text: 'Saved. The store shows the new prices now.' })
  }

  const exampleSeller = draft.caseTypes['tough-cases'].prices.standard

  return (
    <div className="flex flex-col gap-5 pb-24">
      <SellerPageTitle title="Prices & models" body="Your price for each case and phone size, the phones you print for, delivery and payment." />
      {needsMigration && <Notice>The database needs an update first: ask Wishdrop to run data/wishdrop-casecraft.sql. Until then nothing can be saved.</Notice>}

      {staff && margin && (
        <Panel tone="staff" title="Wishdrop margin" body="Staff only. Added on top of every price the seller sets. The seller doesn't see this.">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-32">
              <span className={label}>Margin %</span>
              <input className={field} inputMode="decimal" value={marginDraft} onChange={(e) => setMarginDraft(e.target.value.replace(/[^\d.]/g, ''))} />
            </div>
            <p className="font-body text-sm text-ink/65">
              Seller {formatRs(exampleSeller)} → shopper pays <span className="font-semibold text-ink">{formatRs(shopperPrice(exampleSeller, Number(marginDraft) || 0))}</span>
            </p>
            <button type="button" onClick={() => save(true)} disabled={!marginDirty || busy} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-indigo px-4 py-2 font-body text-sm font-semibold text-parchment disabled:opacity-40">
              <ShieldCheck size={14} aria-hidden /> Save margin
            </button>
          </div>
          {margin.updatedAt && (
            <p className="mt-2 font-body text-xs text-ink/50">
              Last changed {new Date(margin.updatedAt).toLocaleString('en-LK')} by {margin.updatedBy ?? 'staff'}.
            </p>
          )}
        </Panel>
      )}

      {CASE_TYPES.map((t) => {
        const cfg = draft.caseTypes[t.id]
        const onSale = new Set(t.models.filter((m) => !draft.disabledModels.includes(modelKey(t.id, m.label))).map((m) => m.label))
        return (
          <Panel key={t.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">
                  {t.label} <span className="font-body text-xs font-semibold text-ink/50">{t.series}</span>
                </h2>
                <p className="mt-0.5 font-body text-xs text-ink/55">{t.description}</p>
              </div>
              <div className="flex flex-none items-center gap-2">
                <span className="font-body text-xs text-ink/55">{cfg.enabled ? 'On sale' : 'Off'}</span>
                <Toggle checked={cfg.enabled} onChange={(v) => update((s) => ((s.caseTypes[t.id].enabled = v), s))} label={`${t.label} on sale`} />
              </div>
            </div>

            {cfg.enabled && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {SIZE_CLASSES.map((c) => (
                    <div key={c.id}>
                      <span className={label} title={c.hint}>
                        {c.label}
                      </span>
                      <input
                        className={field}
                        inputMode="numeric"
                        value={String(cfg.prices[c.id])}
                        onChange={(e) => update((s) => ((s.caseTypes[t.id].prices[c.id] = Number(e.target.value.replace(/[^\d]/g, '')) || 0), s))}
                      />
                      <span className="mt-0.5 block font-body text-[10px] text-ink/45">{c.hint}</span>
                    </div>
                  ))}
                </div>

                <details className="mt-4 rounded-xl bg-parchment/60 p-3 ring-1 ring-ink/8">
                  <summary className="cursor-pointer font-body text-sm font-semibold text-ink">
                    Phones on sale <span className="font-normal text-ink/55">({onSale.size} of {t.models.length})</span>
                  </summary>
                  <div className="mt-3">
                    <ModelChecklist
                      models={t.models}
                      checked={onSale}
                      onChange={(next) =>
                        update((s) => {
                          const others = s.disabledModels.filter((k) => !k.startsWith(`${t.id}|`))
                          const off = t.models.filter((m) => !next.has(m.label)).map((m) => modelKey(t.id as CaseTypeId, m.label))
                          s.disabledModels = [...others, ...off]
                          return s
                        })
                      }
                    />
                  </div>
                </details>
              </>
            )}
          </Panel>
        )
      })}

      <Panel title="Delivery">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <span className={label}>Delivery fee per order (Rs)</span>
            <input className={field} inputMode="numeric" value={String(draft.deliveryFeeLKR)} onChange={(e) => update((s) => ((s.deliveryFeeLKR = Number(e.target.value.replace(/[^\d]/g, '')) || 0), s))} />
          </div>
          <div>
            <span className={label}>Free delivery from (Rs, 0 = never)</span>
            <input className={field} inputMode="numeric" value={String(draft.freeDeliveryFromLKR)} onChange={(e) => update((s) => ((s.freeDeliveryFromLKR = Number(e.target.value.replace(/[^\d]/g, '')) || 0), s))} />
          </div>
          <div>
            <span className={label}>Most a shopper can order at once</span>
            <input className={field} inputMode="numeric" value={String(draft.maxQuantity)} onChange={(e) => update((s) => ((s.maxQuantity = Math.max(1, Math.min(20, Number(e.target.value.replace(/[^\d]/g, '')) || 1))), s))} />
          </div>
          <div className="sm:col-span-3">
            <span className={label}>Delivery time shown to shoppers</span>
            <input className={field} value={draft.leadTime} onChange={(e) => update((s) => ((s.leadTime = e.target.value), s))} placeholder="Printed and delivered in 3 to 5 days" />
          </div>
        </div>
      </Panel>

      <Panel title="Payment">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-body text-sm text-ink">Cash on delivery</span>
            <Toggle checked={draft.payments.cod} onChange={(v) => update((s) => ((s.payments.cod = v), s))} label="Cash on delivery" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-body text-sm text-ink">Bank transfer</span>
            <Toggle checked={draft.payments.bank} onChange={(v) => update((s) => ((s.payments.bank = v), s))} label="Bank transfer" />
          </div>
          {draft.payments.bank && (
            <div>
              <span className={label}>Bank details shown after ordering</span>
              <textarea
                className={`${field} min-h-[88px]`}
                value={draft.payments.bankDetails}
                onChange={(e) => update((s) => ((s.payments.bankDetails = e.target.value), s))}
                placeholder={'Bank, branch\nAccount name\nAccount number'}
              />
            </div>
          )}
          {!draft.payments.cod && !draft.payments.bank && <Notice>Turn on at least one. Cash on delivery stays on otherwise.</Notice>}
        </div>
      </Panel>

      {msg && <Notice tone={msg.ok ? 'teal' : 'red'}>{msg.text}</Notice>}

      <div className={`fixed inset-x-0 bottom-16 z-30 border-t border-ink/10 bg-card/95 px-4 py-3 backdrop-blur-md transition-transform lg:bottom-0 lg:left-[264px] ${dirty ? 'translate-y-0' : 'translate-y-[200%]'}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 sm:px-4">
          <span className="font-body text-sm text-ink/70">You have unsaved changes.</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setDraft(saved)} className="rounded-full border border-ink/15 px-4 py-2 font-body text-sm font-semibold text-ink">
              Undo
            </button>
            <button type="button" onClick={() => save(false)} disabled={busy || needsMigration} className="rounded-full bg-indigo px-5 py-2 font-body text-sm font-semibold text-parchment disabled:opacity-40">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
