// lib/scrape/normalize-description.ts
//
// Cleans up a scraped product description into something safe and
// legible to render inside OUR OWN theme, instead of the merchant's.
//
// WHY THIS EXISTS: a Shopify (or similar) `fullDescription` is the
// merchant's raw marketing body_html — see the boAt Airdopes 141
// sample this was written against. That HTML is full of things that
// only make sense on the merchant's own page:
//   - hard-coded `color: #ffffff` text meant to sit on a dark
//     background-image banner div — invisible if rendered as-is on our
//     light theme, since we don't carry over their background.
//   - purely decorative spacer divs whose only content is a `<br>`.
//   - a real, useful specifications <table> buried in the middle of
//     all that marketing chrome.
//   - an FAQ block, including some entries the merchant deliberately
//     hid (`style="display: none"`) that shouldn't resurface for us.
//   - lazy-loaded `<img data-src="...">` tags whose `src` is empty,
//     because the merchant's own lazy-load script (which we don't run)
//     was responsible for swapping it in.
//
// This module strips the presentational noise, pulls the spec table
// and FAQ pairs out into structured data, and returns clean, minimal
// HTML for the remaining prose — so a caller like ProductInfoTabs can
// render prose / specs / FAQs as separate, properly styled sections
// instead of dumping one raw sanitized blob.
//
// BROWSER-ONLY: this relies on DOMParser + DOMPurify, both of which
// need `window`. Call it from client components only. If it somehow
// runs during SSR, it degrades gracefully (regex-stripped plain text,
// no crash) rather than throwing.

import DOMPurify from 'dompurify'

export type NormalizedSpec = { name: string; value: string }
export type NormalizedFaq = { question: string; answer: string }

export type NormalizedDescription = {
  /** Clean, sanitized prose HTML — safe to render directly. Specs and
   * FAQ content (see below) have been pulled OUT of this so they don't
   * show up twice. Empty string if nothing usable was found. */
  html: string
  /** Same content as `html`, fully stripped of markup and with
   * whitespace collapsed to single spaces. Handy for previews, search
   * indexing, or as a fallback when `html` ends up empty. */
  text: string
  /** Specification rows pulled out of any <table> in the source HTML,
   * e.g. from a "Specifications" section. Shaped to match
   * ScrapeResult['itemSpecifics'] (`{ name, value }`) so callers can
   * concatenate the two directly when rendering a Details tab. */
  specs: NormalizedSpec[]
  /** Question/answer pairs pulled out of an FAQ block, when the source
   * HTML follows the common "question element with a *ques* class next
   * to an *ans* class" convention (see QUES_CLASS_HINT /
   * ANS_CLASS_HINT below). Entries the merchant marked hidden
   * (style="display: none") are dropped, not surfaced — both the
   * question AND its paired answer, so no orphaned answer text leaks
   * into the prose HTML either. */
  faqs: NormalizedFaq[]
}

const EMPTY_RESULT: NormalizedDescription = { html: '', text: '', specs: [], faqs: [] }

// Loose class-name hints rather than an exact match against
// "product-ques"/"product-ans" (the boAt-specific names), since other
// Shopify themes name these differently but tend to keep "ques"/"ans"
// somewhere in the class list (e.g. "faq-question", "accordion-ans").
const QUES_CLASS_HINT = /ques/i
const ANS_CLASS_HINT = /ans/i

// Tags kept as-is in the final prose HTML (content preserved, tag
// preserved). Everything else is either unwrapped (content kept, tag
// dropped — DIV/SPAN, pure layout wrappers) or removed outright with
// its content (SCRIPT/STYLE/IFRAME/etc, and any leftover TABLE once
// specs have been extracted from it).
const KEEP_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'H2', 'H3', 'H4', 'A', 'IMG'])
const UNWRAP_TAGS = new Set(['DIV', 'SPAN', 'SECTION', 'ARTICLE'])
// Removed with all their content — scripts/styles are unsafe or
// meaningless here, and any table still present after spec-extraction
// is decorative (image/caption grids) rather than real tabular data.
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'FORM', 'BUTTON', 'INPUT', 'SVG', 'TABLE'])

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** SSR / no-DOM fallback: strip tags with a regex instead of crashing.
 * Loses structure (no specs/faqs extraction, no real HTML) but is safe
 * to call from anywhere. */
function fallbackNormalize(source: string): NormalizedDescription {
  const text = collapseWhitespace(source.replace(/<[^>]*>/g, ' '))
  return { html: text ? `<p>${escapeHtml(text)}</p>` : '', text, specs: [], faqs: [] }
}

/** Turns the flat `description` field (plain text, newline-separated —
 * see ScrapeResult['description'] on a Shopify result) into paragraph
 * HTML. Used as a fallback when there's no `fullDescription` to work
 * with, or as the seed source in a non-browser context. */
