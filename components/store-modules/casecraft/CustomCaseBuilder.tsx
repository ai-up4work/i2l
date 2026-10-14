// components/store-modules/casecraft/CustomCaseBuilder.tsx
//
// Design-your-own: case type -> phone -> print style -> photo -> order.
// Ported from the Case Craft project. The order is saved to Case Craft's
// own orders (seller portal → Print jobs) instead of a WhatsApp message
// and a downloaded ZIP.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, LogIn, RotateCcw, ShieldCheck, ZoomIn } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  CASE_TYPES,
  getCaseType,
  getModel,
  getTemplate,
  templateSrc,
  TEMPLATES,
  type CaseModel,
  type CaseTypeId,
  type TemplateId,
} from '@/lib/store-modules/casecraft/catalog'
import { formatRs, type DeliveryDetails, type PaymentMethod, type StorefrontData } from '@/lib/store-modules/casecraft/settings'
import CaseCheckout, { type PlacedOrder } from './CaseCheckout'
import { DEFAULT_PLACEMENT, prepareOriginal, renderPrintFiles, uploadOrderFile, type Placement } from './compose'
import { btnPrimary, CasePreview, PhonePicker, StepCard } from './parts'

type Step = 1 | 2 | 3 | 4 | 5
const STATE_KEY = 'casecraft:builder:v1'

