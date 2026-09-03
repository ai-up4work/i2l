// lib/flag.ts

const REGIONAL_INDICATOR_BASE = 0x1f1e6; // codepoint for the regional-indicator "A"

/**
 * Converts a flag emoji (e.g. "🇱🇰") into its ISO 3166-1 alpha-2 code
 * (e.g. "LK"). Flag emojis aren't a single designed glyph — they're two
 * "regional indicator symbol" codepoints (U+1F1E6–U+1F1FF, one per
 * letter A–Z) that a font is expected to *ligature* into a flag picture.
 * That ligature step is exactly what's missing on browser/OS combos
 * without a color-emoji font installed, which is why the same emoji
 * renders as an actual flag on mobile but as bare letters ("LK") on some
 * desktops — same character, different font support.
 *
 * This just reverses that composition to recover the plain letters,
 * which we can then use to render a real flag *image* instead — one that
 * looks identical everywhere regardless of the visitor's font stack.
 *
 * Returns null for anything that isn't a clean two-codepoint regional-
 * indicator pair (already-plain text, a non-flag emoji, etc.), so callers
 * can fall back to rendering the original string as-is.
 */
export function isoCodeFromFlagEmoji(flag: string | null | undefined): string | null {
  if (!flag) return null;

  // Array.from is codepoint-aware (unlike .split(''), which would cut a
  // single flag emoji in half since each regional-indicator letter is
  // outside the basic multilingual plane / a surrogate pair in UTF-16).
  const codePoints = Array.from(flag);
  if (codePoints.length !== 2) return null;

  const letters = codePoints.map((char) => {
    const cp = char.codePointAt(0);
    if (cp == null || cp < REGIONAL_INDICATOR_BASE || cp > REGIONAL_INDICATOR_BASE + 25) return null;
    return String.fromCharCode(65 + (cp - REGIONAL_INDICATOR_BASE)); // 65 = 'A'
  });

  if (letters.some((l) => l === null)) return null;
  return letters.join('');
}