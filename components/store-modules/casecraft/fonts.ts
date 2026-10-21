// components/store-modules/casecraft/fonts.ts
//
// Decorative fonts for the text on a custom case (compose.ts TEXT_FONTS).
// next/font downloads them at build time and serves them from this site;
// each one is only fetched by the browser when it's actually drawn.
// The builder puts `caseFontVariables` on its wrapper, so the preview, the
// font picker and the print renderer (which reads the variables from the
// element marked data-casecraft-fonts) all use the same fonts.
import {
  Abril_Fatface,
  Bebas_Neue,
  Caveat,
  Cinzel,
  Dancing_Script,
  Great_Vibes,
  Lobster,
  Monoton,
  Pacifico,
  Permanent_Marker,
  Playfair_Display,
  Sacramento,
} from 'next/font/google'

const greatVibes = Great_Vibes({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--cc-font-great-vibes' })
const dancing = Dancing_Script({ subsets: ['latin'], display: 'swap', preload: false, weight: '700', variable: '--cc-font-dancing' })
const pacifico = Pacifico({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--cc-font-pacifico' })
const sacramento = Sacramento({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--cc-font-sacramento' })
const lobster = Lobster({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--cc-font-lobster' })
const playfair = Playfair_Display({ subsets: ['latin'], display: 'swap', preload: false, weight: '700', style: 'italic', variable: '--cc-font-playfair' })
const cinzel = Cinzel({ subsets: ['latin'], display: 'swap', preload: false, weight: '700', variable: '--cc-font-cinzel' })
const bebas = Bebas_Neue({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--cc-font-bebas' })
const abril = Abril_Fatface({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--cc-font-abril' })
const marker = Permanent_Marker({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--cc-font-marker' })
const caveat = Caveat({ subsets: ['latin'], display: 'swap', preload: false, weight: '700', variable: '--cc-font-caveat' })
const monoton = Monoton({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--cc-font-monoton' })

export const caseFontVariables = [greatVibes, dancing, pacifico, sacramento, lobster, playfair, cinzel, bebas, abril, marker, caveat, monoton]
  .map((f) => f.variable)
  .join(' ')