export default function CustomCaseBuilder({ data }: { data: StorefrontData }) {
  const { user, loading, login } = useAuth()
  const types = useMemo(() => CASE_TYPES.filter((t) => data.models[t.id]?.length), [data.models])

  const [step, setStep] = useState<Step>(1)
  const [caseTypeId, setCaseTypeId] = useState<CaseTypeId | null>(types.length === 1 ? types[0].id : null)
  const [modelLabel, setModelLabel] = useState<string | null>(null)
  const [template, setTemplate] = useState<TemplateId>('full')
  const [file, setFile] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT)
  const [quantity, setQuantity] = useState(1)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Keep choices across a sign-in round trip (the photo itself can't be kept).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STATE_KEY)
      if (raw) {
        const s = JSON.parse(raw) as { caseTypeId?: string; modelLabel?: string; template?: string; step?: number }
        const t = getCaseType(s.caseTypeId)
        if (t && data.models[t.id]) {
          setCaseTypeId(t.id)
          const m = getModel(t.id, s.modelLabel)
          if (m && data.models[t.id]?.includes(m.label)) {
            setModelLabel(m.label)
            setTemplate(getTemplate(s.template).id)
            setStep(s.step === 4 ? 4 : 3)
          } else setStep(2)
        }
      }
    } catch {
      /* ignore */
    }
    setRestored(true)
  }, [data.models])

  useEffect(() => {
    if (!restored) return
    try {
      window.sessionStorage.setItem(STATE_KEY, JSON.stringify({ caseTypeId, modelLabel, template, step: Math.min(step, 4) }))
    } catch {
      /* ignore */
    }
  }, [restored, caseTypeId, modelLabel, template, step])

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl)
  }, [photoUrl])

  const caseType = getCaseType(caseTypeId)
  const models: CaseModel[] = useMemo(
    () => (caseType ? caseType.models.filter((m) => data.models[caseType.id]?.includes(m.label)) : []),
    [caseType, data.models],
  )
  const model = models.find((m) => m.label === modelLabel) ?? null
  const prices = caseType ? data.prices[caseType.id] : undefined
  const unitPrice = model && prices ? prices[model.size] : null
  const fromPrice = prices ? Math.min(...Object.values(prices)) : null
  const overlay = model ? templateSrc(model) : null

  function chooseType(id: CaseTypeId) {
    if (id !== caseTypeId) setModelLabel(null)
    setCaseTypeId(id)
    setStep(2)
  }

  function choosePhoto(f: File | undefined | null) {
    if (!f || !f.type.startsWith('image/')) return
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    setFile(f)
    setPhotoUrl(URL.createObjectURL(f))
    setPlacement(DEFAULT_PLACEMENT)
  }

  async function place(delivery: DeliveryDetails, payment: PaymentMethod): Promise<PlacedOrder> {
    if (!caseType || !model || !file || !photoUrl || !overlay) throw new Error('Finish your design first.')
    try {
      setBusyLabel('Preparing your print…')
      const [{ print, preview }, original] = await Promise.all([renderPrintFiles({ photoUrl, placement, template, overlaySrc: overlay }), prepareOriginal(file)])
      setBusyLabel('Uploading your photo…')
      const [photoLink, printLink, previewLink] = await Promise.all([
        uploadOrderFile(original, 'photo'),
        uploadOrderFile(print, 'print'),
        uploadOrderFile(preview, 'preview'),
      ])
      setBusyLabel('Placing your order…')
      const res = await fetch('/api/casecraft/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeSlug: data.storeSlug,
          kind: 'custom',
          caseTypeId: caseType.id,
          model: model.label,
          template,
          quantity,
          delivery,
          payment,
          photoUrl: photoLink,
          printUrl: printLink,
          previewUrl: previewLink,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not place the order.')
      try {
        window.sessionStorage.removeItem(STATE_KEY)
      } catch {
        /* ignore */
      }
      return body as PlacedOrder
    } finally {
      setBusyLabel(null)
    }
  }

  if (!types.length) {
    return <p className="rounded-2xl bg-card p-8 text-center font-body text-sm text-ink/60 ring-1 ring-ink/10">Custom cases aren&rsquo;t available right now. Have a look at the ready-made designs.</p>
  }

  const preview = (
    <div className="flex flex-col items-center gap-3">
      <CasePreview
        photoUrl={photoUrl}
        placement={placement}
        template={template}
        overlaySrc={overlay}
        onPlacementChange={step === 4 ? setPlacement : undefined}
        className="max-w-[200px] sm:max-w-[240px]"
        empty={
          <span className="font-body text-xs text-ink/45">
            {!caseType ? 'Pick a case to start' : !model ? 'Pick your phone' : 'Your photo goes here'}
          </span>
        }
      />
      {photoUrl && step === 4 && (
        <div className="flex w-full max-w-[260px] items-center gap-2">
          <ZoomIn size={14} className="flex-none text-ink/45" aria-hidden />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={placement.zoom}
            onChange={(e) => setPlacement({ ...placement, zoom: Number(e.target.value) })}
            aria-label="Zoom"
            className="w-full accent-[var(--color-teal)]"
          />
          <button type="button" onClick={() => setPlacement(DEFAULT_PLACEMENT)} aria-label="Reset position" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ink/55 hover:bg-ink/5">
            <RotateCcw size={14} />
          </button>
        </div>
      )}
      {model && unitPrice != null && (
        <p className="text-center font-body text-sm text-ink/60">
          {caseType?.label} for {model.label} · <span className="font-semibold text-ink">{formatRs(unitPrice)}</span>
        </p>
      )}
    </div>
  )

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
      <div className={`lg:sticky lg:top-24 lg:order-last ${model ? '' : 'hidden lg:block'}`}>{preview}</div>

      <div className="flex min-w-0 flex-col gap-3">
        <StepCard
          n={1}
          title="Choose your case"
          summary={caseType ? `${caseType.label} · ${caseType.series}` : fromPrice ? `From ${formatRs(fromPrice)}` : undefined}
          open={step === 1}
          done={Boolean(caseType)}
          onOpen={() => setStep(1)}
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {types.map((t) => {
              const on = t.id === caseTypeId
              const p = data.prices[t.id]
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => chooseType(t.id)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${on ? 'border-teal bg-teal/8 ring-1 ring-teal' : 'border-ink/10 hover:border-ink/25'}`}
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck size={16} className={on ? 'text-teal-deep' : 'text-ink/40'} aria-hidden />
                    <span className="font-body text-sm font-semibold text-ink">{t.label}</span>
                    <span className="rounded-full bg-ink/6 px-2 py-0.5 font-body text-[10px] font-semibold text-ink/55">{t.series}</span>
                  </span>
                  <span className="mt-1.5 block font-body text-xs text-ink/60">{t.description}</span>
                  {p && <span className="mt-2 block font-body text-xs font-semibold text-ink">From {formatRs(Math.min(...Object.values(p)))}</span>}
                </button>
              )
            })}
          </div>
        </StepCard>

        <StepCard n={2} title="Select your phone" summary={model?.label} open={step === 2} done={Boolean(model)} disabled={!caseType} onOpen={() => setStep(2)}>
          <PhonePicker
            key={caseTypeId ?? 'none'}
            models={models}
            selected={modelLabel}
            prices={prices}
            onSelect={(m) => {
              setModelLabel(m.label)
              setStep(3)
            }}
          />
        </StepCard>

        <StepCard n={3} title="Print style" summary={step > 3 || photoUrl ? getTemplate(template).label : undefined} open={step === 3} done={step > 3 || Boolean(photoUrl)} disabled={!model} onOpen={() => setStep(3)}>
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES.map((t) => {
              const on = t.id === template
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTemplate(t.id)
                    setStep(4)
                  }}
                  className={`rounded-xl border p-3 text-left transition-colors ${on ? 'border-teal bg-teal/8 ring-1 ring-teal' : 'border-ink/10 hover:border-ink/25'}`}
                >
                  <TemplateIcon id={t.id} />
                  <span className="mt-2 block font-body text-[13px] font-semibold text-ink">{t.label}</span>
                  <span className="block font-body text-[11px] leading-snug text-ink/55">{t.desc}</span>
                </button>
              )
            })}
          </div>
        </StepCard>

        <StepCard n={4} title="Your photo" summary={file ? file.name : undefined} open={step === 4} done={Boolean(photoUrl)} disabled={!model} onOpen={() => setStep(4)}>
          {!user && !loading ? (
            <div className="rounded-2xl border border-dashed border-ink/20 p-5 text-center">
              <p className="font-body text-sm text-ink/70">Sign in first, so your photo stays with your order.</p>
              <button type="button" onClick={login} className={`${btnPrimary} mt-3`}>
                <LogIn size={15} aria-hidden /> Sign in
              </button>
              <p className="mt-2 font-body text-xs text-ink/45">Your case and phone choices are kept.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => choosePhoto(e.target.files?.[0])} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  choosePhoto(e.dataTransfer.files?.[0])
                }}
                className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/20 px-4 py-6 text-center transition-colors hover:border-teal hover:bg-teal/5"
              >
                <ImagePlus size={22} className="text-teal-deep" aria-hidden />
                <span className="font-body text-sm font-semibold text-ink">{photoUrl ? 'Choose a different photo' : 'Upload a photo'}</span>
                <span className="font-body text-xs text-ink/50">A clear, high-quality photo prints best. JPEG or PNG.</span>
              </button>
              {photoUrl && (
                <>
                  <p className="font-body text-xs text-ink/55">Drag the photo on the case to move it, and use the slider to zoom.</p>
                  <button type="button" onClick={() => setStep(5)} className={btnPrimary}>
                    Looks good, continue
                  </button>
                </>
              )}
            </div>
          )}
        </StepCard>

        <StepCard n={5} title="Delivery & payment" open={step === 5} done={false} disabled={!photoUrl || !model} onOpen={() => setStep(5)}>
          {model && unitPrice != null && caseType && (
            <CaseCheckout
              data={data}
              quantity={quantity}
              onQuantity={setQuantity}
              busyLabel={busyLabel}
              item={{
                title: `Custom ${caseType.label}`,
                detail: `${model.label} · ${getTemplate(template).label}`,
                unitPrice,
                thumb: photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" className="h-14 w-10 flex-none rounded-lg object-cover ring-1 ring-ink/10" />
                ) : undefined,
              }}
              onPlace={place}
            />
          )}
        </StepCard>
      </div>
    </div>
  )
}

function TemplateIcon({ id }: { id: TemplateId }) {
  return (
    <span className="relative block h-12 w-7 overflow-hidden rounded-md bg-white ring-1 ring-ink/20">
      {id === 'full' && <span className="absolute inset-0 bg-gradient-to-br from-teal to-indigo" />}
      {id === 'centered' && <span className="absolute inset-[18%] rounded-sm bg-gradient-to-br from-teal to-indigo" />}
      {id === 'top' && <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-br from-teal to-indigo" />}
    </span>
  )
}
