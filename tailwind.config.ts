import type { Config } from 'tailwindcss'

/**
 * Design tokens for WishDrop 
 * ------------------------------------------------------------------
 * Palette is drawn from postal & customs ephemera (ink, airmail
 * envelopes, wax stamps) rather than a generic brand-blue/teal duo.
 *
 *  ink    #1C1A17  primary text / dark surfaces
 *  paper  #F7F3EA  page background (warm, uncoated paper)
 *  card   #FCFAF5  raised surfaces on top of paper
 *  blue   #1E3A5F  "airmail" blue, secondary ink
 *  rust   #C1272D  "airmail" red, accent / alerts
 *  gold   #D98E2B  customs-stamp gold, primary accent
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1C1A17',
        paper: '#F7F3EA',
        card: '#FCFAF5',
        blue: {
          DEFAULT: '#1E3A5F',
          deep: '#122A47',
        },
        rust: {
          DEFAULT: '#C1272D',
        },
        gold: {
          DEFAULT: '#D98E2B',
          soft: '#F6E4C2',
        },
        muted: '#8A8578',
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        airmail:
          'repeating-linear-gradient(45deg, #C1272D 0 10px, #F7F3EA 10px 20px, #1E3A5F 20px 30px, #F7F3EA 30px 40px)',
        'airmail-soft':
          'repeating-linear-gradient(45deg, #C1272D 0 8px, transparent 8px 16px, #1E3A5F 16px 24px, transparent 24px 32px)',
      },
      boxShadow: {
        lift: '0 25px 60px -25px rgba(28, 26, 23, 0.35)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}

export default config
