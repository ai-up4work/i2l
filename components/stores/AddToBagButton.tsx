'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, Check } from 'lucide-react';
import type { StoreProduct } from '@/lib/store.types';

// Mirrors the cart helpers inside StoreCatalogClient.tsx — same sessionStorage
// key (`store_cart_${platform}`) and the same 'store_cart_updated' event.
// Duplicated rather than imported; worth extracting to lib/store-cart.ts if
// a third consumer of the cart ever shows up. NOTE: StoreCatalogClient's
// cart items don't carry selectedOptions yet — its mini-cart will show
// variant-selected items as plain products until it's updated to match.
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

  const handleAdd = () => {
    const current = readCart(platform);
    const idx = current.findIndex(
      (i) => i.id === product.id && sameOptions(i.selectedOptions, selectedOptions)
    );
    const next =
      idx >= 0
        ? current.map((i, n) => (n === idx ? { ...i, qty: i.qty + quantity } : i))
        : [...current, { ...product, qty: quantity, selectedOptions }];
    writeCart(platform, next);
    setAdded(true);
  };

  const optionsSummary = selectedOptions ? Object.values(selectedOptions).join(', ') : undefined;

  if (added) {
    return (
      <div
        className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 ${compact ? '' : 'mt-6'}`}
      >
        <div
          className={`flex items-center justify-center gap-2 rounded-xl bg-teal/10 px-5 text-sm font-bold text-teal-deep ${
            compact ? 'h-12' : 'py-3.5'
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