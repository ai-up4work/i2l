// lib/store-modules/casecraft/catalog.ts
//
// Case Craft's printable products: the case types with phone templates,
// the phone models for each, the print styles, and the price helpers.
// Ported from the Case Craft project (lib/Toughcases.meta.ts,
// lib/Toughphonecases.meta.ts, lib/caseTypes.meta.ts, lib/types.ts).
//
// Template images live in public/phoneCases/ (copy the folder from the
// Case Craft project). Each one is a transparent overlay of the case cut
// for one phone model.
//
// The two series are different physical cases: the same phone model has
// a different template in each (camera hole, border, port notch). Don't
// point one series at the other's files.
//
// Pure — safe to import from client components.

export type CaseTypeId = 'tough-cases' | 'tough-phone-cases'
export type BrandId = 'iphone' | 'samsung' | 'google'
export type SizeClass = 'standard' | 'pro' | 'plus' | 'promax'
export type TemplateId = 'full' | 'centered' | 'top'

export type CaseModel = {
  /** Shown to shoppers, e.g. "iPhone 15 Pro". Unique within a case type. */
  label: string
  /** File name in public/phoneCases/. */
  file: string
  brand: BrandId
  size: SizeClass
}

export type CaseType = {
  id: CaseTypeId
  label: string
  series: string
  tagline: string
  description: string
  models: CaseModel[]
}

export const SIZE_CLASSES: { id: SizeClass; label: string; hint: string }[] = [
  { id: 'standard', label: 'Standard', hint: 'e.g. iPhone 15, Galaxy S24' },
  { id: 'pro', label: 'Pro / Max', hint: 'e.g. iPhone 15 Pro, iPhone XS Max' },
  { id: 'plus', label: 'Plus', hint: 'e.g. iPhone 15 Plus, Galaxy S24 Plus' },
  { id: 'promax', label: 'Pro Max / Ultra', hint: 'e.g. iPhone 15 Pro Max, Galaxy S24 Ultra' },
]

/** Which price band a model is in (same rule the old project priced by). */
export function sizeClassOf(label: string): SizeClass {
  // XS Max and Pixel "Pro XL" are the big phones of their year — priced like a Pro Max.
  if (/pro max|ultra|xs max|pro xl/i.test(label)) return 'promax'
  if (/plus/i.test(label)) return 'plus'
  if (/pro|max/i.test(label)) return 'pro'
  return 'standard'
}

/**
 * The product line a model belongs to, for filtering long lists:
 * "Galaxy S24 Ultra" → "Galaxy S", "Galaxy A55" → "Galaxy A",
 * "Galaxy Z Flip 6" → "Galaxy Z", "Galaxy Note 20" → "Galaxy Note".
 * Other brands are one line each (null).
 */
export function seriesOf(model: Pick<CaseModel, 'label' | 'brand'>): string | null {
  if (model.brand !== 'samsung') return null
  const m = model.label.match(/^Galaxy\s+(Note|[A-Z])/i)
  return m ? `Galaxy ${m[1].length > 1 ? 'Note' : m[1].toUpperCase()}` : 'Galaxy'
}

/** Series in the order shoppers look for them. */
export const SERIES_ORDER = ['Galaxy S', 'Galaxy A', 'Galaxy Z', 'Galaxy M', 'Galaxy Note', 'Galaxy']

function brandOf(label: string): BrandId {
  if (label.startsWith('Galaxy')) return 'samsung'
  if (label.startsWith('Pixel')) return 'google'
  return 'iphone'
}

function numSort(a: CaseModel, b: CaseModel) {
  // "iPhone Air" sits with its generation, after the 17.
  const n = (s: string) => (/^iPhone Air$/i.test(s) ? 17.5 : parseInt(s.match(/\d+/)?.[0] ?? '0', 10))
  return n(a.label) - n(b.label) || a.label.localeCompare(b.label)
}

function build(list: [string, string][]): CaseModel[] {
  return list.map(([label, file]) => ({ label, file, brand: brandOf(label), size: sizeClassOf(label) })).sort(numSort)
}

