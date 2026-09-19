// app/demo/quote/page.tsx
"use client"

import { Suspense, useEffect, useId, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Calculator, ChevronDown, SlidersHorizontal } from "lucide-react"
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts"

import {
  calculateQuote,
  calculateSimpleQuote,
  HS_CODE_RATES,
  DEFAULT_WEIGHT_KG,
  FREIGHT_RATE_PER_KG_LKR,
  SIMPLE_WEIGHT_BLOCK_KG,
  SIMPLE_FREIGHT_RATE_PER_KG,
  SIMPLE_PROFIT_PERCENT,
  SIMPLE_DELIVERY_FLAT_LKR,
  SIMPLE_EXTRA_MARGIN_FLAT_LKR,
  SIMPLE_ECONOMY_POSTAL_RATE_PER_KG_LKR,
  SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_KG,
  type QuoteBreakdown,
  type SimpleQuoteBreakdown,
  type QuoteRates,
  type DeliveryType,
} from "@/lib/quote"
import { rateToLKR } from "@/lib/currency-config"

// Quote calculator: enter what a customer wants to buy and see the landed-cost
// breakdown WishDrop would quote them, step by step. Same page recipe as the
// admin list pages (shell, header with a live stat strip, segmented toolbar,
// bordered surfaces), with the tool itself below.
//
// It can be pre-filled from a product page's "see price breakdown" link
// (?mode=simple&delivery=economy&value=...&currency=...&weight=...&pcs=...
// &hsCode=...). Anything missing or invalid falls back to this tool's own
// defaults, so a direct visit behaves exactly as before.

const HS_CODE_OPTIONS = Object.keys(HS_CODE_RATES).filter((code) => code !== "DEFAULT")

const HS_CODE_LABELS: Record<string, string> = {
  "6109.10": "6109.10 \u2014 Cotton T-shirts",
  "8517.13": "8517.13 \u2014 Smartphones",
  "9503.00": "9503.00 \u2014 Toys",
}

// Always-shown currency pills for the Value field. If a product page hands off
// a currency outside this list (e.g. USD), it's appended at runtime so the
// incoming value stays visible and selectable instead of silently coerced.
const DEFAULT_CURRENCY_OPTIONS = ["LKR", "INR"] as const
type CurrencyOption = string

type Mode = "customs" | "simple"

// The Simple / Customs switch is hidden for now. Flip this to bring it back;
// ?mode=customs still opens the cascade either way.
const SHOW_MODE_TOGGLE = false

// Slice colours for the breakdown dial (SVG fills can't use Tailwind tokens):
// indigo, teal and gold families, one shade per slice.
const BREAKDOWN_COLORS = ["#1B2A4A", "#3D5A80", "#0F8A7C", "#14B8A6", "#5EEAD4", "#C9A227", "#E3C567", "#D97757"]

// Plain-language formula shown on hover or focus, for each mode's figures.
const CUSTOMS_FORMULAS: Record<string, string> = {
  cif: "CIF = Product price + Freight",
  freight: "Freight = Weight (kg) × rate/kg, or the manual override if set",
  customsDuty: "Customs Duty = CIF × Duty%",
  pal: "PAL = (CIF + Customs Duty) × PAL%",
  cess: "Cess = CIF × Cess%",
  surchargeOnDuty: "Surcharge on Duty = Customs Duty × Surcharge%",
  sscl: "SSCL = (CIF + Duty + PAL + Cess + Surcharge) × SSCL%",
  dutyPalCessSurchargeSscl: "Sum of Duty + PAL + Cess + Surcharge + SSCL",
  vat: "VAT = (CIF + Duty+PAL+Cess+Surcharge+SSCL) × VAT%",
  totalTax: "Total Tax = (Duty+PAL+Cess+Surcharge+SSCL) + VAT",
  priceToLandedCost: "= Product price ÷ Total Landed Cost × 100",
  productPrice: "= Value entered × exchange rate (1 if already LKR)",
}

const SIMPLE_FORMULAS: Record<string, string> = {
  productCost: "= Value entered × exchange rate (1 if already LKR)",
  profitAmount: "= Product cost × Profit%",
  costWithProfit: "= Product cost + Profit amount",
  freightCharges: "= (Weight ÷ weight block kg) × freight rate per block",
  customsClearance: "= (Weight ÷ weight block kg) × customs clearance rate per block",
  postalCharges: "= Weight (kg) × postal charge rate per kg",
  subtotal: "= Cost with profit + Freight Charges + Customs Clearance (Express), or + Postal Charges (Economy)",
  totalWithDelivery: "= Subtotal + delivery fee (Express only, Economy has no flat delivery fee)",
  totalCost: "= Total with delivery + extra margin",
}

