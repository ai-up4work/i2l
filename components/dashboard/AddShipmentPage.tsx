'use client'

import { useState } from 'react'
import { Box, CircleHelp, Plus } from 'lucide-react'
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Add a shipment</h1>
        <a href="#faq" className="flex flex-none items-center gap-2 text-sm font-semibold text-ink">
          <CircleHelp size={18} /> FAQ
        </a>
      </div>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-6 overflow-hidden rounded-3xl bg-gold-soft px-9 py-10">
            <h2 className="max-w-sm font-display text-2xl leading-snug text-ink sm:text-3xl">
              Declare your parcel, we&apos;ll take it from the warehouse
            </h2>
            <span className="hidden h-24 w-24 flex-none rotate-6 place-items-center rounded-2xl bg-rust text-paper shadow-lift sm:grid">
              <Box size={34} />
            </span>
          </div>

          {submitted ? (
            <div className="mt-5 rounded-2xl border border-dashed border-ink/20 bg-card p-8 text-center">
              <h3 className="font-display text-xl text-ink">Shipment declared</h3>
              <p className="mt-2 text-sm text-ink/60">
                We&apos;ll notify you once your parcel checks in at the {warehouse} warehouse. You can track it under
                Shipment orders.
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="mx-auto mt-6 flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
              >
                Declare another parcel
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-5 flex flex-col gap-5 rounded-2xl border border-dashed border-ink/20 bg-card p-7"
            >
              <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
                Warehouse
                <select
                  value={warehouse}
                  onChange={(event) => setWarehouse(event.target.value)}
                  className="rounded-xl border border-ink/15 bg-paper px-4 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-gold/50"
                >
                  {activeWarehouses.map((address) => (
                    <option key={address.region}>{address.region}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
                Courier <span className="font-normal text-muted">(optional)</span>
                <input
                  value={courier}
                  onChange={(event) => setCourier(event.target.value)}
                  placeholder="e.g. UPS, FedEx, USPS"
                  className="rounded-xl border border-ink/15 bg-paper px-4 py-3 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-gold/50"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
                Tracking number <b className="text-rust">*</b>
                <input
                  required
                  value={trackingNumber}
                  onChange={(event) => setTrackingNumber(event.target.value)}
                  placeholder="Paste the courier's tracking number"
                  className="rounded-xl border border-ink/15 bg-paper px-4 py-3 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-gold/50"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
                Estimated weight (kg) <span className="font-normal text-muted">(optional)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                  placeholder="0.0"
                  className="rounded-xl border border-ink/15 bg-paper px-4 py-3 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-gold/50"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
                Notes for our team <span className="font-normal text-muted">(optional)</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Anything we should know — fragile items, consolidation requests, etc."
                  className="min-h-[90px] resize-y rounded-xl border border-ink/15 bg-paper p-4 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-gold/50"
                />
              </label>

              <button
                type="submit"
                disabled={!trackingNumber.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3.5 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:bg-ink/25"
              >
                <Plus size={18} /> Declare shipment
              </button>
            </form>
          )}
        </div>

        <HelpRail />
      </div>
    </div>
  )
}
