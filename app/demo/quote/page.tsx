"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
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
  type QuoteBreakdown,
  type SimpleQuoteBreakdown,
  type QuoteRates,
  type DeliveryType,
  SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_KG,
  SIMPLE_FREIGHT_RATE_PER_BLOCK_LKR,
} from "@/lib/quote";
import { rateToLKR } from "@/lib/currency-config";

const HS_CODE_OPTIONS = Object.keys(HS_CODE_RATES).filter(
  (code) => code !== "DEFAULT"
);

const HS_CODE_LABELS: Record<string, string> = {
  "6109.10": "6109.10 — Cotton T-shirts",
  "8517.13": "8517.13 — Smartphones",
  "9503.00": "9503.00 — Toys",
};

// Always-shown currency pills for the Value field. If a product page
// hands off a currency outside this list (e.g. USD), it's appended at
// runtime (see currencyOptions below) so the incoming value is still
// visible/selectable instead of silently coerced to LKR.
const DEFAULT_CURRENCY_OPTIONS = ["LKR", "INR"] as const;
type CurrencyOption = string;

type Mode = "customs" | "simple";

// Colors for the breakdown dial — indigo/teal/gold family, one shade per slice.
const BREAKDOWN_COLORS = [
  "#1B2A4A", // indigo
  "#3D5A80", // indigo-light
  "#0F8A7C", // teal deep
  "#14B8A6", // teal
  "#5EEAD4", // teal light
  "#C9A227", // gold
  "#E3C567", // gold light
  "#D97757", // clay accent
];

// Plain-language formula shown on hover, for each mode's figures.
const CUSTOMS_FORMULAS: Record<string, string> = {
  cif: "CIF = Product price + Freight",
  freight: "Freight = Weight (kg) × rate/kg — or the manual override, if set",
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
};

const SIMPLE_FORMULAS: Record<string, string> = {
  productCost: "= Value entered × exchange rate (1 if already LKR)",
  profitAmount: "= Product cost × Profit%",
  costWithProfit: "= Product cost + Profit amount",
  freightCharges: "= (Weight ÷ weight block kg) × freight rate per block",
  customsClearance: "= (Weight ÷ weight block kg) × customs clearance rate per block",
  postalCharges: "= Weight (kg) × postal charge rate per kg",
  subtotal: "= Cost with profit + Freight Charges + Customs Clearance (Express), or + Postal Charges (Economy)",
  totalWithDelivery: "= Subtotal + delivery fee (Express only — Economy has no flat delivery fee)",
  totalCost: "= Total with delivery + extra margin",
};

