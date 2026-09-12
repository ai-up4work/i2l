// components/shared/headerMetrics.ts
//
// Single source of truth for header notch geometry, shared between
// Header.tsx (which draws the notch shape) and ShopMegaMenu.tsx (whose
// panel hinges off the bottom edge of the narrow/INNER_H part of it).
//
// IMPORTANT: this file must never import from Header.tsx or anything
// that imports from Header.tsx. Header.tsx imports FROM here, so any
// import going the other direction creates a circular alias for
// INNER_H (TS2303) — these constants have to be leaves in the import
// graph, not round-trip through the component that consumes them.
export const OUTER_H = 68   // side wings — thick part of the header
export const INNER_H = 54   // middle strip where "Shop" sits — narrow part
export const LEFT_NOTCH = 320
export const NOTCH_GAP = 40