// app/demo/quote/page.tsx
"use client";

import { useMemo, useState } from "react";
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
  SIMPLE_PROFIT_PERCENT,
  SIMPLE_FREIGHT_RATE_PER_BLOCK_LKR,
  SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_BLOCK_LKR,
  SIMPLE_DELIVERY_FLAT_LKR,
  SIMPLE_EXTRA_MARGIN_FLAT_LKR,
  type QuoteBreakdown,
  type SimpleQuoteBreakdown,
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

const CURRENCY_OPTIONS = ["LKR", "INR"] as const;
type CurrencyOption = (typeof CURRENCY_OPTIONS)[number];

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
  profitAmount: `= Product cost × ${SIMPLE_PROFIT_PERCENT}%`,
  costWithProfit: "= Product cost + Profit amount",
  freightCharges: `= (Weight ÷ ${SIMPLE_WEIGHT_BLOCK_KG}kg) × Rs ${SIMPLE_FREIGHT_RATE_PER_BLOCK_LKR}`,
  customsClearance: `= (Weight ÷ ${SIMPLE_WEIGHT_BLOCK_KG}kg) × Rs ${SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_BLOCK_LKR}`,
  subtotal: "= Cost with profit + Freight Charges + Customs Clearance",
  totalWithDelivery: `= Subtotal + Rs ${SIMPLE_DELIVERY_FLAT_LKR} delivery fee`,
  totalCost: `= Total with delivery + Rs ${SIMPLE_EXTRA_MARGIN_FLAT_LKR} extra margin`,
};

function formatLKR(value: number) {
  return `Rs ${value.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function QuoteDemoPage() {
  const [mode, setMode] = useState<Mode>("simple");

  const [pcsPerUnit, setPcsPerUnit] = useState(1);
  const [valueAmount, setValueAmount] = useState(16800);
  const [valueCurrency, setValueCurrency] = useState<CurrencyOption>("LKR");
  const [weightKg, setWeightKg] = useState<number | "">("");
  const [hsCode, setHsCode] = useState("");
  const [manualFreight, setManualFreight] = useState<number | "">("");

  const customsQuote: QuoteBreakdown = useMemo(() => {
    return calculateQuote({
      pcsPerUnit: pcsPerUnit || 1,
      valueINR: valueAmount || 0,
      currencyCode: valueCurrency,
      weightKg: weightKg === "" ? undefined : Number(weightKg),
      hsCode,
      freightLKR: manualFreight === "" ? undefined : Number(manualFreight),
    });
  }, [pcsPerUnit, valueAmount, valueCurrency, weightKg, hsCode, manualFreight]);

  const simpleQuote: SimpleQuoteBreakdown = useMemo(() => {
    return calculateSimpleQuote({
      pcsPerUnit: pcsPerUnit || 1,
      valueINR: valueAmount || 0,
      currencyCode: valueCurrency,
      weightKg: weightKg === "" ? undefined : Number(weightKg),
    });
  }, [pcsPerUnit, valueAmount, valueCurrency, weightKg]);

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
        </header>

        {/* Mode toggle */}
        <div className="mb-8 inline-flex rounded-xl border border-[#1B2A4A]/15 bg-white/60 p-1">
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
                  {CURRENCY_OPTIONS.map((c) => (
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
                  ? `Leave blank to default to ${SIMPLE_WEIGHT_BLOCK_KG} kg`
                  : `Leave blank to default to ${DEFAULT_WEIGHT_KG} kg`
              }
            >
              <input
                type="number"
                min={0}
                step={0.1}
                placeholder={String(
                  mode === "simple" ? SIMPLE_WEIGHT_BLOCK_KG : DEFAULT_WEIGHT_KG
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
                  hint={`Optional — otherwise calculated from weight × Rs ${FREIGHT_RATE_PER_KG_LKR}/kg`}
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
            <ResultRow
              label="Subtotal"
              value={formatLKR(simpleQuote.subtotal)}
              formula={SIMPLE_FORMULAS.subtotal}
            />
            <ResultRow
              label="Total + Delivery"
              value={formatLKR(simpleQuote.totalWithDelivery)}
              formula={SIMPLE_FORMULAS.totalWithDelivery}
            />
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