'use client';

import { useEffect, useState } from 'react';
import { ShoppingBag, Check } from 'lucide-react';
import { useCart, type CartProduct } from '@/contexts/Cartcontext';
import type { StoreProduct } from '@/lib/store.types';

type CartItem = StoreProduct & {
  qty: number;
  selectedOptions?: Record<string, string>;
};

function cartKey(platform: string) {
  return `store_cart_${platform}`;
}

function readCart(platform: string): CartItem[] {
  if (typeof window === 'undefined') return [];

  try {
    return JSON.parse(
      sessionStorage.getItem(cartKey(platform)) ?? '[]'
    );
  } catch {
    return [];
  }
}

function writeCart(platform: string, items: CartItem[]) {
  sessionStorage.setItem(cartKey(platform), JSON.stringify(items));
  window.dispatchEvent(new Event('store_cart_updated'));
}

/**
 * Two option maps count as the "same variant" when they have the same
 * keys and values — order doesn't matter, so sort before comparing.
 */
function sameOptions(
  a?: Record<string, string>,
  b?: Record<string, string>
) {
  const aKeys = Object.keys(a ?? {}).sort();
  const bKeys = Object.keys(b ?? {}).sort();

  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((k) => a![k] === b?.[k]);
}

/**
 * Builds the small serializable snapshot CartContext stores.
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
    weightKg: product.weightKg ?? null,
    source: 'catalogue',
  };
}

export default function AddToBagButton({
  product,
  platform,
  quantity = 1,
  compact = false,
  selectedOptions,
  height = 'h-12',
  disabled = false,
}: {
  product: StoreProduct;
  platform: string;
  quantity?: number;
  compact?: boolean;
  selectedOptions?: Record<string, string>;
  height?: string;
  disabled?: boolean;
}) {
  const [added, setAdded] = useState(false);

  const cart = useCart();

  useEffect(() => {
    if (!added) return;

    const timer = setTimeout(() => setAdded(false), 1800);

    return () => clearTimeout(timer);
  }, [added]);

  const handleAdd = () => {
    const current = readCart(platform);

    const idx = current.findIndex(
      (i) =>
        i.id === product.id &&
        sameOptions(i.selectedOptions, selectedOptions)
    );

    const next =
      idx >= 0
        ? current.map((i, n) =>
            n === idx
              ? {
                  ...i,
                  qty: i.qty + quantity,
                }
              : i
          )
        : [
            ...current,
            {
              ...product,
              qty: quantity,
              selectedOptions,
            },
          ];

    writeCart(platform, next);

    cart.addItem(
      toCartSnapshot(product, platform, selectedOptions),
      quantity
    );

    setAdded(true);
  };

  const optionsSummary = selectedOptions
    ? Object.values(selectedOptions).join(', ')
    : undefined;

  // h-8 gets the compact glass treatment.
  const isGlass = height === 'h-8';

  const buttonStyle = isGlass
    ? 'border border-white/20 bg-white/10 text-white shadow-lg shadow-black/5 backdrop-blur-md hover:bg-white/20'
    : 'bg-teal text-white hover:bg-teal-deep';

  const addedStyle = isGlass
    ? 'border border-white/20 bg-white/10 text-white shadow-lg shadow-black/5 backdrop-blur-md'
    : 'bg-teal/10 text-teal-deep';

  if (added) {
    return (
      <div
        className={`flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 ${
          compact ? '' : 'mt-6'
        }`}
      >
        <div
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold ${
            compact
              ? height
              : `${height} sm:w-auto sm:px-8`
          } ${addedStyle}`}
        >
          <Check size={16} />

          Added to bag

          {quantity > 1 ? ` (${quantity})` : ''}

          {optionsSummary ? ` · ${optionsSummary}` : ''}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={!product.inStock || disabled}
      className={`flex items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-all disabled:pointer-events-none disabled:opacity-40 ${
        compact
          ? `${height} w-full`
          : `mt-6 w-full ${height} sm:w-auto sm:px-8`
      } ${buttonStyle}`}
    >
      <ShoppingBag size={16} />

      {product.inStock
        ? `Add to bag${quantity > 1 ? ` (${quantity})` : ''}`
        : 'Sold out'}
    </button>
  );
}