const FIELD =
  "w-full rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
const LABEL = "text-xs font-medium text-ink/50"
const LINK_BUTTON = "text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"

function formatLKR(value: number) {
  return `Rs ${value.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ---- Query-param parsing helpers ----

function parseMode(value: string | null): Mode {
  return value === "customs" ? "customs" : "simple"
}

function parseDeliveryType(value: string | null): DeliveryType {
  return value === "economy" ? "economy" : "express"
}

function parsePositiveNumber(value: string | null, fallback: number): number {
  if (value == null) return fallback
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function parseOptionalWeight(value: string | null): number | "" {
  if (!value) return ""
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : ""
}

interface ResultRowData {
  label: string
  value: string
  formula?: string
  emphasis?: boolean
}

function QuoteDemoPage() {
  const searchParams = useSearchParams()

  const [mode, setMode] = useState<Mode>(() => parseMode(searchParams.get("mode")))
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(() => parseDeliveryType(searchParams.get("delivery")))

  const [pcsPerUnit, setPcsPerUnit] = useState(() => parsePositiveNumber(searchParams.get("pcs"), 1))
  const [valueAmount, setValueAmount] = useState(() => parsePositiveNumber(searchParams.get("value"), 1000))
  const [valueCurrency, setValueCurrency] = useState<CurrencyOption>(
    () => searchParams.get("currency")?.toUpperCase() || "LKR",
  )
  const [weightKg, setWeightKg] = useState<number | "">(() => parseOptionalWeight(searchParams.get("weight")))
  const [hsCode, setHsCode] = useState(() => searchParams.get("hsCode") ?? "")
  const [manualFreight, setManualFreight] = useState<number | "">("")

  // Whether anything arrived via the query string, for the "pre-filled" note.
  const cameFromProductPage = searchParams.toString().length > 0

  const currencyOptions = useMemo(() => {
    const opts: string[] = [...DEFAULT_CURRENCY_OPTIONS]
    if (!opts.includes(valueCurrency)) opts.push(valueCurrency)
    return opts
  }, [valueCurrency])

  // ---- Live config: editable rates and fees, toggled from the panel below ----
  const [showConfig, setShowConfig] = useState(false)

  // Customs cascade config
  const [freightRateOverride, setFreightRateOverride] = useState(FREIGHT_RATE_PER_KG_LKR)
  const [defaultWeightOverride, setDefaultWeightOverride] = useState(DEFAULT_WEIGHT_KG)
  const [dutyPercentOverride, setDutyPercentOverride] = useState(HS_CODE_RATES.DEFAULT.dutyPercent)
  const [palPercentOverride, setPalPercentOverride] = useState(HS_CODE_RATES.DEFAULT.palPercent)
  const [cessPercentOverride, setCessPercentOverride] = useState(HS_CODE_RATES.DEFAULT.cessPercent)
  const [surchargePercentOverride, setSurchargePercentOverride] = useState(HS_CODE_RATES.DEFAULT.surchargePercent)
  const [ssclPercentOverride, setSsclPercentOverride] = useState(HS_CODE_RATES.DEFAULT.sscLPercent)
  const [vatPercentOverride, setVatPercentOverride] = useState(HS_CODE_RATES.DEFAULT.vatPercent)

  // Simple markup config, shared between Express and Economy
  const [profitPercentOverride, setProfitPercentOverride] = useState(SIMPLE_PROFIT_PERCENT)
  const [weightBlockOverride, setWeightBlockOverride] = useState(SIMPLE_WEIGHT_BLOCK_KG)
  const [extraMarginOverride, setExtraMarginOverride] = useState(SIMPLE_EXTRA_MARGIN_FLAT_LKR)

  // Simple markup config, Express only.
  // NOTE: these two are PER-KG values (the UI says "Freight / kg" and they are
  // seeded from the per-kg constants), but calculateSimpleQuote() expects
  // PER-BLOCK rates and does not convert from per-kg itself. They are scaled by
  // weightBlockOverride at the call site below.
  const [freightBlockRateOverride, setFreightBlockRateOverride] = useState(SIMPLE_FREIGHT_RATE_PER_KG)
  const [customsBlockRateOverride, setCustomsBlockRateOverride] = useState(SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_KG)
  const [deliveryFeeOverride, setDeliveryFeeOverride] = useState(SIMPLE_DELIVERY_FLAT_LKR)

  // Simple markup config, Economy only
  const [postalRateOverride, setPostalRateOverride] = useState(SIMPLE_ECONOMY_POSTAL_RATE_PER_KG_LKR)

  // When the selected HS code changes, re-sync the duty-rate fields to that
  // code's real rates, so "Adjust rates & fees" always starts from the right baseline.
  useEffect(() => {
    const base: QuoteRates = HS_CODE_RATES[hsCode] ?? HS_CODE_RATES.DEFAULT
    setDutyPercentOverride(base.dutyPercent)
    setPalPercentOverride(base.palPercent)
    setCessPercentOverride(base.cessPercent)
    setSurchargePercentOverride(base.surchargePercent)
    setSsclPercentOverride(base.sscLPercent)
    setVatPercentOverride(base.vatPercent)
  }, [hsCode])

  function resetCustomsConfig() {
    setFreightRateOverride(FREIGHT_RATE_PER_KG_LKR)
    setDefaultWeightOverride(DEFAULT_WEIGHT_KG)
    const base: QuoteRates = HS_CODE_RATES[hsCode] ?? HS_CODE_RATES.DEFAULT
    setDutyPercentOverride(base.dutyPercent)
    setPalPercentOverride(base.palPercent)
    setCessPercentOverride(base.cessPercent)
    setSurchargePercentOverride(base.surchargePercent)
    setSsclPercentOverride(base.sscLPercent)
    setVatPercentOverride(base.vatPercent)
  }

  function resetSimpleConfig() {
    setProfitPercentOverride(SIMPLE_PROFIT_PERCENT)
    setFreightBlockRateOverride(SIMPLE_FREIGHT_RATE_PER_KG)
    setCustomsBlockRateOverride(SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_KG)
    setWeightBlockOverride(SIMPLE_WEIGHT_BLOCK_KG)
    setDeliveryFeeOverride(SIMPLE_DELIVERY_FLAT_LKR)
    setExtraMarginOverride(SIMPLE_EXTRA_MARGIN_FLAT_LKR)
    setPostalRateOverride(SIMPLE_ECONOMY_POSTAL_RATE_PER_KG_LKR)
  }

  const customsQuote: QuoteBreakdown = useMemo(() => {
    return calculateQuote({
      pcsPerUnit: pcsPerUnit || 1,
      valueINR: valueAmount || 0,
      currencyCode: valueCurrency,
      weightKg: weightKg === "" ? undefined : Number(weightKg),
      hsCode,
      freightLKR: manualFreight === "" ? undefined : Number(manualFreight),
      freightRatePerKgLKR: freightRateOverride,
      defaultWeightKgOverride: defaultWeightOverride,
      rateOverrides: {
        dutyPercent: dutyPercentOverride,
        palPercent: palPercentOverride,
        cessPercent: cessPercentOverride,
        surchargePercent: surchargePercentOverride,
        sscLPercent: ssclPercentOverride,
        vatPercent: vatPercentOverride,
      },
    })
  }, [
    pcsPerUnit,
    valueAmount,
    valueCurrency,
    weightKg,
    hsCode,
    manualFreight,
    freightRateOverride,
    defaultWeightOverride,
    dutyPercentOverride,
    palPercentOverride,
    cessPercentOverride,
    surchargePercentOverride,
    ssclPercentOverride,
    vatPercentOverride,
  ])

  const simpleQuote: SimpleQuoteBreakdown = useMemo(() => {
    return calculateSimpleQuote({
      pcsPerUnit: pcsPerUnit || 1,
      valueINR: valueAmount || 0,
      currencyCode: valueCurrency,
      weightKg: weightKg === "" ? undefined : Number(weightKg),
      deliveryType,
      profitPercentOverride,
      // Per-kg in this UI, per-block in calculateSimpleQuote (express only).
      freightRatePerBlockLKROverride: freightBlockRateOverride * weightBlockOverride,
      customsClearanceRatePerBlockLKROverride: customsBlockRateOverride * weightBlockOverride,
      weightBlockKgOverride: weightBlockOverride,
      deliveryFeeLKROverride: deliveryFeeOverride,
      postalRatePerKgLKROverride: postalRateOverride,
      extraMarginLKROverride: extraMarginOverride,
    })
  }, [
    pcsPerUnit,
    valueAmount,
    valueCurrency,
    weightKg,
    deliveryType,
    profitPercentOverride,
    freightBlockRateOverride,
    customsBlockRateOverride,
    weightBlockOverride,
    deliveryFeeOverride,
    postalRateOverride,
    extraMarginOverride,
  ])

  const productPriceLKR = mode === "simple" ? simpleQuote.productCostLKR : customsQuote.productPriceLKR
  const totalPerUnit = mode === "simple" ? simpleQuote.totalCost : customsQuote.totalLandedCost
  const orderTotal = mode === "simple" ? simpleQuote.orderTotalCost : customsQuote.orderTotalLandedCost

  const rows: ResultRowData[] =
    mode === "simple"
      ? [
          { label: "Product cost (LKR)", value: formatLKR(simpleQuote.productCostLKR), formula: SIMPLE_FORMULAS.productCost },
          {
            label: `Profit (${simpleQuote.profitPercent}%)`,
            value: formatLKR(simpleQuote.profitAmount),
            formula: SIMPLE_FORMULAS.profitAmount,
          },
          { label: "Cost with profit", value: formatLKR(simpleQuote.costWithProfit), formula: SIMPLE_FORMULAS.costWithProfit },
          ...(deliveryType === "express"
            ? [
                { label: "Freight Charges", value: formatLKR(simpleQuote.freightCharges), formula: SIMPLE_FORMULAS.freightCharges },
                {
                  label: "Customs Clearance",
                  value: formatLKR(simpleQuote.customsClearance),
                  formula: SIMPLE_FORMULAS.customsClearance,
                },
              ]
            : [{ label: "Postal Charges", value: formatLKR(simpleQuote.postalCharges), formula: SIMPLE_FORMULAS.postalCharges }]),
          { label: "Subtotal", value: formatLKR(simpleQuote.subtotal), formula: SIMPLE_FORMULAS.subtotal },
          ...(deliveryType === "express"
            ? [
                {
                  label: "Total + Delivery",
                  value: formatLKR(simpleQuote.totalWithDelivery),
                  formula: SIMPLE_FORMULAS.totalWithDelivery,
                },
              ]
            : []),
          {
            label: "Total Cost (+ Extra Margin)",
            value: formatLKR(simpleQuote.totalCost),
            formula: SIMPLE_FORMULAS.totalCost,
            emphasis: true,
          },
        ]
      : [
          { label: "Product price (LKR)", value: formatLKR(customsQuote.productPriceLKR), formula: CUSTOMS_FORMULAS.productPrice },
          { label: "CIF (per unit)", value: formatLKR(customsQuote.cif), formula: CUSTOMS_FORMULAS.cif },
          { label: "Freight (per unit)", value: formatLKR(customsQuote.freight), formula: CUSTOMS_FORMULAS.freight },
          {
            label: "Customs Duty",
            value: `${formatLKR(customsQuote.customsDuty)} (${customsQuote.dutyPercent}%)`,
            formula: CUSTOMS_FORMULAS.customsDuty,
          },
          { label: "PAL", value: `${formatLKR(customsQuote.pal)} (${customsQuote.palPercent}%)`, formula: CUSTOMS_FORMULAS.pal },
          { label: "Cess", value: `${formatLKR(customsQuote.cess)} (${customsQuote.cessPercent}%)`, formula: CUSTOMS_FORMULAS.cess },
          {
            label: "Surcharge on Duty",
            value: `${formatLKR(customsQuote.surchargeOnDuty)} (${customsQuote.surchargePercent}%)`,
            formula: CUSTOMS_FORMULAS.surchargeOnDuty,
          },
          { label: "SSCL", value: `${formatLKR(customsQuote.sscl)} (${customsQuote.sscLPercent}%)`, formula: CUSTOMS_FORMULAS.sscl },
          {
            label: "Duty+PAL+Cess+Surcharge+SSCL",
            value: formatLKR(customsQuote.dutyPalCessSurchargeSscl),
            formula: CUSTOMS_FORMULAS.dutyPalCessSurchargeSscl,
          },
          { label: "VAT", value: `${formatLKR(customsQuote.vat)} (${customsQuote.vatPercent}%)`, formula: CUSTOMS_FORMULAS.vat },
          { label: "Total Tax", value: formatLKR(customsQuote.totalTax), formula: CUSTOMS_FORMULAS.totalTax, emphasis: true },
          {
            label: "Price / Landed Cost",
            value: `${customsQuote.priceToLandedCostPercent}%`,
            formula: CUSTOMS_FORMULAS.priceToLandedCost,
          },
        ]

  return (
    <main className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <Calculator size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Quote calculator</h1>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
                Enter what a customer wants to buy and see the landed cost breakdown WishDrop would quote them, step by
                step.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">
                Order total ({pcsPerUnit} unit{pcsPerUnit === 1 ? "" : "s"})
              </dt>
              <dd className="mt-0.5 whitespace-nowrap font-display text-xl tabular-nums text-ink">{formatLKR(orderTotal)}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Per unit</dt>
              <dd className="mt-0.5 whitespace-nowrap font-display text-xl tabular-nums text-ink">{formatLKR(totalPerUnit)}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Product price</dt>
              <dd className="mt-0.5 whitespace-nowrap font-display text-xl tabular-nums text-ink">{formatLKR(productPriceLKR)}</dd>
            </div>
          </dl>
        </div>

        {/* ── Toolbar ── */}
        {(SHOW_MODE_TOGGLE || mode === "simple" || cameFromProductPage) && (
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {SHOW_MODE_TOGGLE && (
                <Segmented<Mode>
                  label="Pricing mode"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { key: "simple", label: "Simple markup" },
                    { key: "customs", label: "Customs cascade" },
                  ]}
                />
              )}
              {mode === "simple" && (
                <Segmented<DeliveryType>
                  label="Delivery type"
                  value={deliveryType}
                  onChange={setDeliveryType}
                  options={[
                    { key: "express", label: "Express delivery" },
                    { key: "economy", label: "Economy delivery" },
                  ]}
                />
              )}
            </div>

            {cameFromProductPage && (
              <p className="text-xs text-ink/45">
                Pre-filled from a product page
                <Link href="/demo/quote" className={`ml-2 ${LINK_BUTTON}`}>
                  Clear
                </Link>
              </p>
            )}
          </div>
        )}

        {/* ── Inputs + dial ── */}
        <div className="mt-6 grid items-stretch gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-5 rounded-2xl border border-ink/10 bg-card p-6">
            <Field label="PCS / Unit" htmlFor="quote-pcs">
              <input
                id="quote-pcs"
                type="number"
                min={1}
                value={pcsPerUnit}
                onChange={(e) => setPcsPerUnit(Number(e.target.value))}
                className={FIELD}
              />
            </Field>

            <Field label="Value" htmlFor="quote-value">
              <div className="flex overflow-hidden rounded-lg border border-ink/10 bg-card transition-colors focus-within:border-teal/50 focus-within:ring-2 focus-within:ring-teal/15">
                <input
                  id="quote-value"
                  type="number"
                  min={0}
                  value={valueAmount}
                  onChange={(e) => setValueAmount(Number(e.target.value))}
                  className="w-full bg-transparent px-3 py-2 text-sm text-ink outline-none"
                />
                <div role="group" aria-label="Currency" className="flex shrink-0 items-center gap-0.5 border-l border-ink/10 bg-parchment/40 p-1">
                  {currencyOptions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={valueCurrency === c}
                      onClick={() => setValueCurrency(c)}
                      className={`rounded-md px-2 py-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
                        valueCurrency === c ? "bg-teal-deep text-parchment" : "text-ink/50 hover:text-ink/80"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {valueCurrency !== "LKR" && (
                <p className="mt-1.5 text-xs font-semibold tabular-nums text-teal-deep">{formatLKR(productPriceLKR)}</p>
              )}
            </Field>

            <Field
              label="Weight (kg)"
              htmlFor="quote-weight"
              hint={`Leave blank to default to ${mode === "simple" ? weightBlockOverride : defaultWeightOverride} kg`}
            >
              <input
                id="quote-weight"
                type="number"
                min={0}
                step={0.1}
                placeholder={String(mode === "simple" ? weightBlockOverride : defaultWeightOverride)}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value === "" ? "" : Number(e.target.value))}
                className={FIELD}
              />
            </Field>

            {mode === "customs" && (
              <>
                <Field
                  label="HS Code"
                  htmlFor="quote-hs"
                  hint={hsCode === "" ? "No code selected, using default rates" : undefined}
                >
                  <select id="quote-hs" value={hsCode} onChange={(e) => setHsCode(e.target.value)} className={FIELD}>
                    <option value="">Select HS code…</option>
                    {HS_CODE_OPTIONS.map((code) => (
                      <option key={code} value={code}>
                        {HS_CODE_LABELS[code] ?? code}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Freight override (LKR)"
                  htmlFor="quote-freight"
                  hint={`Optional. Otherwise calculated from weight × Rs ${freightRateOverride}/kg`}
                >
                  <input
                    id="quote-freight"
                    type="number"
                    min={0}
                    placeholder="Auto"
                    value={manualFreight}
                    onChange={(e) => setManualFreight(e.target.value === "" ? "" : Number(e.target.value))}
                    className={FIELD}
                  />
                </Field>
              </>
            )}

            {/* ---- Adjust rates & fees ---- */}
            <div>
              <button
                type="button"
                aria-expanded={showConfig}
                onClick={() => setShowConfig((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-ink/10 bg-parchment/40 px-3 py-2.5 text-sm font-medium text-ink/75 outline-none transition-colors hover:bg-ink/[0.03] focus-visible:ring-2 focus-visible:ring-teal/40"
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal size={14} aria-hidden />
                  Adjust rates &amp; fees
                </span>
                <ChevronDown size={14} className={`text-ink/40 transition-transform ${showConfig ? "rotate-180" : ""}`} aria-hidden />
              </button>

              {showConfig && (
                <div className="mt-3 space-y-3 rounded-xl border border-ink/10 bg-parchment/40 p-4">
                  {mode === "simple" ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <ConfigField label="Profit" value={profitPercentOverride} onChange={setProfitPercentOverride} suffix="%" />
                        <ConfigField label="Weight block" value={weightBlockOverride} onChange={setWeightBlockOverride} suffix="kg" />
                        {deliveryType === "express" ? (
                          <>
                            <ConfigField label="Freight / kg" value={freightBlockRateOverride} onChange={setFreightBlockRateOverride} suffix="LKR" />
                            <ConfigField
                              label="Customs clearance / kg"
                              value={customsBlockRateOverride}
                              onChange={setCustomsBlockRateOverride}
                              suffix="LKR"
                            />
                            <ConfigField label="Delivery fee" value={deliveryFeeOverride} onChange={setDeliveryFeeOverride} suffix="LKR" />
                          </>
                        ) : (
                          <ConfigField label="Postal charge / kg" value={postalRateOverride} onChange={setPostalRateOverride} suffix="LKR" />
                        )}
                        <ConfigField label="Extra margin" value={extraMarginOverride} onChange={setExtraMarginOverride} suffix="LKR" />
                      </div>
                      <button type="button" onClick={resetSimpleConfig} className={LINK_BUTTON}>
                        Reset to defaults
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <ConfigField label="Freight rate" value={freightRateOverride} onChange={setFreightRateOverride} suffix="LKR/kg" />
                        <ConfigField label="Default weight" value={defaultWeightOverride} onChange={setDefaultWeightOverride} suffix="kg" />
                        <ConfigField label="Duty" value={dutyPercentOverride} onChange={setDutyPercentOverride} suffix="%" />
                        <ConfigField label="PAL" value={palPercentOverride} onChange={setPalPercentOverride} suffix="%" />
                        <ConfigField label="Cess" value={cessPercentOverride} onChange={setCessPercentOverride} suffix="%" />
                        <ConfigField label="Surcharge (on duty)" value={surchargePercentOverride} onChange={setSurchargePercentOverride} suffix="%" />
                        <ConfigField label="SSCL" value={ssclPercentOverride} onChange={setSsclPercentOverride} suffix="%" />
                        <ConfigField label="VAT" value={vatPercentOverride} onChange={setVatPercentOverride} suffix="%" />
                      </div>
                      <p className="text-xs leading-relaxed text-ink/45">
                        Duty rates reset to the selected HS code&rsquo;s schedule whenever you change the HS code above.
                      </p>
                      <button type="button" onClick={resetCustomsConfig} className={LINK_BUTTON}>
                        Reset to defaults
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs leading-relaxed text-ink/50">
              {valueCurrency === "LKR"
                ? "Value entered directly in LKR, no conversion applied."
                : `Exchange rate: 1 ${valueCurrency} = ${rateToLKR(valueCurrency)} LKR, from lib/currency-config.ts (shared with the rest of the site).`}
            </p>
          </div>

          {mode === "simple" ? <SimpleDial quote={simpleQuote} /> : <CustomsDial quote={customsQuote} />}
        </div>

        {/* ── Result cards: full width, independent of the narrower input column ── */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => (
            <ResultRow key={r.label} {...r} />
          ))}
        </div>
      </div>
    </main>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { key: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
            value === o.key ? "bg-teal-deep text-parchment" : "text-ink/55 hover:text-ink/80"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function SimpleDial({ quote }: { quote: SimpleQuoteBreakdown }) {
  const data = [
    { name: "Product cost", value: quote.productCostLKR },
    { name: "Profit", value: quote.profitAmount },
    { name: "Freight Charges", value: quote.freightCharges },
    { name: "Customs Clearance", value: quote.customsClearance },
    { name: "Postal Charges", value: quote.postalCharges },
    { name: "Delivery", value: quote.deliveryFee },
    { name: "Extra Margin", value: quote.extraMargin },
  ].filter((d) => d.value > 0)

  return <BreakdownDialShell data={data} centerValue={quote.totalCost} centerLabel="Total cost" />
}

function CustomsDial({ quote }: { quote: QuoteBreakdown }) {
  const data = [
    { name: "Product price", value: quote.productPriceLKR },
    { name: "Freight", value: quote.freight },
    { name: "Customs Duty", value: quote.customsDuty },
    { name: "PAL", value: quote.pal },
    { name: "Cess", value: quote.cess },
    { name: "Surcharge", value: quote.surchargeOnDuty },
    { name: "SSCL", value: quote.sscl },
    { name: "VAT", value: quote.vat },
  ].filter((d) => d.value > 0)

  return <BreakdownDialShell data={data} centerValue={quote.totalLandedCost} centerLabel="Total landed cost" />
}

function BreakdownDialShell({
  data,
  centerValue,
  centerLabel,
}: {
  data: { name: string; value: number }[]
  centerValue: number
  centerLabel: string
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-ink/10 bg-card p-6">
      <p className="text-xs font-medium text-ink/50">Cost breakdown</p>
      <div className="relative mt-2 min-h-[240px] w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="90%"
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip
              formatter={(value, name) => [formatLKR(typeof value === "number" ? value : Number(value ?? 0)), String(name ?? "")]}
              contentStyle={{ borderRadius: 12, border: "1px solid rgba(32,36,43,0.1)", fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Centre readout, overlaid on the donut hole */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xs text-ink/50">{centerLabel}</p>
          <p className="mt-0.5 max-w-[140px] text-center font-display text-xl leading-tight tabular-nums text-ink">
            {formatLKR(centerValue)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs text-ink/70">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }}
              aria-hidden
            />
            {d.name}
          </div>
        ))}
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={`mb-1.5 block ${LABEL}`}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink/45">{hint}</p>}
    </div>
  )
}

function ConfigField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <label className="block">
      <span className={`mb-1 block ${LABEL}`}>{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-lg border border-ink/10 bg-card px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
        />
        {suffix && <span className="shrink-0 text-xs text-ink/45">{suffix}</span>}
      </div>
    </label>
  )
}

// The formula tooltip opens on hover AND keyboard focus (the card is
// focusable), so it is reachable without a mouse.
function ResultRow({ label, value, formula, emphasis }: ResultRowData) {
  const tipId = useId()

  return (
    <div
      tabIndex={formula ? 0 : undefined}
      aria-describedby={formula ? tipId : undefined}
      className={`group relative rounded-2xl border px-4 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${
        emphasis ? "border-teal/30 bg-teal/[0.06]" : "border-ink/10 bg-card hover:border-ink/20"
      }`}
    >
      <p className="text-xs font-medium text-ink/45">{label}</p>
      <p className={`mt-0.5 font-display text-base tabular-nums ${emphasis ? "text-teal-deep" : "text-ink"}`}>{value}</p>
      {formula && (
        <div
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-10 mt-1.5 w-max max-w-[240px] rounded-xl bg-ink px-3 py-2 text-xs text-parchment opacity-0 shadow-[0_12px_32px_-12px_rgba(32,36,43,0.45)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {formula}
        </div>
      )}
    </div>
  )
}

// useSearchParams requires a Suspense boundary in the App Router. This wrapper
// is the real default export; QuoteDemoPage holds all the logic.
export default function QuoteDemoPageRoute() {
  return (
    <Suspense fallback={null}>
      <QuoteDemoPage />
    </Suspense>
  )
}