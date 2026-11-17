/** Shared lightweight language helpers used by the parser and the quiz generator. */

const w = (s: string) => new Set(s.split(/\s+/).filter(Boolean))

export const ARTICLES = w('a an the')

/** Words that can never validly END a term, definition or answer option. */
export const DANGLING_WORDS = w(`
  a an the
  of to in on at by for with from through into onto over under about between among during after before
  as than via per upon within without against toward towards across along
  and or but nor yet because while although though whereas if when since unless until whether
  that which who whom whose
  is are was were be been being has have had do does did will would can could may might must shall should
  such also not
`)

/** Words a candidate TERM may not start with (transition / conjunction / stop words). */
export const STOP_START = w(`
  while although though however therefore when if because since this that these those it its they them
  there here he she we you i which what where who why how in on at for to with by as so but and or then
  thus hence moreover furthermore instead rather whether unless until after before during also such some
  many most each every both another other once
`)

/** Auxiliary / modal verbs: a clean noun-phrase term never contains these. */
export const AUX_WORDS = w(
  'is are was were be been being has have had does do did will would can could may might must shall should',
)

/** A few common verbs that signal "this is a sentence fragment, not a term". */
export const VERBISH = w(`
  focuses involves includes means helps allows uses provides ensures requires makes takes gives leads
  results causes refers describes represents contains consists emphasizes encompasses
`)

const TERMINAL_RE = /[.?!]["'”’)\]]*$/

export function hasTerminalPunctuation(text: string): boolean {
  return TERMINAL_RE.test(text.trim())
}

function lastWordOf(text: string): string {
  const parts = text.trim().replace(/[,;:\s–—-]+$/, '').split(/\s+/)
  return (parts[parts.length - 1] ?? '').toLowerCase().replace(/[^\p{L}']/gu, '')
}

/** True when the text stops mid-clause (…"through the", "might"). Terminal punctuation = complete. */
export function endsDangling(text: string): boolean {
  const t = text.trim()
  if (!t || TERMINAL_RE.test(t)) return false
  return DANGLING_WORDS.has(lastWordOf(t))
}

/** True when a sentence looks cut off: no terminal punctuation AND dangling word or trailing comma. */
export function looksTruncated(text: string): boolean {
  const t = text.trim()
  if (!t || TERMINAL_RE.test(t)) return false
  return /[,;:–—-]$/.test(t) || DANGLING_WORDS.has(lastWordOf(t))
}

export function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Lower-case the first letter unless the word is an acronym / proper-looking (e.g. "TCP", "DNS"). */
export function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s
}