function paragraphsFromPlainText(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

/** True if `el` or any ancestor was explicitly hidden by the merchant
 * (style="display: none") — used to drop FAQ entries they'd already
 * suppressed on their own page, e.g. duplicate/legacy Q&A blocks. */
function isHiddenByInlineStyle(el: Element): boolean {
  let node: Element | null = el
  while (node) {
    const style = node.getAttribute('style')
    if (style && /display\s*:\s*none/i.test(style)) return true
    node = node.parentElement
  }
  return false
}

/** Finds the answer element paired with a question element: the first
 * ans-hinted element among its own following siblings, or (failing
 * that) among its parent's descendants — covers both "question and
 * answer are siblings" and "question and answer share a wrapping
 * container" markup shapes. Shared by both the normal extraction path
 * and the hidden-question cleanup path below, so a hidden question's
 * answer is found the same way a visible one's is. */
function findPairedAnswer(qEl: Element): Element | null {
  let sib = qEl.nextElementSibling
  while (sib) {
    if (ANS_CLASS_HINT.test(sib.className)) return sib
    sib = sib.nextElementSibling
  }
  if (qEl.parentElement) {
    return (
      Array.from(qEl.parentElement.querySelectorAll('*')).find((el) => el !== qEl && ANS_CLASS_HINT.test(el.className)) ?? null
    )
  }
  return null
}

/** Pulls every <table>'s rows into flat {name, value} spec entries (2
 * columns assumed — label, value), skipping rows that don't have
 * usable text in both cells. Tables themselves are left in the DOM
 * here; DROP_TAGS removes them in the later cleanup pass so they don't
 * also get rendered as raw prose. */
function extractSpecs(root: Element): NormalizedSpec[] {
  const specs: NormalizedSpec[] = []
  root.querySelectorAll('table').forEach((table) => {
    table.querySelectorAll('tr').forEach((row) => {
      const cells = Array.from(row.querySelectorAll('td, th'))
      if (cells.length < 2) return
      const name = collapseWhitespace(cells[0].textContent ?? '')
      const value = collapseWhitespace(cells[1].textContent ?? '')
      if (!name || !value || name === value) return
      specs.push({ name, value })
    })
  })
  return specs
}

/** Pulls Q/A pairs out via the ques/ans class-name convention (see
 * QUES_CLASS_HINT/ANS_CLASS_HINT). For each question element found:
 * if it (or an ancestor) was explicitly hidden by the merchant, both
 * it AND its paired answer are removed from the DOM without being
 * added to `faqs` — dropping only the question here would leave the
 * answer's text to fall through as unstructured prose once the DOM is
 * walked for the description HTML. Otherwise, the pair is recorded and
 * then removed from the DOM (along with their shared wrapper, if it
 * held nothing else) so this content doesn't also leak into the prose
 * HTML. A leading "Q." / "Q:" label on the question text is trimmed
 * for display. */
function extractFaqs(root: Element): NormalizedFaq[] {
  const faqs: NormalizedFaq[] = []
  const questionEls = Array.from(root.querySelectorAll('*')).filter((el) => QUES_CLASS_HINT.test(el.className))

  for (const qEl of questionEls) {
    const answerEl = findPairedAnswer(qEl)

    if (isHiddenByInlineStyle(qEl)) {
      qEl.remove()
      answerEl?.remove()
      continue
    }

    const question = collapseWhitespace(qEl.textContent ?? '').replace(/^Q[.:]\s*/i, '')
    const answer = answerEl ? collapseWhitespace(answerEl.textContent ?? '') : ''
    if (question && answer) faqs.push({ question, answer })

    const wrapper = qEl.parentElement
    qEl.remove()
    answerEl?.remove()
    if (wrapper && wrapper !== root && collapseWhitespace(wrapper.textContent ?? '') === '') {
      wrapper.remove()
    }
  }

  return faqs
}

/** Strips every inline `style` attribute in the subtree — the single
 * biggest source of theme-breaking content (white-on-white text,
 * oversized fixed-height banners, etc). Presentation is the app's job,
 * not the merchant's page. */
function stripInlineStyles(root: Element): void {
  root.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'))
}

/** Promotes lazy-load `data-src` to a real `src` on <img> elements that
 * don't already have one — common in themes (like boAt's) that only
 * fill `src` via their own on-page lazy-load script, which we don't
 * run. Images with neither are dropped in the walk below. */
function fixLazyImages(root: Element): void {
  root.querySelectorAll('img').forEach((img) => {
    if (!img.getAttribute('src')) {
      const dataSrc = img.getAttribute('data-src')
      if (dataSrc) img.setAttribute('src', dataSrc)
    }
  })
}

/** Walks the tree bottom-up: keeps KEEP_TAGS as-is (after attribute
 * stripping), unwraps UNWRAP_TAGS (drops the tag, keeps children in
 * place), and removes DROP_TAGS entirely (tag + content). Anything not
 * explicitly categorized is unwrapped, so an unfamiliar tag never
 * silently deletes real text. */
function normalizeStructure(root: Element, doc: Document): void {
  const elements = Array.from(root.querySelectorAll('*'))
  // Bottom-up (deepest first) so unwrapping a parent doesn't invalidate
  // references to children still queued for processing.
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]
    const tag = el.tagName

    if (DROP_TAGS.has(tag)) {
      el.remove()
      continue
    }

    if (KEEP_TAGS.has(tag)) {
      if (tag === 'A') {
        const href = el.getAttribute('href')
        Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name))
        if (href) {
          el.setAttribute('href', href)
          el.setAttribute('target', '_blank')
          el.setAttribute('rel', 'noopener noreferrer')
        }
      } else if (tag === 'IMG') {
        const src = el.getAttribute('src')
        const alt = el.getAttribute('alt') ?? ''
        Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name))
        if (src) {
          el.setAttribute('src', src)
          el.setAttribute('alt', alt)
        } else {
          el.remove()
        }
      } else {
        Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name))
      }
      continue
    }

    // UNWRAP_TAGS and anything unrecognized: replace the element with
    // its own children, keeping their content in the same position.
    const parent = el.parentNode
    if (!parent) continue
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  }
  void doc
}

