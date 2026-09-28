// Single source of truth for the temporary Economy lock. Import this in
// page.tsx, ProductPurchasePanel and the cart page's DeliveryModeToggle so
// they all flip together. To re-enable Economy: set to false.
export const ECONOMY_LOCKED = true

/**
 * Result of resolving the shopper's size/color selection to a variant.
 *  - not-applicable: nothing to resolve (marketplace, no variants, or
 *    the size/color lists are informational only)
 *  - incomplete: a required size/color hasn't been picked yet
 *  - match: a specific variant was found
 *  - none: fully selected, but no variant exists for that combination
 */
export type VariantStatus = 'not-applicable' | 'incomplete' | 'match' | 'none'