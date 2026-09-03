// lib/color-swatches.ts

/**
 * Fashion/apparel color terms that are common on storefronts but are NOT
 * valid CSS color keywords (e.g. "Burgundy", "Mustard", "Sage") — mapped to
 * a representative hex. Keys are lowercased, trimmed, with internal
 * whitespace collapsed to a single space (so "Off  White" and "off-white"
 * both normalise the same way — see normaliseColorKey below).
 *
 * Extend this list as new color names turn up from stores rather than
 * leaving them to fall through to the "unknown" pattern swatch.
 */
const FASHION_COLOR_MAP: Record<string, string> = {
  burgundy: '#6d2331',
  wine: '#722f37',
  maroon: '#800000',
  mustard: '#e1ad01',
  sage: '#9caf88',
  olive: '#708238',
  khaki: '#c3b091',
  camel: '#c19a6b',
  tan: '#d2b48c',
  beige: '#f5f5dc',
  cream: '#fffdd0',
  ivory: '#fffff0',
  'off white': '#f8f5ef',
  charcoal: '#36454f',
  slate: '#708090',
  navy: '#1a2744',
  'royal blue': '#4169e1',
  cobalt: '#0047ab',
  teal: '#008080',
  turquoise: '#40e0d0',
  mint: '#98ff98',
  emerald: '#50c878',
  forest: '#228b22',
  'forest green': '#228b22',
  rust: '#b7410e',
  terracotta: '#e2725b',
  coral: '#ff7f50',
  salmon: '#fa8072',
  peach: '#ffdab9',
  blush: '#de5d83',
  mauve: '#e0b0ff',
  lilac: '#c8a2c8',
  lavender: '#e6e6fa',
  plum: '#8e4585',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  gold: '#d4af37',
  mustard_yellow: '#e1ad01',
  silver: '#c0c0c0',
  chocolate: '#7b3f00',
  espresso: '#4b3621',
  taupe: '#483c32',
  denim: '#1560bd',
  'sky blue': '#87ceeb',
  'baby blue': '#89cff0',
  'baby pink': '#f4c2c2',
  'dusty pink': '#d8a7b1',
  'hot pink': '#ff69b4',
  wine_red: '#722f37',
  'royal purple': '#7851a9',
  indigo: '#3f00ff',
  mocha: '#7b5c4b',
  sand: '#c2b280',
  stone: '#928e85',
  pewter: '#899499',
  copper: '#b87333',
  bronze: '#cd7f32',
  champagne: '#f7e7ce',
  nude: '#e3bc9a',
};

// Standard CSS Level-4 named colors that a browser already understands
// directly — no lookup needed, just pass the name straight through as
// `background-color`. This keeps the map above focused only on the terms
// that genuinely need translating.
const CSS_NAMED_COLORS = new Set([
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
  'pink', 'brown', 'gray', 'grey', 'cyan', 'lime', 'aqua', 'crimson',
  'chartreuse', 'darkred', 'darkgreen', 'darkblue', 'lightblue', 'lightgreen',
  'lightgray', 'lightgrey', 'darkgray', 'darkgrey', 'hotpink', 'deeppink',
  'orchid', 'violet', 'indigo', 'turquoise', 'coral', 'salmon', 'khaki',
  'tan', 'beige', 'ivory', 'olive', 'maroon', 'navy', 'teal', 'gold',
  'silver', 'chocolate', 'peru', 'sienna', 'firebrick', 'tomato',
  'goldenrod', 'plum', 'orchid', 'thistle', 'wheat', 'lavender', 'mintcream',
  'seagreen', 'forestgreen', 'royalblue', 'steelblue', 'skyblue', 'slateblue',
  'slategray', 'slategrey', 'dimgray', 'dimgrey', 'gainsboro', 'linen',
  'cornsilk', 'bisque', 'moccasin', 'peachpuff', 'sandybrown', 'saddlebrown',
  'rosybrown', 'lightpink', 'lightsalmon', 'lightyellow', 'lightcyan',
  'lightgoldenrodyellow', 'palegreen', 'paleturquoise', 'palevioletred',
  'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'midnightblue',
  'darkorange', 'darkviolet', 'darkslategray', 'darkslategrey', 'darkkhaki',
  'darkgoldenrod', 'darkorchid', 'darkmagenta', 'darkcyan', 'darksalmon',
  'darkturquoise', 'darkseagreen', 'crimson', 'fuchsia', 'magenta',
]);

function normaliseColorKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

/**
 * Returns a CSS-usable color value for a swatch, or null if the name is
 * genuinely unrecognized (e.g. "Assorted", "Multicolor", a size mistakenly
 * passed in, or a name too store-specific to guess at). Callers should
 * render a neutral/patterned fallback swatch when this returns null rather
 * than guessing further — a wrong-colored swatch is worse than an honest
 * "unknown" placeholder.
 */
export function getSwatchColor(name: string): string | null {
  const key = normaliseColorKey(name);
  if (FASHION_COLOR_MAP[key]) return FASHION_COLOR_MAP[key];

  const cssKey = key.replace(/\s+/g, '');
  if (CSS_NAMED_COLORS.has(cssKey)) return cssKey;

  // Loose match: "Dusty Pink Rose" contains "pink" etc. — try the longest
  // known key that appears as a whole word inside the given name, so
  // slightly-decorated names (store adds a suffix/prefix) still resolve.
  const words = key.split(' ');
  for (const word of words) {
    if (FASHION_COLOR_MAP[word]) return FASHION_COLOR_MAP[word];
    if (CSS_NAMED_COLORS.has(word)) return word;
  }

  return null;
}