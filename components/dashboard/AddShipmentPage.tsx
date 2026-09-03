'use client'

import { useState } from 'react'
import { Box, CircleHelp, Plus, CheckCircle2 } from 'lucide-react'
import HelpRail from './HelpRail'
import { warehouseAddresses } from './data'

export default function AddShipmentPage() {
  const activeWarehouses = warehouseAddresses.filter((address) => !address.disabled)
  const [warehouse, setWarehouse] = useState(activeWarehouses[0].region)
  const [courier, setCourier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!trackingNumber.trim()) return
    setSubmitted(true)
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-8 lg:px-10">
      <div className="flex items-center justify-between gap-4 motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Add a shipment</h1>
         <a
          href="#faq"
          className="flex flex-none items-center gap-2 text-sm font-semibold text-ink/70 transition-colors duration-200 hover:text-ink"
        >
          <CircleHelp size={18} /> FAQ
        </a>
      </div>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {/* Hero */}
          <div className="relative flex items-center gap-6 overflow-hidden rounded-3xl bg-gold-soft px-9 py-10 motion-safe:[animation:fadeUp_0.45s_ease-out_0.05s_both]">
            <div
              className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-gold/20 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-rust/10 blur-3xl"
              aria-hidden
            />

            <h2 className="relative max-w-sm font-display text-2xl leading-snug text-ink sm:text-3xl">
              Declare your parcel, we&apos;ll take it from the warehouse
            </h2>
            <span className="relative hidden h-24 w-24 flex-none rotate-6 place-items-center rounded-2xl bg-rust text-paper shadow-lift transition-transform duration-500 ease-out hover:rotate-0 hover:scale-105 motion-safe:[animation:scaleIn_0.5s_ease-out_0.1s_both,floatSlow_4.5s_ease-in-out_0.5s_infinite] sm:grid">
              <Box size={34} />
            </span>
          </div>

          {submitted ? (
            <div className="mt-5 flex flex-col items-center rounded-2xl border border-dashed border-ink/20 bg-card p-8 text-center motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 motion-safe:[animation:scaleIn_0.4s_ease-out_0.05s_both]">
                <CheckCircle2 size={26} className="text-gold-deep" />
              </div>
              <h3 className="mt-4 font-display text-xl text-ink">Shipment declared</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink/60">
                We&apos;ll notify you once your parcel checks in at the {warehouse} warehouse. You can track it under
                Shipment orders.
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="mx-auto mt-6 flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-paper transition-all duration-200 hover:bg-blue-deep hover:shadow-md active:scale-[0.98]"
              >
                Declare another parcel
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-5 flex flex-col gap-5 rounded-2xl border border-dashed border-ink/20 bg-card p-7 transition-shadow duration-300 hover:shadow-sm motion-safe:[animation:fadeUp_0.45s_ease-out_0.1s_both]"
            >
              <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
                Warehouse
                <select
                  value={warehouse}
                  onChange={(event) => setWarehouse(event.target.value)}
                  className="rounded-xl border border-ink/15 bg-paper px-4 py-3 text-sm font-normal outline-none transition-all duration-200 focus:border-gold/60 focus:bg-card focus:ring-2 focus:ring-gold/50"
                >
                  {activeWarehouses.map((address) => (
                    <option key={address.region}>{address.region}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
                Courier <span className="font-normal text-ink/45">(optional)</span>
                <input
                  value={courier}
                  onChange={(event) => setCourier(event.target.value)}
                  placeholder="e.g. UPS, FedEx, USPS"
                  className="rounded-xl border border-ink/15 bg-paper px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-ink/35 focus:border-gold/60 focus:bg-card focus:ring-2 focus:ring-gold/50"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
                Tracking number <b className="text-rust">*</b>
                <input
                  required
                  value={trackingNumber}
                  onChange={(event) => setTrackingNumber(event.target.value)}
                  placeholder="Paste the courier's tracking number"
                  className="rounded-xl border border-ink/15 bg-paper px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-ink/35 focus:border-gold/60 focus:bg-card focus:ring-2 focus:ring-gold/50"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
                Estimated weight (kg) <span className="font-normal text-ink/45">(optional)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                  placeholder="0.0"
                  className="rounded-xl border border-ink/15 bg-paper px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-ink/35 focus:border-gold/60 focus:bg-card focus:ring-2 focus:ring-gold/50"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
                Notes for our team <span className="font-normal text-ink/45">(optional)</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Anything we should know — fragile items, consolidation requests, etc."
                  className="min-h-[90px] resize-y rounded-xl border border-ink/15 bg-paper p-4 text-sm outline-none transition-all duration-200 placeholder:text-ink/35 focus:border-gold/60 focus:bg-card focus:ring-2 focus:ring-gold/50"
                />
              </label>

              <button
                type="submit"
                disabled={!trackingNumber.trim()}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3.5 text-sm font-semibold text-paper transition-all duration-200 hover:bg-blue-deep hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/25 disabled:active:scale-100"
              >
                <Plus size={18} className="transition-transform duration-200 group-hover:rotate-90" />
                Declare shipment
              </button>
            </form>
          )}
        </div>

        <HelpRail />
      </div>
    </div>
  )
}