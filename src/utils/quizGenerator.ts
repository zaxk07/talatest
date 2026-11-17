import type {
  Concept,
  ConceptKind,
  Deck,
  Difficulty,
  Question,
  QuestionType,
  QuizConfig,
  Section,
  StudyGuide,
} from '../types'
import { isCloseEnough, normalize } from './fuzzy'
import {
  ARTICLES,
  AUX_WORDS,
  DANGLING_WORDS,
  STOP_START,
  VERBISH,
  capitalizeFirst,
  endsDangling,
  hasTerminalPunctuation,
  looksTruncated,
  lowerFirst,
} from './language'
import { shuffle, type Rng } from './seededRandom'

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function citationFor(section: Section): string {
  return `${section.source} › ${section.locator} — ${section.title}`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…'
}

/**
 * Shorten long text WITHOUT cutting a sentence mid-thought: only cut at a comma/semicolon boundary
 * that leaves a complete clause; otherwise keep the full text.
 */
export function shortenClause(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = Math.max(text.lastIndexOf(', ', max), text.lastIndexOf('; ', max))
  if (cut >= 40) {
    const head = text.slice(0, cut).trim()
    if (!endsDangling(head)) return head
  }
  return text
}

const BLANK = '_____'

/** Replace every occurrence of `term` (and optional variants) in a sentence with a blank. */
export function maskTerm(sentence: string, term: string, extras: string[] = []): string {
  let out = sentence
  const all = [term, ...extras].filter((t) => t.trim().length > 0).sort((a, b) => b.length - a.length)
  for (const t of all) {
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(t.trim())}(?:s|es)?(?![\\p{L}\\p{N}])`,
      'giu',
    )
    out = out.replace(re, BLANK)
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Validation                                                           */
/* ------------------------------------------------------------------ */

const BAD_LABELS = new Set([
  'note', 'notes', 'example', 'examples', 'e.g', 'tip', 'important', 'summary', 'remember',
  'key point', 'key points', 'advantages', 'disadvantages', 'benefits', 'drawbacks', 'types',
  'steps', 'goal', 'goals', 'overview', 'agenda', 'objectives', 'objective', 'definition',
  'definitions', 'review', 'question', 'questions', 'answer', 'answers', 'reference', 'references',
  'pros', 'cons', 'warning',
])

const MIN_DEFINITION = 25

function wordKey(w: string): string {
  return w.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, '')
}

/**
 * A valid term is a clean noun phrase or acronym: ≤ 6 words, no leading transition/stop word,
 * no trailing verb/preposition/article, no auxiliary or sentence-verb inside, no clause punctuation.
 */
export function isValidTerm(term: string): boolean {
  const t = term.trim()
  if (t.length < 2 || t.length > 60) return false
  const words = t.split(/\s+/)
  if (words.length > 6) return false
  if (/[,;:!?]/.test(t) || /\.(\s|$)/.test(t)) return false
  if (!/\p{L}/u.test(t) || /^[\d\s.,%-]+$/.test(t)) return false
  if (!/^[\p{L}\p{N}]/u.test(t)) return false
  const keys = words.map(wordKey)
  if (STOP_START.has(keys[0]) || ARTICLES.has(keys[0])) return false
  if (DANGLING_WORDS.has(keys[keys.length - 1])) return false
  if (keys.some((k) => AUX_WORDS.has(k) || VERBISH.has(k))) return false
  if (BAD_LABELS.has(t.toLowerCase())) return false
  return true
}

function cleanTerm(raw: string): string | null {
  let t = raw
    .trim()
    .replace(/^[\s"'“”‘’*_`]+|[\s"'“”‘’*_`]+$/g, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
  // A leading article is dropped ("The OSI model" -> "OSI model"), then the rest must be clean.
  t = t.replace(/^(?:the|a|an)\s+/i, '').replace(/[,;:]+$/, '').trim()
  return isValidTerm(t) ? t : null
}