// "Modern series" — WOYC. 51 templates.
const TOUGH_CASES: [string, string][] = [
  ['Pixel 5', 'ToughCases Google Pixel 5.png'],
  ['Pixel 6', 'ToughCases Google Pixel 6.png'],
  ['Pixel 6 Pro', 'ToughCases Google Pixel 6 Pro.png'],
  ['Pixel 7', 'ToughCases Google Pixel 7.png'],
  ['Pixel 8', 'ToughCases Google Pixel 8.png'],
  ['Pixel 8 Pro', 'ToughCases Google Pixel 8 Pro.png'],
  ['iPhone 8', 'ToughCases iPhone 8.png'],
  ['iPhone 8 Plus', 'ToughCases iPhone 8 Plus.png'],
  ['iPhone XS Max', 'ToughCases iPhone XS Max.png'],
  ['iPhone 12', 'ToughCases iPhone 12.png'],
  ['iPhone 12 Pro', 'ToughCases iPhone 12 Pro.png'],
  ['iPhone X', 'ToughCases iPhone X.png'],
  ['iPhone XR', 'ToughCases iPhone XR.png'],
  ['iPhone XS', 'ToughCases iPhone XS.png'],
  ['iPhone 11', 'ToughCases iPhone 11.png'],
  ['iPhone 11 Pro', 'ToughCases iPhone 11 Pro.png'],
  ['iPhone 11 Pro Max', 'ToughCases iPhone 11 Pro Max.png'],
  ['iPhone 12 Mini', 'ToughCases iPhone 12 Mini.png'],
  ['iPhone 12 Pro Max', 'ToughCases iPhone 12 Pro Max.png'],
  ['iPhone 13', 'ToughCases iPhone 13.png'],
  ['iPhone 13 Mini', 'ToughCases iPhone 13 Mini.png'],
  ['iPhone 13 Pro', 'ToughCases iPhone 13 Pro.png'],
  ['iPhone 13 Pro Max', 'ToughCases iPhone 13 Pro Max.png'],
  ['iPhone 14', 'ToughCases iPhone 14.png'],
  ['iPhone 14 Plus', 'ToughCases iPhone 14 Plus.png'],
  ['iPhone 14 Pro', 'ToughCases iPhone 14 Pro.png'],
  ['iPhone 14 Pro Max', 'ToughCases iPhone 14 Pro Max.png'],
  ['iPhone 15', 'ToughCases iPhone 15.png'],
  ['iPhone 15 Plus', 'ToughCases iPhone 15 Plus.png'],
  ['iPhone 15 Pro', 'ToughCases iPhone 15 Pro.png'],
  ['iPhone 15 Pro Max', 'ToughCases iPhone 15 Pro Max.png'],
  ['Galaxy S10', 'ToughCases Samsung S10.png'],
  ['Galaxy S10 Plus', 'ToughCases Samsung S10 Plus.png'],
  ['Galaxy S10 Edge', 'ToughCases Samsung S10 Edge.png'],
  ['Galaxy S20', 'ToughCases Samsung S20.png'],
  ['Galaxy S20 FE', 'ToughCases Samsung S20 FE.png'],
  ['Galaxy S20 Plus', 'ToughCases Samsung S20 Plus.png'],
  ['Galaxy S20 Ultra', 'ToughCases Samsung S20 Ultra.png'],
  ['Galaxy S21 FE', 'ToughCases Samsung S21 FE.png'],
  ['Galaxy S21 Plus', 'ToughCases Samsung S21 Plus.png'],
  ['Galaxy S21 Ultra', 'ToughCases Samsung S21 Ultra.png'],
  ['Galaxy S22 Plus', 'ToughCases Samsung S22 Plus.png'],
  ['Galaxy S22 Ultra', 'ToughCases Samsung S22 Ultra.png'],
  ['Galaxy S23 Plus', 'ToughCases Samsung S23 Plus.png'],
  ['Galaxy S23 Ultra', 'ToughCases Samsung S23 Ultra.png'],
  ['Galaxy S24 Plus', 'ToughCases Samsung S24 Plus.png'],
  ['Galaxy S24 Ultra', 'ToughCases Samsung S24 Ultra.png'],
  ['Galaxy S21', 'ToughCases Samsung S21.png'],
  ['Galaxy S22', 'ToughCases Samsung S22.png'],
  ['Galaxy S23', 'ToughCases Samsung S23.png'],
  ['Galaxy S24', 'ToughCases Samsung S24.png'],
  // Newer phones. Their templates are Wishdrop's own, generated by
  // scripts/casecraft-generate-templates.py from case pictures (for the
  // shop's previews); printing uses the supplier's own templates.
  ['iPhone 16', 'ToughCases iPhone 16.png'],
  ['iPhone 16 Plus', 'ToughCases iPhone 16 Plus.png'],
  ['iPhone 16 Pro', 'ToughCases iPhone 16 Pro.png'],
  ['iPhone 16 Pro Max', 'ToughCases iPhone 16 Pro Max.png'],
  ['iPhone 17', 'ToughCases iPhone 17.png'],
  ['iPhone Air', 'ToughCases iPhone Air.png'],
  ['iPhone 17 Pro', 'ToughCases iPhone 17 Pro.png'],
  ['iPhone 17 Pro Max', 'ToughCases iPhone 17 Pro Max.png'],
  ['iPhone 17e', 'ToughCases iPhone 17e.png'],
  ['iPhone 18 Pro', 'ToughCases iPhone 18 Pro.png'],
  ['iPhone 18 Pro Max', 'ToughCases iPhone 18 Pro Max.png'],
  ['Galaxy S24 FE', 'ToughCases Samsung S24 FE.png'],
  ['Galaxy S25', 'ToughCases Samsung S25.png'],
  ['Galaxy S25 Plus', 'ToughCases Samsung S25 Plus.png'],
  ['Galaxy S25 Ultra', 'ToughCases Samsung S25 Ultra.png'],
  ['Galaxy S25 FE', 'ToughCases Samsung S25 FE.png'],
  ['Galaxy S26', 'ToughCases Samsung S26.png'],
  ['Galaxy S26 Plus', 'ToughCases Samsung S26 Plus.png'],
  ['Galaxy A15', 'ToughCases Samsung A15.png'],
  ['Galaxy A16', 'ToughCases Samsung A16.png'],
  ['Galaxy A17', 'ToughCases Samsung A17.png'],
  ['Galaxy A25', 'ToughCases Samsung A25.png'],
  ['Galaxy A26', 'ToughCases Samsung A26.png'],
  ['Galaxy A35', 'ToughCases Samsung A35.png'],
  ['Galaxy A36', 'ToughCases Samsung A36.png'],
  ['Galaxy A37', 'ToughCases Samsung A37.png'],
  ['Galaxy A55', 'ToughCases Samsung A55.png'],
  ['Galaxy A56', 'ToughCases Samsung A56.png'],
  ['Galaxy A57', 'ToughCases Samsung A57.png'],
  ['Pixel 9', 'ToughCases Google Pixel 9.png'],
  ['Pixel 9 Pro', 'ToughCases Google Pixel 9 Pro.png'],
  ['Pixel 9 Pro XL', 'ToughCases Google Pixel 9 Pro XL.png'],
  ['Pixel 9a', 'ToughCases Google Pixel 9a.png'],
  ['Pixel 10', 'ToughCases Google Pixel 10.png'],
  ['Pixel 10 Pro XL', 'ToughCases Google Pixel 10 Pro XL.png'],
]