function formatLKR(value: number) {
  return `Rs ${value.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---- Query-param parsing helpers ----
// Used to pre-fill this tool from a product page's "see price breakdown"
// link (?mode=simple&delivery=economy&value=...&currency=...&weight=...
// &pcs=...&hsCode=...). Anything missing/invalid falls back to this
// tool's own original defaults, so a direct/standalone visit behaves
// exactly as before.

function parseMode(value: string | null): Mode {
  return value === "customs" ? "customs" : "simple";
}

function parseDeliveryType(value: string | null): DeliveryType {
  return value === "economy" ? "economy" : "express";
}

function parsePositiveNumber(value: string | null, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseOptionalWeight(value: string | null): number | "" {
  if (!value) return "";
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : "";
}

function QuoteDemoPage() {
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>(() => parseMode(searchParams.get("mode")));
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(() =>
    parseDeliveryType(searchParams.get("delivery"))
  );

  const [pcsPerUnit, setPcsPerUnit] = useState(() =>
    parsePositiveNumber(searchParams.get("pcs"), 1)
  );
  const [valueAmount, setValueAmount] = useState(() =>
    parsePositiveNumber(searchParams.get("value"), 1000)
  );
  const [valueCurrency, setValueCurrency] = useState<CurrencyOption>(
    () => searchParams.get("currency")?.toUpperCase() || "LKR"
  );
  const [weightKg, setWeightKg] = useState<number | "">(() =>
    parseOptionalWeight(searchParams.get("weight"))
  );
  const [hsCode, setHsCode] = useState(() => searchParams.get("hsCode") ?? "");
  const [manualFreight, setManualFreight] = useState<number | "">("");

  // Whether anything arrived via the query string — used to show the
  // "pre-filled from a product page" banner and its clear link.
  const cameFromProductPage = searchParams.toString().length > 0;

  // Value-field currency pills: the two defaults, plus whatever currency
  // came in from the query string if it isn't already one of them — so
  // e.g. a USD product still shows up as a selectable pill instead of
  // being silently coerced toward LKR/INR.
  const currencyOptions = useMemo(() => {
    const opts: string[] = [...DEFAULT_CURRENCY_OPTIONS];
    if (!opts.includes(valueCurrency)) opts.push(valueCurrency);
    return opts;
  }, [valueCurrency]);

  // ---- Live config: editable rates & fees, toggled from the panel below ----
  const [showConfig, setShowConfig] = useState(false);

  // Customs cascade config
  const [freightRateOverride, setFreightRateOverride] = useState(FREIGHT_RATE_PER_KG_LKR);
  const [defaultWeightOverride, setDefaultWeightOverride] = useState(DEFAULT_WEIGHT_KG);
  const [dutyPercentOverride, setDutyPercentOverride] = useState(HS_CODE_RATES.DEFAULT.dutyPercent);
  const [palPercentOverride, setPalPercentOverride] = useState(HS_CODE_RATES.DEFAULT.palPercent);
  const [cessPercentOverride, setCessPercentOverride] = useState(HS_CODE_RATES.DEFAULT.cessPercent);
  const [surchargePercentOverride, setSurchargePercentOverride] = useState(HS_CODE_RATES.DEFAULT.surchargePercent);
  const [ssclPercentOverride, setSsclPercentOverride] = useState(HS_CODE_RATES.DEFAULT.sscLPercent);
  const [vatPercentOverride, setVatPercentOverride] = useState(HS_CODE_RATES.DEFAULT.vatPercent);

  // Simple markup config — shared between Express & Economy
  const [profitPercentOverride, setProfitPercentOverride] = useState(SIMPLE_PROFIT_PERCENT);
  const [weightBlockOverride, setWeightBlockOverride] = useState(SIMPLE_WEIGHT_BLOCK_KG);
  const [extraMarginOverride, setExtraMarginOverride] = useState(SIMPLE_EXTRA_MARGIN_FLAT_LKR);

  // Simple markup config — Express only
  // NOTE: freightBlockRateOverride / customsBlockRateOverride are PER-KG
  // values (that's what the UI label says: "Freight / kg", "Customs
  // clearance / kg", and that's what they're seeded from:
  // SIMPLE_FREIGHT_RATE_PER_KG / SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_KG).
  // calculateSimpleQuote(), however, expects PER-BLOCK rates
  // (rate per weightBlockKg, e.g. per 0.5kg) — it does NOT convert from
  // per-kg itself. These are scaled by the current weightBlockOverride
  // at the calculateSimpleQuote() call site below.
  const [freightBlockRateOverride, setFreightBlockRateOverride] = useState(SIMPLE_FREIGHT_RATE_PER_KG);
  const [customsBlockRateOverride, setCustomsBlockRateOverride] = useState(SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_KG);
  const [deliveryFeeOverride, setDeliveryFeeOverride] = useState(SIMPLE_DELIVERY_FLAT_LKR);

  // Simple markup config — Economy only
  const [postalRateOverride, setPostalRateOverride] = useState(SIMPLE_ECONOMY_POSTAL_RATE_PER_KG_LKR);

  // When the selected HS code changes, re-sync the duty-rate override
  // fields to that code's real rates, so "Adjust rates & fees" always
  // starts from the correct baseline instead of stale numbers.
  useEffect(() => {
    const base: QuoteRates = HS_CODE_RATES[hsCode] ?? HS_CODE_RATES.DEFAULT;
    setDutyPercentOverride(base.dutyPercent);
    setPalPercentOverride(base.palPercent);
    setCessPercentOverride(base.cessPercent);
    setSurchargePercentOverride(base.surchargePercent);
    setSsclPercentOverride(base.sscLPercent);
    setVatPercentOverride(base.vatPercent);
  }, [hsCode]);

  function resetCustomsConfig() {
    setFreightRateOverride(FREIGHT_RATE_PER_KG_LKR);
    setDefaultWeightOverride(DEFAULT_WEIGHT_KG);
    const base: QuoteRates = HS_CODE_RATES[hsCode] ?? HS_CODE_RATES.DEFAULT;
    setDutyPercentOverride(base.dutyPercent);
    setPalPercentOverride(base.palPercent);
    setCessPercentOverride(base.cessPercent);
    setSurchargePercentOverride(base.surchargePercent);
    setSsclPercentOverride(base.sscLPercent);
    setVatPercentOverride(base.vatPercent);
  }

  function resetSimpleConfig() {
    setProfitPercentOverride(SIMPLE_PROFIT_PERCENT);
    setFreightBlockRateOverride(SIMPLE_FREIGHT_RATE_PER_KG);
    setCustomsBlockRateOverride(SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_KG);
    setWeightBlockOverride(SIMPLE_WEIGHT_BLOCK_KG);
    setDeliveryFeeOverride(SIMPLE_DELIVERY_FLAT_LKR);
    setExtraMarginOverride(SIMPLE_EXTRA_MARGIN_FLAT_LKR);
    setPostalRateOverride(SIMPLE_ECONOMY_POSTAL_RATE_PER_KG_LKR);
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
    });
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
  ]);

  const simpleQuote: SimpleQuoteBreakdown = useMemo(() => {
    return calculateSimpleQuote({
      pcsPerUnit: pcsPerUnit || 1,
      valueINR: valueAmount || 0,
      currencyCode: valueCurrency,
      weightKg: weightKg === "" ? undefined : Number(weightKg),
      deliveryType,
      profitPercentOverride,
      // freightBlockRateOverride / customsBlockRateOverride are PER-KG
      // values in this UI; scale by the current weight-block size to get
      // the PER-BLOCK rate calculateSimpleQuote() expects (express only).
      freightRatePerBlockLKROverride: freightBlockRateOverride * weightBlockOverride,
      customsClearanceRatePerBlockLKROverride: customsBlockRateOverride * weightBlockOverride,
      weightBlockKgOverride: weightBlockOverride,
      deliveryFeeLKROverride: deliveryFeeOverride,
      postalRatePerKgLKROverride: postalRateOverride,
      extraMarginLKROverride: extraMarginOverride,
    });
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
  ]);

  const productPriceLKR =
    mode === "simple" ? simpleQuote.productCostLKR : customsQuote.productPriceLKR;
  const totalPerUnit =
    mode === "simple" ? simpleQuote.totalCost : customsQuote.totalLandedCost;
  const orderTotal =
    mode === "simple" ? simpleQuote.orderTotalCost : customsQuote.orderTotalLandedCost;

  return (
    <main className="min-h-screen bg-[#F7F2E9] px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="text-sm font-medium tracking-tight text-[#1B2A4A]/60">
            Internal tool
          </p>
          <h1 className="mt-1 font-serif text-4xl text-[#1B2A4A]">
            Quote calculator
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#1B2A4A]/70">
            Enter what a customer wants to buy and see the landed cost
            breakdown WishDrop would quote them, step by step.
          </p>

          {cameFromProductPage && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#0F8A7C]/25 bg-[#0F8A7C]/10 px-3 py-1 text-xs font-medium text-[#0F8A7C]">
              Pre-filled from a product page
              <Link href="/demo/quote" className="underline underline-offset-2 hover:text-[#0F8A7C]/80">
                Clear
              </Link>
            </div>
          )}
        </header>

        {/* Mode toggle + delivery-type toggle */}
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-[#1B2A4A]/15 bg-white/60 p-1">
            {(
              [
                { key: "simple", label: "Simple markup" },
                { key: "customs", label: "Customs cascade" },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={
                  "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors " +
                  (mode === m.key
                    ? "bg-[#1B2A4A] text-white"
                    : "text-[#1B2A4A]/60 hover:text-[#1B2A4A]")
                }
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "simple" && (
            <div className="inline-flex rounded-xl border border-[#1B2A4A]/15 bg-white/60 p-1">
              {(
                [
                  { key: "express", label: "Express delivery" },
                  { key: "economy", label: "Economy delivery" },
                ] as const
              ).map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDeliveryType(d.key)}
                  className={
                    "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors " +
                    (deliveryType === d.key
                      ? "bg-[#0F8A7C] text-white"
                      : "text-[#1B2A4A]/60 hover:text-[#1B2A4A]")
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid items-stretch gap-8 lg:grid-cols-[380px_1fr]">
          {/* Inputs */}
          <div className="space-y-5 rounded-2xl border border-[#1B2A4A]/10 bg-white/60 p-6">
            <Field label="PCS / Unit">
              <input
                type="number"
                min={1}
                value={pcsPerUnit}
                onChange={(e) => setPcsPerUnit(Number(e.target.value))}
                className="w-full rounded-lg border border-[#1B2A4A]/20 bg-white px-3 py-2 text-[#1B2A4A] outline-none focus:border-[#0F8A7C] focus:ring-2 focus:ring-[#0F8A7C]/20"
              />
            </Field>

            <Field label="Value">
              <div className="flex overflow-hidden rounded-lg border border-[#1B2A4A]/20 focus-within:border-[#0F8A7C] focus-within:ring-2 focus-within:ring-[#0F8A7C]/20">
                <input
                  type="number"
                  min={0}
                  value={valueAmount}
                  onChange={(e) => setValueAmount(Number(e.target.value))}
                  className="w-full bg-white px-3 py-2 text-[#1B2A4A] outline-none"
                />
                <div className="flex shrink-0 items-center border-l border-[#1B2A4A]/10 bg-[#1B2A4A]/[0.03]">
                  {currencyOptions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setValueCurrency(c)}
                      className={
                        "px-2.5 py-2 text-xs font-semibold transition-colors " +
                        (valueCurrency === c
                          ? "bg-[#1B2A4A] text-white"
                          : "text-[#1B2A4A]/50 hover:text-[#1B2A4A]")
                      }
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {valueCurrency !== "LKR" && (
                <p className="mt-1.5 text-xs font-medium text-[#0F8A7C]">
                  {formatLKR(productPriceLKR)}
                </p>
              )}
            </Field>

            <Field
              label="Weight (kg)"
              hint={
                mode === "simple"
                  ? `Leave blank to default to ${weightBlockOverride} kg`
                  : `Leave blank to default to ${defaultWeightOverride} kg`
              }
            >
              <input
                type="number"
                min={0}
                step={0.1}
                placeholder={String(
                  mode === "simple" ? weightBlockOverride : defaultWeightOverride
                )}
                value={weightKg}
                onChange={(e) =>
                  setWeightKg(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-full rounded-lg border border-[#1B2A4A]/20 bg-white px-3 py-2 text-[#1B2A4A] outline-none focus:border-[#0F8A7C] focus:ring-2 focus:ring-[#0F8A7C]/20"
              />
            </Field>

            {mode === "customs" && (
              <>
                <Field
                  label="HS Code"
                  hint={
                    hsCode === ""
                      ? "No code selected — using default rates"
                      : undefined
                  }
                >
                  <select
                    value={hsCode}
                    onChange={(e) => setHsCode(e.target.value)}
                    className="w-full rounded-lg border border-[#1B2A4A]/20 bg-white px-3 py-2 text-[#1B2A4A] outline-none focus:border-[#0F8A7C] focus:ring-2 focus:ring-[#0F8A7C]/20"
                  >
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
                  hint={`Optional — otherwise calculated from weight × Rs ${freightRateOverride}/kg`}
                >
                  <input
                    type="number"
                    min={0}
                    placeholder="Auto"
                    value={manualFreight}
                    onChange={(e) =>
                      setManualFreight(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="w-full rounded-lg border border-[#1B2A4A]/20 bg-white px-3 py-2 text-[#1B2A4A] outline-none focus:border-[#0F8A7C] focus:ring-2 focus:ring-[#0F8A7C]/20"
                  />
                </Field>
              </>
            )}

            {/* ---- Adjust rates & fees (config) toggle ---- */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowConfig((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg border border-dashed border-[#1B2A4A]/25 bg-[#1B2A4A]/[0.03] px-3 py-2 text-sm font-medium text-[#1B2A4A]/80 transition-colors hover:bg-[#1B2A4A]/[0.06]"
              >
                <span>⚙ Adjust rates &amp; fees</span>
                <span
                  className={
                    "text-xs transition-transform " +
                    (showConfig ? "rotate-180" : "")
                  }
                >
                  ▾
                </span>
              </button>

              {showConfig && (
                <div className="mt-3 space-y-3 rounded-lg border border-[#1B2A4A]/10 bg-white/70 p-4">
                  {mode === "simple" ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <ConfigField
                          label="Profit"
                          value={profitPercentOverride}
                          onChange={setProfitPercentOverride}
                          suffix="%"
                        />
                        <ConfigField
                          label="Weight block"
                          value={weightBlockOverride}
                          onChange={setWeightBlockOverride}
                          suffix="kg"
                        />
                        {deliveryType === "express" ? (
                          <>
                            <ConfigField
                              label="Freight / kg"
                              value={freightBlockRateOverride}
                              onChange={setFreightBlockRateOverride}
                              suffix="LKR"
                            />
                            <ConfigField
                              label="Customs clearance / kg"
                              value={customsBlockRateOverride}
                              onChange={setCustomsBlockRateOverride}
                              suffix="LKR"
                            />
                            <ConfigField
                              label="Delivery fee"
                              value={deliveryFeeOverride}
                              onChange={setDeliveryFeeOverride}
                              suffix="LKR"
                            />
                          </>
                        ) : (
                          <ConfigField
                            label="Postal charge / kg"
                            value={postalRateOverride}
                            onChange={setPostalRateOverride}
                            suffix="LKR"
                          />
                        )}
                        <ConfigField
                          label="Extra margin"
                          value={extraMarginOverride}
                          onChange={setExtraMarginOverride}
                          suffix="LKR"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={resetSimpleConfig}
                        className="text-xs font-medium text-[#0F8A7C] hover:underline"
                      >
                        Reset to defaults
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <ConfigField
                          label="Freight rate"
                          value={freightRateOverride}
                          onChange={setFreightRateOverride}
                          suffix="LKR/kg"
                        />
                        <ConfigField
                          label="Default weight"
                          value={defaultWeightOverride}
                          onChange={setDefaultWeightOverride}
                          suffix="kg"
                        />
                        <ConfigField
                          label="Duty"
                          value={dutyPercentOverride}
                          onChange={setDutyPercentOverride}
                          suffix="%"
                        />
                        <ConfigField
                          label="PAL"
                          value={palPercentOverride}
                          onChange={setPalPercentOverride}
                          suffix="%"
                        />
                        <ConfigField
                          label="Cess"
                          value={cessPercentOverride}
                          onChange={setCessPercentOverride}
                          suffix="%"
                        />
                        <ConfigField
                          label="Surcharge (on duty)"
                          value={surchargePercentOverride}
                          onChange={setSurchargePercentOverride}
                          suffix="%"
                        />
                        <ConfigField
                          label="SSCL"
                          value={ssclPercentOverride}
                          onChange={setSsclPercentOverride}
                          suffix="%"
                        />
                        <ConfigField
                          label="VAT"
                          value={vatPercentOverride}
                          onChange={setVatPercentOverride}
                          suffix="%"
                        />
                      </div>
                      <p className="text-[11px] leading-relaxed text-[#1B2A4A]/45">
                        Duty rates reset to the selected HS code's schedule
                        whenever you change the HS code above.
                      </p>
                      <button
                        type="button"
                        onClick={resetCustomsConfig}
                        className="text-xs font-medium text-[#0F8A7C] hover:underline"
                      >
                        Reset to defaults
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <p className="pt-2 text-xs leading-relaxed text-[#1B2A4A]/50">
              {valueCurrency === "LKR"
                ? "Value entered directly in LKR — no conversion applied."
                : `Exchange rate: 1 ${valueCurrency} = ${rateToLKR(valueCurrency)} LKR, from lib/currency-config.ts (shared with the rest of the site).`}
            </p>
          </div>

          {/* Summary + dial */}
          <div className="flex h-full flex-col gap-4">
            <div className="rounded-2xl bg-[#1B2A4A] p-6 text-white">
              <p className="text-sm text-white/60">
                Total cost · {pcsPerUnit} unit{pcsPerUnit > 1 ? "s" : ""}
                {mode === "simple" &&
                  (deliveryType === "express" ? " · Express" : " · Economy")}
              </p>
              <p className="mt-1 font-serif text-4xl">{formatLKR(orderTotal)}</p>
              <p className="mt-1 text-sm text-white/60">
                {formatLKR(totalPerUnit)} per unit
              </p>
              <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4 text-sm">
                <span className="text-white/60">Product price:</span>
                <span className="font-medium">{formatLKR(productPriceLKR)}</span>
              </div>
            </div>

            <div className="flex-1">
              {mode === "simple" ? (
                <SimpleDial quote={simpleQuote} />
              ) : (
                <CustomsDial quote={customsQuote} />
              )}
            </div>
          </div>
        </div>

        {/* Result cards — full page width, independent of the narrower input column above */}
        {mode === "simple" ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ResultRow
              label="Product cost (LKR)"
              value={formatLKR(simpleQuote.productCostLKR)}
              formula={SIMPLE_FORMULAS.productCost}
            />
            <ResultRow
              label={`Profit (${simpleQuote.profitPercent}%)`}
              value={formatLKR(simpleQuote.profitAmount)}
              formula={SIMPLE_FORMULAS.profitAmount}
            />
            <ResultRow
              label="Cost with profit"
              value={formatLKR(simpleQuote.costWithProfit)}
              formula={SIMPLE_FORMULAS.costWithProfit}
            />
            {deliveryType === "express" ? (
              <>
                <ResultRow
                  label="Freight Charges"
                  value={formatLKR(simpleQuote.freightCharges)}
                  formula={SIMPLE_FORMULAS.freightCharges}
                />
                <ResultRow
                  label="Customs Clearance"
                  value={formatLKR(simpleQuote.customsClearance)}
                  formula={SIMPLE_FORMULAS.customsClearance}
                />
              </>
            ) : (
              <ResultRow
                label="Postal Charges"
                value={formatLKR(simpleQuote.postalCharges)}
                formula={SIMPLE_FORMULAS.postalCharges}
              />
            )}
            <ResultRow
              label="Subtotal"
              value={formatLKR(simpleQuote.subtotal)}
              formula={SIMPLE_FORMULAS.subtotal}
            />
            {deliveryType === "express" && (
              <ResultRow
                label="Total + Delivery"
                value={formatLKR(simpleQuote.totalWithDelivery)}
                formula={SIMPLE_FORMULAS.totalWithDelivery}
              />
            )}
            <ResultRow
              label="Total Cost (+ Extra Margin)"
              value={formatLKR(simpleQuote.totalCost)}
              formula={SIMPLE_FORMULAS.totalCost}
            />
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ResultRow
              label="Product price (LKR)"
              value={formatLKR(customsQuote.productPriceLKR)}
              formula={CUSTOMS_FORMULAS.productPrice}
            />
            <ResultRow
              label="CIF (per unit)"
              value={formatLKR(customsQuote.cif)}
              formula={CUSTOMS_FORMULAS.cif}
            />
            <ResultRow
              label="Freight (per unit)"
              value={formatLKR(customsQuote.freight)}
              formula={CUSTOMS_FORMULAS.freight}
            />
            <ResultRow
              label="Customs Duty"
              value={`${formatLKR(customsQuote.customsDuty)} (${customsQuote.dutyPercent}%)`}
              formula={CUSTOMS_FORMULAS.customsDuty}
            />
            <ResultRow
              label="PAL"
              value={`${formatLKR(customsQuote.pal)} (${customsQuote.palPercent}%)`}
              formula={CUSTOMS_FORMULAS.pal}
            />
            <ResultRow
              label="Cess"
              value={`${formatLKR(customsQuote.cess)} (${customsQuote.cessPercent}%)`}
              formula={CUSTOMS_FORMULAS.cess}
            />
            <ResultRow
              label="Surcharge on Duty"
              value={`${formatLKR(customsQuote.surchargeOnDuty)} (${customsQuote.surchargePercent}%)`}
              formula={CUSTOMS_FORMULAS.surchargeOnDuty}
            />
            <ResultRow
              label="SSCL"
              value={`${formatLKR(customsQuote.sscl)} (${customsQuote.sscLPercent}%)`}
              formula={CUSTOMS_FORMULAS.sscl}
            />
            <ResultRow
              label="Duty+PAL+Cess+Surcharge+SSCL"
              value={formatLKR(customsQuote.dutyPalCessSurchargeSscl)}
              formula={CUSTOMS_FORMULAS.dutyPalCessSurchargeSscl}
            />
            <ResultRow
              label="VAT"
              value={`${formatLKR(customsQuote.vat)} (${customsQuote.vatPercent}%)`}
              formula={CUSTOMS_FORMULAS.vat}
            />
            <ResultRow
              label="Total Tax"
              value={formatLKR(customsQuote.totalTax)}
              formula={CUSTOMS_FORMULAS.totalTax}
            />
            <ResultRow
              label="Price / Landed Cost"
              value={`${customsQuote.priceToLandedCostPercent}%`}
              formula={CUSTOMS_FORMULAS.priceToLandedCost}
            />
          </div>
        )}
      </div>
    </main>
  );
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
  ].filter((d) => d.value > 0);

  return (
    <BreakdownDialShell data={data} centerValue={quote.totalCost} centerLabel="Total cost" />
  );
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
  ].filter((d) => d.value > 0);

  return (
    <BreakdownDialShell
      data={data}
      centerValue={quote.totalLandedCost}
      centerLabel="Total landed cost"
    />
  );
}

function BreakdownDialShell({
  data,
  centerValue,
  centerLabel,
}: {
  data: { name: string; value: number }[];
  centerValue: number;
  centerLabel: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#1B2A4A]/10 bg-white/60 p-6">
      <p className="mb-2 text-sm font-medium text-[#1B2A4A]">
        Cost breakdown
      </p>
      <div className="relative min-h-[200px] flex-1 w-full">
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
              formatter={(value, name) => [
                formatLKR(typeof value === "number" ? value : Number(value ?? 0)),
                String(name ?? ""),
              ]}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid rgba(27,42,74,0.1)",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center readout, overlaid on the donut hole */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[11px] text-[#1B2A4A]/50">{centerLabel}</p>
          <p className="mt-0.5 max-w-[140px] text-center font-serif text-xl leading-tight text-[#1B2A4A]">
            {formatLKR(centerValue)}
          </p>
        </div>
      </div>
      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs text-[#1B2A4A]/70">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }}
            />
            {d.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[#1B2A4A]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-[#1B2A4A]/50">{hint}</span>
      )}
    </label>
  );
}

function ConfigField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#1B2A4A]/70">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-md border border-[#1B2A4A]/20 bg-white px-2 py-1.5 text-sm text-[#1B2A4A] outline-none focus:border-[#0F8A7C] focus:ring-2 focus:ring-[#0F8A7C]/20"
        />
        {suffix && (
          <span className="shrink-0 text-[11px] text-[#1B2A4A]/45">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function ResultRow({
  label,
  value,
  formula,
}: {
  label: string;
  value: string;
  formula?: string;
}) {
  return (
    <div className="group relative rounded-xl border border-[#1B2A4A]/10 bg-white/60 px-4 py-3">
      <p className="text-xs text-[#1B2A4A]/60">{label}</p>
      <p className="mt-0.5 font-medium text-[#1B2A4A]">{value}</p>
      {formula && (
        <div className="pointer-events-none absolute left-0 top-full z-10 mt-1.5 w-max max-w-[240px] rounded-lg bg-[#1B2A4A] px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
          {formula}
        </div>
      )}
    </div>
  );
}

// useSearchParams requires a Suspense boundary in the App Router — this
// wrapper is the actual default export; QuoteDemoPage (above) holds all
// the real logic and is unchanged in behavior for a direct/standalone
// visit with no query string.
export default function QuoteDemoPageRoute() {
  return (
    <Suspense fallback={null}>
      <QuoteDemoPage />
    </Suspense>
  );
}