/** Drops now-empty elements left behind after structure normalization
 * (e.g. a <p> whose only child was a banner <img> that got removed for
 * having no resolvable src) — repeats until a pass removes nothing,
 * since emptying a child can newly-empty its parent. BR is exempt: a
 * lone <br> can be a legitimate line break mid-paragraph, so this pass
 * never judges it "empty" on its own — see stripLeadingTrailingBreaks
 * below for the narrower cleanup that *does* target stray <br>s, but
 * only at the very start/end of the document. */
function removeEmptyElements(root: Element): void {
  let removedAny = true
  while (removedAny) {
    removedAny = false
    root.querySelectorAll(Array.from(KEEP_TAGS).join(',')).forEach((el) => {
      if (el.tagName === 'BR' || el.tagName === 'IMG') return
      const hasImg = el.querySelector('img') != null
      const hasText = collapseWhitespace(el.textContent ?? '') !== ''
      if (!hasImg && !hasText) {
        el.remove()
        removedAny = true
      }
    })
  }
}

/** Removes standalone `<br>`s (and pure-whitespace text nodes) sitting
 * at the very start or end of the root — leftover from decorative
 * spacer <div>s whose only content was a <br>, which normalizeStructure
 * correctly unwraps (dropping the div) but leaves the inner <br>
 * behind, and which removeEmptyElements deliberately never touches
 * (BR is exempt there since a <br> mid-paragraph is legitimate). Only
 * trims the two edges, so a <br> used for a real line break inside the
 * body content is left untouched. */
function stripLeadingTrailingBreaks(root: Element): void {
  const isWhitespaceText = (node: ChildNode) => node.nodeType === Node.TEXT_NODE && !(node.textContent ?? '').trim()
  const trimEdge = (fromStart: boolean) => {
    let node = fromStart ? root.firstChild : root.lastChild
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR') {
        root.removeChild(node)
      } else if (isWhitespaceText(node)) {
        root.removeChild(node)
      } else {
        break
      }
      node = fromStart ? root.firstChild : root.lastChild
    }
  }
  trimEdge(true)
  trimEdge(false)
}

/**
 * Main entry point. Prefers `fullDescription` (raw merchant HTML) when
 * present; falls back to the flat `description` field (plain text)
 * otherwise. Returns EMPTY_RESULT if neither has anything usable.
 */
export function normalizeDescription(
  fullDescription: string | null | undefined,
  plainDescription?: string | null,
): NormalizedDescription {
  const source = fullDescription?.trim() || (plainDescription ? paragraphsFromPlainText(plainDescription.trim()) : '')
  if (!source) return EMPTY_RESULT

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return fallbackNormalize(source.replace(/<[^>]*>/g, ' '))
  }

  const doc = new DOMParser().parseFromString(source, 'text/html')
  const root = doc.body

  const specs = extractSpecs(root)
  const faqs = extractFaqs(root)
  stripInlineStyles(root)
  fixLazyImages(root)
  normalizeStructure(root, doc)
  removeEmptyElements(root)
  stripLeadingTrailingBreaks(root)

  const rawHtml = root.innerHTML
  const html = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: Array.from(KEEP_TAGS),
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt'],
  })
  const text = collapseWhitespace(root.textContent ?? '')

  return { html, text, specs, faqs }
}