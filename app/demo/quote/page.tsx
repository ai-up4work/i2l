// app/demo/quote/page.tsx
//
// The quote calculator, kept at its old /demo/quote address because
// product pages link here ("see price breakdown"). It used to be a
// separate, older copy with its own hardcoded rates; it now renders the
// one calculator (app/admin/(protected)/(common)/quote/page.tsx), which
// starts from the live Pricing engine rates.
export { default } from '@/app/admin/(protected)/(common)/quote/page'
