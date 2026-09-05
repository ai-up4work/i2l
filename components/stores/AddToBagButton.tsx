'use client';

import { useEffect, useState } from 'react';
import { ShoppingBag, Check } from 'lucide-react';
import { useCart, type CartProduct } from '@/contexts/Cartcontext';
import type { StoreProduct } from '@/lib/store.types';

// Mirrors the cart helpers inside StoreCatalogClient.tsx — same sessionStorage
// key (`store_cart_${platform}`) and the same 'store_cart_updated' event.
// Duplicated rather than imported; worth extracting to lib/store-cart.ts if
// a third consumer of the cart ever shows up. NOTE: StoreCatalogClient's
// cart items don't carry selectedOptions yet — its mini-cart will show
// variant-selected items as plain products until it's updated to match.
//
// IMPORTANT: this sessionStorage cart is separate from CartContext (the
// one ItemInfoModal and the header's cart badge read from). This button
// used to only write to sessionStorage, so clicking "Add to bag" here
// never moved the header badge or showed up anywhere CartContext is the
// source of truth — it looked like the click did nothing. It now writes
// to BOTH: sessionStorage (unchanged, for StoreCatalogClient's mini-cart)
// and CartContext via `cart.addItem` (new, for the header badge / anything
// else reading from CartContext).
type CartItem = StoreProduct & { qty: number; selectedOptions?: Record<string, string> };

function cartKey(platform: string) {
  return `store_cart_${platform}`;
}
function readCart(platform: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(cartKey(platform)) ?? '[]');
  } catch {
    return [];
  }
}
function writeCart(platform: string, items: CartItem[]) {
  sessionStorage.setItem(cartKey(platform), JSON.stringify(items));
  window.dispatchEvent(new Event('store_cart_updated'));
}

/** Two option maps count as the "same variant" when they have the same
 * keys and values — order doesn't matter, so sort before comparing. */
function sameOptions(a?: Record<string, string>, b?: Record<string, string>) {
  const aKeys = Object.keys(a ?? {}).sort();
  const bKeys = Object.keys(b ?? {}).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => a![k] === b?.[k]);
}

/**
 * Builds the small serializable snapshot CartContext stores, out of the
 * already-fetched StoreProduct — same convention as the snapshot builders
 * in ProductActions/MarketplaceProductActions/ItemInfoModal, so an item
 * added from any of these places dedupes against the same identity key
 * instead of creating duplicate-looking lines for the same product.
 * When a variant is selected, the id/url are suffixed with the option
 * values so different variants of the same product get separate lines
 * here too, matching the sessionStorage cart's per-variant behavior.
 */
function toCartSnapshot(
  product: StoreProduct,
  platform: string,
  selectedOptions?: Record<string, string>
): CartProduct {
  const baseUrl = product.url || '';
  const baseId = baseUrl || `${platform}:${product.id}`;
  const variantSuffix = selectedOptions
    ? `:${Object.keys(selectedOptions)
        .sort()
        .map((k) => `${k}=${selectedOptions[k]}`)
        .join(',')}`
    : '';
  const id = `${baseId}${variantSuffix}`;
  return {
    id,
    url: baseUrl || id,
    site: platform,
    title: product.name,
    image: product.images?.[0] ?? product.image ?? null,
    currencyCode: product.currency ?? null,
    sourcePrice: product.price != null ? String(product.price) : null,
    estimatedPrice: null,
  };
}

export default function AddToBagButton({
  product,
  platform,
  quantity = 1,
  compact = false,
  selectedOptions,
  disabled = false,
}: {
  product: StoreProduct;
  platform: string;
  /** How many units to add per click. Defaults to 1 for existing callers
   * that don't pass it. */
  quantity?: number;
  /** Set true when rendering inline next to other controls (e.g. the
   * quantity stepper + wishlist row in ProductActions). */
  compact?: boolean;
  /** The variant the shopper picked, e.g. { Size: 'M', Color: 'Black' }.
   * Attached to the cart line so different variants of the same product
   * add as separate lines instead of merging quantities together. */
  selectedOptions?: Record<string, string>;
  /** Extra disable condition on top of !product.inStock — e.g. the
   * product has sizes/colors and the shopper hasn't picked one yet, or
   * picked a combination that isn't actually in stock. */
  disabled?: boolean;
}) {
  const [added, setAdded] = useState(false);
  const cart = useCart();

  // "Added to bag" is a brief confirmation, not a permanent state — reset
  // it after a bit so the button becomes clickable again. Without this,
  // once `added` flips true it stays true forever, and there's no way to
  // click again later to add more of the same item (e.g. bumping quantity
  // up after already adding it once).
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1800);
    return () => clearTimeout(timer);
  }, [added]);

  const handleAdd = () => {
    // Existing sessionStorage cart — unchanged, still feeds
    // StoreCatalogClient's mini-cart.
    const current = readCart(platform);
    const idx = current.findIndex(
      (i) => i.id === product.id && sameOptions(i.selectedOptions, selectedOptions)
    );
    const next =
      idx >= 0
        ? current.map((i, n) => (n === idx ? { ...i, qty: i.qty + quantity } : i))
        : [...current, { ...product, qty: quantity, selectedOptions }];
    writeCart(platform, next);

    // New: also write to CartContext, so the header cart badge and any
    // other CartContext consumer actually reflect this add.
    cart.addItem(toCartSnapshot(product, platform, selectedOptions), quantity);

    setAdded(true);
  };

  const optionsSummary = selectedOptions ? Object.values(selectedOptions).join(', ') : undefined;

  if (added) {
    return (
      <div
        className={`flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 ${compact ? '' : 'mt-6'}`}
      >
        <div
          className={`flex w-full items-center justify-center gap-2 rounded-xl bg-teal/10 px-5 text-sm font-bold text-teal-deep ${
            compact ? 'h-12' : 'py-3.5 sm:w-auto sm:px-8'
          }`}
        >
          <Check size={16} /> Added to bag
          {quantity > 1 ? ` (${quantity})` : ''}
          {optionsSummary ? ` · ${optionsSummary}` : ''}
        </div>
        {/* <Link
          href={`/stores/${platform}`}
          className="text-xs font-semibold text-ink/50 underline hover:text-ink hover:no-underline"
        >
          Continue shopping
        </Link> */}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={!product.inStock || disabled}
      className={`flex items-center justify-center gap-2 rounded-xl bg-teal px-5 text-sm font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-40 disabled:pointer-events-none ${
        compact ? 'h-12 w-full' : 'mt-6 w-full py-3.5 sm:w-auto sm:px-8'
      }`}
    >
      <ShoppingBag size={16} />
      {product.inStock ? `Add to bag${quantity > 1 ? ` (${quantity})` : ''}` : 'Sold out'}
    </button>
  );
}