/**
 * Templates still to come. The shop checks whether each of these files is
 * in public/phoneCases and hides the model until it is
 * (lib/store-modules/casecraft/server.ts → missingTemplates), so a model
 * can be listed before its template exists. Empty = nothing waiting.
 */
export const AWAITING_TEMPLATES: string[] = []

// "Classic series" — SPOKE. 32 templates.
const TOUGH_PHONE_CASES: [string, string][] = [
  ['iPhone 5 & 5s & 5se', 'Tough Phone Cases iPhone 5 & 5s & 5se.png'],
  ['iPhone 6 & 6s', 'Tough Phone Cases iPhone 6 & 6s.png'],
  ['iPhone 6 & 6s Plus', 'Tough Phone Cases iPhone 6 & 6s Plus.png'],
  ['iPhone 7 & 8', 'Tough Phone Cases iPhone 7 & 8.png'],
  ['iPhone 7 & 8 Plus', 'Tough Phone Cases iPhone 7 & 8 Plus.png'],
  ['iPhone 12 & 12 Pro', 'Tough Phone Cases iPhone 12 & 12 Pro.png'],
  // The template itself says "iPhone XS MAX" (the file name is the supplier's).
  ['iPhone XS Max', 'Tough Phone Cases iPhone X MAX.png'],
  ['iPhone X', 'Tough Phone Cases iPhone X.png'],
  ['iPhone XR', 'Tough Phone Cases iPhone XR.png'],
  ['iPhone XS', 'Tough Phone Cases iPhone XS.png'],
  ['iPhone 11', 'Tough Phone Cases iPhone 11.png'],
  ['iPhone 11 Pro', 'Tough Phone Cases iPhone 11 Pro.png'],
  ['iPhone 11 Pro Max', 'Tough Phone Cases iPhone 11 Pro Max.png'],
  ['iPhone 12 Mini', 'Tough Phone Cases iPhone 12 Mini.png'],
  ['iPhone 12 Pro Max', 'Tough Phone Cases iPhone 12 Pro Max.png'],
  ['iPhone 13', 'Tough Phone Cases iPhone 13.png'],
  ['iPhone 13 Mini', 'Tough Phone Cases iPhone 13 Mini.png'],
  ['iPhone 13 Pro', 'Tough Phone Cases iPhone 13 Pro.png'],
  ['iPhone 13 Pro Max', 'Tough Phone Cases iPhone 13 Pro Max.png'],
  ['iPhone 14', 'Tough Phone Cases iPhone 14.png'],
  ['iPhone 14 Plus', 'Tough Phone Cases iPhone 14 Plus.png'],
  ['iPhone 14 Pro', 'Tough Phone Cases iPhone 14 Pro.png'],
  ['iPhone 14 Pro Max', 'Tough Phone Cases iPhone 14 Pro Max.png'],
  ['iPhone 15', 'Tough Phone Cases iPhone 15.png'],
  ['iPhone 15 Plus', 'Tough Phone Cases iPhone 15 Plus.png'],
  ['iPhone 15 Pro', 'Tough Phone Cases iPhone 15 Pro.png'],
  ['iPhone 15 Pro Max', 'Tough Phone Cases iPhone 15 Pro Max.png'],
  ['Galaxy S6', 'Tough Phone Cases Samsung S6.png'],
  ['Galaxy S21', 'Tough Phone Cases Samsung S21.png'],
  ['Galaxy S22', 'Tough Phone Cases Samsung S22.png'],
  ['Galaxy S23', 'Tough Phone Cases Samsung S23.png'],
  ['Galaxy S24', 'Tough Phone Cases Samsung S24.png'],
]