/**
 * Returns a complete clause/noun phrase or null. Trailing punctuation is stripped; if the text is cut
 * off (dangling article/preposition/conjunction or trailing comma) it is trimmed back to the last
 * complete clause, or discarded when no clean clause remains.
 */
export function completeClause(raw: string, opts: { terminal?: boolean; min?: number } = {}): string | null {
  const min = opts.min ?? MIN_DEFINITION
  let d = raw.trim().replace(/\s+/g, ' ')
  const terminal = opts.terminal ?? hasTerminalPunctuation(d)
  d = d.replace(/[.!?]+["'”’)\]]*$/, '').replace(/[\s,;:–—-]+$/, '')
  const cutOff = !terminal && (/[,;:–—-]\s*$/.test(raw.trim()) || endsDangling(d))
  if (cutOff) {
    const idx = Math.max(d.lastIndexOf(', '), d.lastIndexOf('; '), d.lastIndexOf(': '))
    if (idx < 0) return null
    d = d.slice(0, idx).replace(/[\s,;:–—-]+$/, '')
    if (endsDangling(d)) return null
  }
  if (d.length < min) return null
  // A pronoun opener ("it avoids…") only makes sense next to its antecedent, not as a standalone answer.
  if (/^(?:it|its|they|their|this|that|these|those|he|she|which)\b/i.test(d)) return null
  if (STOP_START.has(wordKey(d.split(/\s+/)[0])) && /^(?:while|although|though|however|therefore|because|since)\b/i.test(d)) {
    return null // starts mid-argument ("While X ...") -> not a self-contained definition
  }
  return d
}

interface Draft {
  term: string
  definition: string
  kind: ConceptKind
  prompt?: string
  score: number
}

/* ---- acronyms ---------------------------------------------------- */

const ACRONYM_AFTER = /([A-Z][A-Za-z0-9\-/ ]{3,70}?)\s*\(\s*([A-Z][A-Z0-9]{1,7}s?)\s*\)/g
const ACRONYM_BEFORE = /\b([A-Z][A-Z0-9]{1,7}s?)\s*\(\s*([A-Za-z][A-Za-z0-9\-/ ,]{3,70}?)\s*\)/g
const INITIAL_SKIP = /^(?:of|and|the|for|to|in|on)$/i

function initialsOf(words: string[], skipSmall: boolean): string {
  return words
    .filter((x) => !(skipSmall && INITIAL_SKIP.test(x)))
    .map((x) => x[0]?.toUpperCase() ?? '')
    .join('')
}

function looseInitials(expansion: string, acronym: string): boolean {
  const letters = acronym.replace(/s$/, '').length
  const words = expansion.split(/[\s-]+/).filter(Boolean)
  return words.length >= 2 && letters <= words.length + 1 && letters >= Math.min(2, words.length)
}

function pickExpansion(words: string[], acr: string): string | null {
  const letters = acr.replace(/s$/, '').toUpperCase()
  const n = letters.length
  for (const len of [n, n + 1, n + 2]) {
    if (len > words.length) break
    let cand = words.slice(-len)
    while (cand.length && (STOP_START.has(wordKey(cand[0])) || ARTICLES.has(wordKey(cand[0])))) cand = cand.slice(1)
    if (cand.length < 2) continue
    if (initialsOf(cand, false) === letters || initialsOf(cand, true) === letters) return cand.join(' ')
  }
  // Loose fallback (e.g. "HyperText Transfer Protocol" -> HTTP): last n words.
  const loose = words.slice(-Math.max(2, Math.min(words.length, n))).join(' ')
  return !STOP_START.has(wordKey(loose.split(' ')[0])) && looseInitials(loose, acr) ? loose : null
}

function acronymDrafts(sentence: string): Draft[] {
  const out: Draft[] = []
  const push = (acr: string, expansion: string) => {
    const e = expansion.trim().replace(/[,\s]+$/, '')
    if (e.length < 5 || endsDangling(e) || STOP_START.has(wordKey(e.split(/\s+/)[0]))) return
    out.push({ term: acr, definition: e, kind: 'acronym', score: 3 })
  }
  for (const m of sentence.matchAll(ACRONYM_AFTER)) {
    const exp = pickExpansion(m[1].trim().split(/\s+/), m[2])
    if (exp) push(m[2], exp)
  }
  for (const m of sentence.matchAll(ACRONYM_BEFORE)) {
    const expansion = m[2].trim()
    if (looseInitials(expansion, m[1])) push(m[1], expansion)
  }
  return out
}

/* ---- definitions ------------------------------------------------- */

const DESCRIBING_VERBS =
  'focuses on|emphasi[sz]es|involves|aims to|seeks to|deals with|is concerned with|encompasses|describes|is based on'

function definitionDraft(sentence: string): Draft | null {
  const terminal = hasTerminalPunctuation(sentence)
  const s = sentence.replace(/[.]+$/, '').trim()
  const attempts: Array<[RegExp, number, boolean]> = [
    [/^(.{2,60}?)\s+(?:is|are|was|were)?\s*defined\s+(?:as|to be)\s+(.+)$/i, 3, false],
    [/^(.{2,60}?)\s+(?:refers? to|stands? for|is known as|are known as|denotes?|means?)\s+(.+)$/i, 3, false],
    [/^(.{2,60}?)\s*:\s+(.{10,})$/, 2.5, false],
    [/^(.{2,50}?)\s+[–—-]\s+(.{10,})$/, 2, false],
    [
      /^(.{2,50}?)\s+(?:is|are)\s+((?:a|an|the|one|used|responsible|any|when|where|how|what)\b.{8,})$/i,
      2,
      false,
    ],
    // "Kaizen focuses on improving …": strict single/short capitalised subject, keep the verb phrase.
    [new RegExp(`^([\\p{Lu}][\\p{L}\\p{N}-]*(?:\\s[\\p{Lu}][\\p{L}\\p{N}-]*){0,2})\\s+((?:${DESCRIBING_VERBS})\\s.+)$`, 'u'), 1.5, true],
  ]
  for (const [re, score] of attempts) {
    const m = re.exec(s)
    if (!m) continue
    const term = cleanTerm(m[1])
    const def = completeClause(m[2], { terminal })
    if (term && def && normalize(term) !== normalize(def)) {
      return { term, definition: def, kind: 'definition', score }
    }
  }
  return null
}

/* ---- cause & effect ---------------------------------------------- */

const MAX_FACT_CLAUSE = 150

function factDraft(sentence: string): Draft | null {
  const terminal = hasTerminalPunctuation(sentence)
  const s = sentence.replace(/[.]+$/, '').trim()
  if (s.length < 25 || s.length > 260) return null
  const make = (cause: string, effect: string, prompt: string): Draft | null => {
    if (cause.length > MAX_FACT_CLAUSE || effect.length > MAX_FACT_CLAUSE) return null
    const c = completeClause(cause, { terminal: false, min: 8 })
    const e = completeClause(effect, { terminal, min: MIN_DEFINITION })
    if (!c || !e) return null
    return { term: c, definition: e, kind: 'fact', score: 1.5, prompt: prompt.replace('{c}', lowerFirst(c)) }
  }
  let m = /^because\s+(.+?),\s+(.{8,})$/i.exec(s)
  if (m) return make(m[2], m[1], 'Why is it true that {c}?')
  m = /^(?:if|when)\s+(.+?),\s+(?:then\s+)?(.{8,})$/i.exec(s)
  // A very short condition usually means the first comma belongs to a list ("when A, B, and C hold, …").
  if (m && m[1].split(/\s+/).length < 3) m = /^(?:if|when)\s+(.+),\s+(?:then\s+)?(.{8,})$/i.exec(s)
  if (m && m[1].split(/\s+/).length <= 18) {
    const lead = s.toLowerCase().startsWith('if') ? 'if' : 'when'
    const d = make(m[1], m[2], `What happens ${lead} {c}?`)
    if (d) d.term = `${lead} ${d.term}`
    return d
  }
  m = /^(.{10,}?)\s+(?:leads? to|results? in|resulting in|causes?|so that|which allows|which causes|which enables|enables?)\s+(.{8,})$/i.exec(s)
  if (m) return make(m[1], m[2], 'What is the effect of {c}?')
  m = /^(.{10,}?)\s+because\s+(.{8,})$/i.exec(s)
  if (m) return make(m[1], m[2], 'Why is it true that {c}?')
  m = /^(.{10,}?),?\s+(?:therefore|thus|as a result|consequently),?\s+(.{8,})$/i.exec(s)
  if (m) return make(m[1], m[2], 'What follows from {c}?')
  return null
}

function boldDraft(sentence: string, bold: string[]): Draft | null {
  const terminal = hasTerminalPunctuation(sentence)
  for (const b of bold) {
    const term = cleanTerm(b)
    if (!term) continue
    const re = new RegExp(
      `^(?:the|a|an)?\\s*${escapeRegExp(b)}\\s*([:,–—-]|\\bis\\b|\\bare\\b|\\bmeans\\b)?\\s*(.+)$`,
      'i',
    )
    const m = re.exec(sentence)
    if (m) {
      let finalTerm = term
      let rest = m[2]
      // "**Round Robin** scheduling gives …": a non-verb word right after the bold term belongs to the term.
      if (!m[1]) {
        const [first, ...tail] = rest.split(/\s+/)
        if (first && tail.length > 0 && /^\p{Ll}+$/u.test(first) && !/s$/i.test(first) && !AUX_WORDS.has(first) && !DANGLING_WORDS.has(first)) {
          const extended = `${term} ${first}`
          if (isValidTerm(extended)) {
            finalTerm = extended
            rest = tail.join(' ')
          }
        }
      }
      const def = completeClause(rest, { terminal })
      if (def && def.length >= 25) return { term: finalTerm, definition: def, kind: 'definition', score: 2 }
    }
  }
  return null
}

/** Fallback for notes with no definable structure: cloze-style concepts from long, complete sentences. */
function fallbackDrafts(section: Section): Array<Draft & { snippet: string }> {
  const out: Array<Draft & { snippet: string }> = []
  for (const line of section.lines) {
    for (const sentence of splitSentences(line.text)) {
      if (sentence.length < 40 || sentence.length > 240 || looksTruncated(sentence)) continue
      const words = sentence.match(/[A-Za-z][A-Za-z-]{5,}/g) ?? []
      const candidates = [
        ...line.bold.map((b) => cleanTerm(b)).filter((x): x is string => !!x),
        ...words.filter((x) => /^[A-Z]/.test(x) && sentence.indexOf(x) > 0).sort((a, b) => b.length - a.length),
        ...words.slice().sort((a, b) => b.length - a.length),
      ]
      const keyword = candidates.find((c) => isValidTerm(c))
      const definition = completeClause(sentence, { terminal: hasTerminalPunctuation(sentence) })
      if (!keyword || !definition) continue
      out.push({ term: keyword, definition, kind: 'definition', score: 0.5, snippet: sentence })
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Concept extraction                                                   */
/* ------------------------------------------------------------------ */

export function extractConcepts(sections: Section[]): Concept[] {
  const byKey = new Map<string, Concept>()
  let counter = 0

  const add = (
    draft: Draft,
    snippet: string,
    section: Section,
    emphasised: boolean,
    inHeadingBoost: boolean,
  ) => {
    const key = `${draft.kind === 'acronym' ? 'acr:' : draft.kind === 'fact' ? 'fact:' : ''}${normalize(draft.term)}`
    if (!normalize(draft.term)) return
    const score = draft.score + (emphasised ? 2 : 0) + (inHeadingBoost ? 0.5 : 0)
    const existing = byKey.get(key)
    if (existing && existing.score >= score) return
    byKey.set(key, {
      id: existing?.id ?? `c${counter++}`,
      term: draft.term,
      definition: draft.definition,
      sourceSnippet: snippet,
      sectionId: section.id,
      citation: citationFor(section),
      kind: draft.kind,
      score,
      prompt: draft.prompt,
    })
  }

  for (const section of sections) {
    const titleNorm = normalize(section.title)
    for (const line of section.lines) {
      const sentences = line.kind === 'bullet' ? [line.text] : splitSentences(line.text)
      for (const sentence of sentences) {
        if (looksTruncated(sentence)) continue // cut-off fragment: never build questions from it
        const boldHit = (term: string) => line.bold.some((b) => normalize(b) === normalize(term))
        for (const d of acronymDrafts(sentence)) add(d, sentence, section, false, false)
        const def = definitionDraft(sentence) ?? boldDraft(sentence, line.bold)
        if (def) {
          add(def, sentence, section, boldHit(def.term), normalize(def.term) === titleNorm)
          continue
        }
        const fact = factDraft(sentence)
        if (fact) add(fact, sentence, section, false, false)
      }
    }
  }

  let concepts = [...byKey.values()]
  if (concepts.filter((c) => c.kind !== 'fact').length < 3) {
    for (const section of sections) {
      for (const d of fallbackDrafts(section)) {
        if (concepts.length >= 14) break
        const key = normalize(d.term)
        if (concepts.some((c) => normalize(c.term) === key)) continue
        concepts.push({
          id: `c${counter++}`,
          term: d.term,
          definition: d.definition,
          sourceSnippet: d.snippet,
          sectionId: section.id,
          citation: citationFor(section),
          kind: 'definition',
          score: d.score,
        })
      }
    }
  }
  concepts = concepts.sort((a, b) => sectionOrder(sections, a) - sectionOrder(sections, b))
  return concepts
}

function sectionOrder(sections: Section[], c: Concept): number {
  return sections.findIndex((s) => s.id === c.sectionId)
}

/* ------------------------------------------------------------------ */
/* Deck + study guide                                                   */
/* ------------------------------------------------------------------ */

export function buildDeck(name: string, sections: Section[]): Deck {
  const concepts = extractConcepts(sections)
  return {
    id: `deck-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name,
    createdAt: Date.now(),
    sources: [...new Set(sections.map((s) => s.source))],
    sections,
    concepts,
    mastered: [],
  }
}

function summarize(text: string, max: number): string {
  const sentences = splitSentences(text)
  let out = ''
  for (const s of sentences.slice(0, 2)) {
    if (out && (out + ' ' + s).length > max) break
    out = out ? `${out} ${s}` : s
  }
  return shortenClause(out, max)
}

export function buildStudyGuide(deck: Pick<Deck, 'sections' | 'concepts'>): StudyGuide {
  const sections = deck.sections.map((section) => {
    const body = section.lines.filter((l) => l.kind !== 'heading')
    const first = body[0]
    const summary = first ? summarize(first.text, 260) : ''
    const takeaways = body
      .slice(1)
      .filter((l) => !looksTruncated(l.text))
      .map((l) => shortenClause(l.text, 240))
      .slice(0, 6)
    return {
      sectionId: section.id,
      title: section.title,
      citation: citationFor(section),
      summary,
      takeaways,
      terms: deck.concepts.filter((c) => c.sectionId === section.id && c.kind !== 'fact'),
    }
  })
  const glossary = deck.concepts
    .filter((c) => c.kind !== 'fact')
    .slice()
    .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }))
  return { sections, glossary }
}

/** Text shown on the front of a flashcard / as the topic of a question. */
export function conceptFront(c: Concept): string {
  if (c.prompt) return c.prompt
  return c.kind === 'acronym' ? `What does ${c.term} stand for?` : c.term
}

/* ------------------------------------------------------------------ */
/* Question generation                                                  */
/* ------------------------------------------------------------------ */

export const DEFAULT_CONFIG: QuizConfig = {
  count: 10,
  types: ['mcq', 'identification', 'truefalse'],
  difficulty: 'standard',
}

export function maxQuestions(concepts: Concept[]): number {
  return concepts.length
}

interface Ctx {
  all: Concept[]
  rng: Rng
  difficulty: Difficulty
}

function lengthSim(a: string, b: string): number {
  return 1 - Math.abs(a.length - b.length) / Math.max(a.length, b.length, 1)
}

function pickDistractors(
  target: Concept,
  pick: (c: Concept) => string,
  ctx: Ctx,
  want: number,
): string[] {
  const correct = normalize(pick(target))
  const seen = new Set<string>([correct])
  const ranked = ctx.all
    .filter((c) => c.id !== target.id)
    .map((c) => {
      let s = ctx.rng()
      if (c.kind === target.kind) s += 3
      if (ctx.difficulty === 'challenge') {
        if (c.sectionId === target.sectionId) s += 2
        s += lengthSim(pick(c), pick(target)) * 2
      } else if (c.sectionId === target.sectionId) {
        s += 0.5
      }
      return { c, s }
    })
    .sort((a, b) => b.s - a.s)
  const out: string[] = []
  for (const { c } of ranked) {
    const text = pick(c)
    const key = normalize(text)
    if (!key || seen.has(key) || endsDangling(text)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= want) break
  }
  return out
}

function describe(def: string): string {
  return `${capitalizeFirst(def)}.`
}

function buildMcq(c: Concept, ctx: Ctx, idx: number): Question | null {
  const reverse = c.kind !== 'fact' && ctx.rng() < 0.4
  const pick = reverse ? (x: Concept) => x.term : (x: Concept) => shortenClause(x.definition, 220)
  const correct = pick(c)
  const distractors = pickDistractors(c, pick, ctx, 3)
  if (distractors.length < 1) return null
  const options = shuffle([correct, ...distractors], ctx.rng)
  let prompt: string
  if (c.kind === 'fact') {
    prompt = c.prompt ?? `Which statement is correct about ${lowerFirst(c.term)}?`
  } else if (c.kind === 'acronym') {
    prompt = reverse ? `Which acronym stands for ${c.definition}?` : `What does ${c.term} stand for?`
  } else if (reverse) {
    prompt = `Which term matches this description? ${describe(shortenClause(c.definition, 240))}`
  } else {
    prompt = ctx.rng() < 0.5 ? `What is ${c.term}?` : `Which statement accurately defines ${c.term}?`
  }
  return {
    id: `q${idx}-${c.id}-mcq`,
    type: 'mcq',
    conceptId: c.id,
    prompt,
    options,
    correctIndex: options.indexOf(correct),
    answer: correct,
    explanation: `Correct answer: ${correct}. “${c.sourceSnippet}”`,
    citation: c.citation,
  }
}

function acronymExtras(c: Concept, all: Concept[]): string[] {
  const extras: string[] = []
  for (const a of all) {
    if (a.kind !== 'acronym' || a.id === c.id) continue
    if (c.kind === 'definition' && normalize(a.definition) === normalize(c.term)) extras.push(a.term)
    if (c.kind === 'definition' && normalize(a.term) === normalize(c.term)) extras.push(a.definition)
  }
  return extras
}

function buildIdentification(c: Concept, ctx: Ctx, idx: number): Question | null {
  if (c.kind === 'fact' || c.term.split(/\s+/).length > 5) return null
  const masked = maskTerm(c.sourceSnippet, c.term, acronymExtras(c, ctx.all))
  let prompt: string
  if (masked.includes(BLANK) && c.sourceSnippet.length >= 25) {
    prompt = `Fill in the blank: ${masked}`
  } else {
    const def = maskTerm(c.definition, c.term)
    prompt =
      c.kind === 'acronym'
        ? `Identify the acronym that stands for: ${describe(def)}`
        : `Identify the term described here: ${describe(shortenClause(def, 260))}`
  }
  return {
    id: `q${idx}-${c.id}-id`,
    type: 'identification',
    conceptId: c.id,
    prompt,
    options: [],
    correctIndex: -1,
    answer: c.term,
    explanation: `Answer: ${c.term}. “${c.sourceSnippet}”`,
    citation: c.citation,
  }
}

function replaceFirstInsensitive(text: string, find: string, replacement: string): string | null {
  const i = text.toLowerCase().indexOf(find.toLowerCase())
  if (i < 0) return null
  return text.slice(0, i) + replacement + text.slice(i + find.length)
}

export function makeFalseStatement(c: Concept, other: Concept): string | null {
  const snippet = c.sourceSnippet.replace(/[.]+$/, '')
  // Prefer swapping the term (subtle), else swap the definition.
  const termSwap = c.kind !== 'fact' ? replaceFirstInsensitive(snippet, c.term, other.term) : null
  if (termSwap && normalize(termSwap) !== normalize(snippet)) return termSwap + '.'
  const defSwap = replaceFirstInsensitive(snippet, c.definition, other.definition)
  if (defSwap && normalize(defSwap) !== normalize(snippet)) return defSwap + '.'
  return null
}

function buildTrueFalse(c: Concept, ctx: Ctx, idx: number): Question {
  const others = ctx.all
    .filter((o) => o.id !== c.id && normalize(o.term) !== normalize(c.term) && normalize(o.definition) !== normalize(c.definition))
    .map((o) => ({
      o,
      s:
        ctx.rng() +
        (o.kind === c.kind ? 2 : 0) +
        (ctx.difficulty === 'challenge' && o.sectionId === c.sectionId ? 2 : 0),
    }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.o)

  let falseStatement: string | null = null
  if (others.length > 0 && ctx.rng() < 0.5) {
    for (const o of others.slice(0, 6)) {
      falseStatement = makeFalseStatement(c, o)
      if (!falseStatement && c.kind !== 'fact') falseStatement = `${c.term}: ${o.definition}.`
      if (falseStatement) break
    }
  }
  const isFalse = falseStatement !== null
  const statement = isFalse ? falseStatement! : c.sourceSnippet
  return {
    id: `q${idx}-${c.id}-tf`,
    type: 'truefalse',
    conceptId: c.id,
    prompt: statement,
    options: ['True', 'False'],
    correctIndex: isFalse ? 1 : 0,
    answer: isFalse ? 'False' : 'True',
    explanation: isFalse
      ? `False. The notes actually say: “${c.sourceSnippet}”`
      : `True. “${c.sourceSnippet}”`,
    citation: c.citation,
  }
}

export interface GenerateOptions {
  /** Restrict to these concepts (retry-missed). Count then equals their number. */
  onlyConceptIds?: string[]
}

export function generateQuiz(
  concepts: Concept[],
  config: QuizConfig,
  rng: Rng,
  options: GenerateOptions = {},
): Question[] {
  const types: QuestionType[] = config.types.length ? config.types : ['mcq']
  if (concepts.length === 0) return []
  const ctx: Ctx = { all: concepts, rng, difficulty: config.difficulty }

  const only = options.onlyConceptIds ? new Set(options.onlyConceptIds) : null
  const pool = only ? concepts.filter((c) => only.has(c.id)) : concepts
  const ranked = pool
    .map((c) => ({ c, s: c.score + rng() * 1.5 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c)
  const limit = only ? ranked.length : Math.min(config.count, ranked.length)
  const targets = shuffle(ranked.slice(0, limit), rng)

  const order = shuffle(types, rng)
  const questions: Question[] = []
  targets.forEach((c, i) => {
    for (let k = 0; k < order.length; k++) {
      const type = order[(i + k) % order.length]
      let q: Question | null = null
      if (type === 'mcq') q = buildMcq(c, ctx, i)
      else if (type === 'identification') q = buildIdentification(c, ctx, i)
      else q = buildTrueFalse(c, ctx, i)
      if (q) {
        questions.push(q)
        return
      }
    }
  })
  return questions
}

export function gradeIdentification(q: Question, input: string, difficulty: Difficulty): boolean {
  return isCloseEnough(input, q.answer, difficulty === 'challenge')
}

export function isCorrect(q: Question, response: number | string, difficulty: Difficulty): boolean {
  if (q.type === 'identification') {
    return typeof response === 'string' && gradeIdentification(q, response, difficulty)
  }
  return response === q.correctIndex
}