export const CASE_TYPES: CaseType[] = [
  {
    id: 'tough-cases',
    label: 'Tough Case',
    series: 'Modern series',
    tagline: 'Maximum protection, dual-layer build',
    description: 'Hard polycarbonate back with a soft rubber inner layer. Slim border and a ring around the camera.',
    models: build(TOUGH_CASES),
  },
  {
    id: 'tough-phone-cases',
    label: 'Tough Phone Case',
    series: 'Classic series',
    tagline: 'The original tough case, heavier border',
    description: 'The same dual-layer hard shell with a heavier border and a large camera cut-out.',
    models: build(TOUGH_PHONE_CASES),
  },
]

export function getCaseType(id: string | null | undefined): CaseType | null {
  return CASE_TYPES.find((t) => t.id === id) ?? null
}

export function getModel(caseTypeId: string | null | undefined, label: string | null | undefined): CaseModel | null {
  return getCaseType(caseTypeId)?.models.find((m) => m.label === label) ?? null
}

export const BRANDS: { id: BrandId; label: string }[] = [
  { id: 'iphone', label: 'iPhone' },
  { id: 'samsung', label: 'Samsung' },
  { id: 'google', label: 'Google Pixel' },
]

export const TEMPLATES: { id: TemplateId; label: string; desc: string }[] = [
  { id: 'full', label: 'Full cover', desc: 'Edge-to-edge print' },
  { id: 'centered', label: 'Framed', desc: 'Photo with a white border' },
  { id: 'top', label: 'Top half', desc: 'Photo on the upper half only' },
]

export function getTemplate(id: string | null | undefined) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
}

/** Public URL of a model's template overlay. */
export function templateSrc(model: Pick<CaseModel, 'file'>): string {
  return `/phoneCases/${encodeURIComponent(model.file)}`
}

/**
 * The clean preview layers cut from a model's template (public/phoneCases/
 * clean/, made by scripts/casecraft-clean-templates.py):
 *   mask    white where the case back is — the photo is clipped to it
 *   camera  the camera cut-out filled dark, to lay on top
 * Same canvas size as the template, so they line up with it exactly.
 */
export function cleanTemplateSrc(model: Pick<CaseModel, 'file'>): { mask: string; camera: string } {
  const base = `/phoneCases/clean/${encodeURIComponent(model.file.replace(/\.png$/i, ''))}`
  return { mask: `${base}.mask.png`, camera: `${base}.camera.png` }
}

/** Key used to switch one model of one case type off. */
export function modelKey(caseTypeId: CaseTypeId, label: string): string {
  return `${caseTypeId}|${label}`
}

/** Old model names → current ones, so saved settings keep working after a rename. */
export const RENAMED_MODELS: Record<string, string> = {
  'tough-phone-cases|iPhone X MAX': 'tough-phone-cases|iPhone XS Max',
}
