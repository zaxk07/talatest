import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { Concept, QuizConfig, Section } from '../../types'
import { groupLines, parsePptxBuffer, parseText, pdfItemsToText, reflowText, textToLines } from '../documentParser'
import {
  buildDeck,
  completeClause,
  isValidTerm,
  shortenClause,
  buildStudyGuide,
  extractConcepts,
  generateQuiz,
  gradeIdentification,
  isCorrect,
  makeFalseStatement,
  maskTerm,
} from '../quizGenerator'
import { endsDangling } from '../language'
import { SAMPLE_NAME, SAMPLE_NOTES } from '../sampleNotes'
import { createRng } from '../seededRandom'

const sample = parseText(SAMPLE_NOTES, SAMPLE_NAME).sections
const concepts = extractConcepts(sample)

function conceptsFrom(text: string): Concept[] {
  return extractConcepts(parseText(text, 't.md').sections)
}
const all: QuizConfig = { count: 20, types: ['mcq', 'identification', 'truefalse'], difficulty: 'standard' }
const find = (term: string) => concepts.find((c) => c.term.toLowerCase() === term.toLowerCase())!

describe('extractConcepts', () => {
  it('finds a rich set of concepts in the sample notes', () => {
    expect(concepts.length).toBeGreaterThanOrEqual(25)
    for (const t of ['OSI model', 'Mutex', 'Paging', 'Thrashing', 'process', 'deadlock', 'TCP', 'DNS']) {
      expect(find(t), t).toBeDefined()
    }
  })

  it('parses each definition pattern', () => {
    const c = conceptsFrom(
      [
        '# T',
        'A router is defined as a device that forwards packets between networks.',
        'Latency refers to the delay before a transfer of data begins.',
        'Bandwidth: the maximum rate of data transfer across a path.',
        'A kernel is the core component of an operating system.',
        'Jitter - variation in packet delay over time.',
      ].join('\n'),
    )
    const terms = c.map((x) => x.term.toLowerCase())
    expect(terms).toEqual(expect.arrayContaining(['router', 'latency', 'bandwidth', 'kernel', 'jitter']))
    expect(c.find((x) => x.term === 'router')!.definition).toMatch(/^a device that forwards/)
  })

  it('extracts acronyms in both directions', () => {
    const c = conceptsFrom(
      '# T\nTransmission Control Protocol (TCP) is reliable.\nHTTP (HyperText Transfer Protocol) powers the web.',
    )
    const tcp = c.find((x) => x.term === 'TCP' && x.kind === 'acronym')!
    expect(tcp.definition).toBe('Transmission Control Protocol')
    expect(c.find((x) => x.term === 'HTTP')!.definition).toBe('HyperText Transfer Protocol')
  })

  it('extracts cause-and-effect facts with a custom prompt', () => {
    const c = conceptsFrom('# T\nPacket loss leads to retransmission in TCP, which increases delay.')
    const fact = c.find((x) => x.kind === 'fact')!
    expect(fact.definition).toMatch(/^retransmission/)
    expect(fact.prompt).toMatch(/effect of/i)
  })

  it('uses bold terms as definitions and boosts their score', () => {
    const c = conceptsFrom('# T\n**Hashing** converts input data into a fixed-size digest.')
    expect(c[0].term).toBe('Hashing')
    expect(c[0].score).toBeGreaterThan(2)
  })

  it('carries a citation + exact source snippet', () => {
    const m = find('Mutex')
    expect(m.sourceSnippet).toMatch(/^Mutex: a locking mechanism/)
    expect(m.citation).toContain('Synchronization and Deadlocks')
  })

  it('dedupes repeated terms and ignores junk labels', () => {
    const c = conceptsFrom('# T\nNote: this is not a real term at all here.\nRAM: volatile memory used by running programs.\nRAM: volatile memory used by running programs.')
    expect(c.filter((x) => x.term === 'RAM')).toHaveLength(1)
    expect(c.find((x) => x.term === 'Note')).toBeUndefined()
  })

  it('falls back to cloze concepts for unstructured prose and handles empty input', () => {
    const c = conceptsFrom(
      '# Essay\nPhotosynthesis converts sunlight into chemical energy inside the chloroplasts of plant cells.\nThe mitochondria generate most of the chemical energy needed to power cellular reactions.',
    )
    expect(c.length).toBeGreaterThan(0)
    expect(extractConcepts([])).toEqual([])
  })
})

describe('buildStudyGuide', () => {
  it('builds sections, takeaways and an A–Z glossary without facts', () => {
    const deck = buildDeck('Sample', sample)
    const guide = buildStudyGuide(deck)
    expect(guide.sections).toHaveLength(sample.length)
    expect(guide.sections[0].takeaways.length).toBeGreaterThan(0)
    const terms = guide.glossary.map((c) => c.term.toLowerCase())
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b)))
    expect(guide.glossary.every((c) => c.kind !== 'fact')).toBe(true)
  })
})

describe('MCQ generation', () => {
  const qs = generateQuiz(concepts, { ...all, types: ['mcq'], count: 20 }, createRng(1))

  it('produces 4 unique options with exactly one correct, distractors from the deck', () => {
    expect(qs.length).toBe(20)
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options.map((o) => o.toLowerCase())).size).toBe(4)
      expect(q.options[q.correctIndex]).toBe(q.answer)
      const pool = new Set(concepts.flatMap((c) => [c.term, c.definition.slice(0, 200)]))
      const poolish = q.options.every((o) => [...pool].some((p) => p === o || p.startsWith(o.replace(/…$/, ''))))
      expect(poolish).toBe(true)
    }
  })

  it('is deterministic for a seed', () => {
    const again = generateQuiz(concepts, { ...all, types: ['mcq'], count: 20 }, createRng(1))
    expect(again.map((q) => q.id)).toEqual(qs.map((q) => q.id))
  })

  it('degrades to fewer options when the deck is tiny, and skips when impossible', () => {
    const two = conceptsFrom('# T\nA cat is a small domesticated animal.\nA dog is a loyal domesticated animal.')
    const q = generateQuiz(two, { ...all, types: ['mcq'], count: 5 }, createRng(2))
    expect(q.length).toBe(2)
    expect(q[0].options).toHaveLength(2)
    const one = conceptsFrom('# T\nA cat is a small domesticated animal.')
    expect(generateQuiz(one, { ...all, types: ['mcq'], count: 5 }, createRng(2))).toEqual([])
  })
})

describe('Identification / fill-in-the-blank', () => {
  it('masks the term in the source sentence, case-insensitively and with plurals', () => {
    expect(maskTerm('A mutex locks. Mutexes are fast; MUTEX rules.', 'mutex')).toBe(
      'A _____ locks. _____ are fast; _____ rules.',
    )
    expect(maskTerm('Category theory', 'cat')).toBe('Category theory') // whole words only
  })

  it('masks acronym variants alongside the full term', () => {
    expect(maskTerm('Transmission Control Protocol (TCP) is reliable', 'Transmission Control Protocol', ['TCP'])).toBe(
      '_____ (_____) is reliable',
    )
  })

  it('creates blanks whose answer is the term, never leaking it in the prompt', () => {
    const qs = generateQuiz(concepts, { ...all, types: ['identification'], count: 20 }, createRng(3))
    expect(qs.length).toBeGreaterThan(10)
    for (const q of qs) {
      expect(q.type).toBe('identification')
      expect(q.prompt).toMatch(/_____|Identify/)
      expect(q.prompt.toLowerCase()).not.toContain(` ${q.answer.toLowerCase()} `)
    }
  })

  it('grades tolerantly in Standard and strictly in Challenge', () => {
    const q = generateQuiz([find('Semaphore'), find('Mutex'), find('Thrashing'), find('Paging')], { ...all, types: ['identification'], count: 5 }, createRng(4)).find(
      (x) => x.answer === 'Semaphore',
    )!
    expect(gradeIdentification(q, 'semaphore', 'standard')).toBe(true)
    expect(gradeIdentification(q, ' SEMAPHORE! ', 'challenge')).toBe(true)
    expect(gradeIdentification(q, 'semaphor', 'standard')).toBe(true)
    expect(gradeIdentification(q, 'semaphor', 'challenge')).toBe(false)
    expect(gradeIdentification(q, 'mutex', 'standard')).toBe(false)
    expect(isCorrect(q, 'Semaphore', 'standard')).toBe(true)
  })

  it('skips cause-effect facts for identification', () => {
    const fact = concepts.find((c) => c.kind === 'fact')!
    expect(generateQuiz([fact], { ...all, types: ['identification'], count: 5 }, createRng(5))).toEqual([])
  })
})

describe('True / False', () => {
  const qs = generateQuiz(concepts, { ...all, types: ['truefalse'], count: 20 }, createRng(6))

  it('mixes true statements with swapped false ones and cites the source', () => {
    expect(qs.some((q) => q.correctIndex === 0)).toBe(true)
    expect(qs.some((q) => q.correctIndex === 1)).toBe(true)
    for (const q of qs) {
      const c = concepts.find((x) => x.id === q.conceptId)!
      expect(q.explanation).toContain(c.sourceSnippet)
      expect(q.citation).toBe(c.citation)
      if (q.correctIndex === 0) expect(q.prompt).toBe(c.sourceSnippet)
      else expect(q.prompt).not.toBe(c.sourceSnippet)
    }
  })

  it('swaps the term for another concept in the false statement', () => {
    const out = makeFalseStatement(find('Mutex'), find('Semaphore'))!
    expect(out).toMatch(/^Semaphore: a locking mechanism/)
  })

  it('works with a single concept (always true)', () => {
    const one = conceptsFrom('# T\nA cat is a small domesticated animal.')
    const q = generateQuiz(one, { ...all, types: ['truefalse'], count: 5 }, createRng(7))
    expect(q).toHaveLength(1)
    expect(q[0].answer).toBe('True')
  })
})

describe('quiz configuration & retry', () => {
  it('clamps count to available concepts and honours selected types', () => {
    const small = concepts.slice(0, 6)
    const q = generateQuiz(small, { ...all, count: 20 }, createRng(8))
    expect(q).toHaveLength(6)
    const onlyTf = generateQuiz(concepts, { ...all, types: ['truefalse'], count: 5 }, createRng(8))
    expect(onlyTf.every((x) => x.type === 'truefalse')).toBe(true)
    expect(onlyTf).toHaveLength(5)
  })

  it('uses a variety of types and never repeats a concept', () => {
    const q = generateQuiz(concepts, { ...all, count: 15 }, createRng(9))
    expect(new Set(q.map((x) => x.type)).size).toBe(3)
    expect(new Set(q.map((x) => x.conceptId)).size).toBe(q.length)
  })

  it('retry-missed re-tests exactly the missed concepts', () => {
    const missed = [concepts[0].id, concepts[3].id, concepts[5].id]
    const q = generateQuiz(concepts, { ...all, count: 5 }, createRng(10), { onlyConceptIds: missed })
    expect(q.map((x) => x.conceptId).sort()).toEqual([...missed].sort())
  })

  it('returns nothing for empty decks and falls back to MCQ with no types', () => {
    expect(generateQuiz([], all, createRng(1))).toEqual([])
    const q = generateQuiz(concepts, { ...all, types: [], count: 5 }, createRng(1))
    expect(q.length).toBe(5)
    expect(q.every((x) => x.type === 'mcq')).toBe(true)
  })

  it('challenge difficulty still yields valid questions', () => {
    const q = generateQuiz(concepts, { ...all, difficulty: 'challenge', count: 20 }, createRng(11))
    expect(q.length).toBe(20)
    for (const x of q.filter((y) => y.type === 'mcq')) expect(x.options[x.correctIndex]).toBe(x.answer)
  })
})

it('handles a deck made of sections with no lines', () => {
  const empty: Section[] = [{ id: 's', title: 'x', source: 'a', locator: 'Section 1', lines: [] }]
  expect(extractConcepts(empty)).toEqual([])
})

/* ------------------------------------------------------------------ */
/* Regression: wrapped PDF/PPTX text must not yield truncated concepts  */
/* ------------------------------------------------------------------ */

const STOP = /^(while|although|however|therefore|when|if|because|since|the|this|these|it|in|for|to|a|an)\b/i
const TRAILING = /\b(might|can|will|is|are|through|with|of|to|the|a|an|and|or|but)$/i
const MCQ_PROMPT =
  /^(What is |Which statement accurately defines |Which term matches this description\? |What does .+ stand for\?|Which acronym stands for |Why is it true that |What happens |What is the effect of |What follows from |Which statement is correct about )/

function expectClean(cs: Concept[], qs: ReturnType<typeof generateQuiz> = []) {
  for (const c of cs) {
    // Cause-and-effect facts use a whole clause as their "term"; only noun-phrase terms get the strict checks.
    if (c.kind !== 'fact') {
      expect(c.term, `term "${c.term}"`).not.toMatch(STOP)
      expect(c.term.split(/\s+/).length).toBeLessThanOrEqual(6)
    }
    expect(c.term, `term "${c.term}"`).not.toMatch(TRAILING)
    expect(c.definition, `definition "${c.definition}"`).not.toMatch(TRAILING)
    expect(c.definition).not.toMatch(/[,;:]$/)
    if (c.kind !== 'acronym') expect(c.definition.length).toBeGreaterThanOrEqual(25)
  }
  for (const q of qs) {
    expect(q.prompt).not.toMatch(/While \w+ might/)
    for (const o of q.type === 'mcq' ? q.options : []) {
      expect(o, `option "${o}"`).not.toMatch(TRAILING)
      expect(o).not.toMatch(/[,;:]$/)
    }
    if (q.type === 'mcq') expect(q.prompt, q.prompt).toMatch(MCQ_PROMPT)
  }
}

function pdfLines(lines: string[]) {
  return lines.map((str, i) => ({ str, transform: [1, 0, 0, 1, 0, 700 - i * 14], height: 12 }))
}

const WRAPPED_PDF = [
  'Kaikaku is a radical, breakthrough improvement of a process, carried out over',
  'a short period of time. While Kaikaku might involve a major redesign of the',
  'workplace, Kaizen focuses on improving products through the',
  'elimination of waste and continuous small changes.',
  'Kaizen is a continuous improvement philosophy that engages every employee in',
  'small, incremental changes each day.',
  'Kakushin is an innovation-driven transformation that reinvents products and',
  'services for new markets.',
]

describe('reflowText (soft-wrap reconstruction)', () => {
  it('merges wrapped PDF lines into whole sentences', () => {
    const text = reflowText(pdfItemsToText(pdfLines(WRAPPED_PDF)))
    expect(text).toContain('carried out over a short period of time.')
    expect(text).toContain('redesign of the workplace, Kaizen focuses on improving products through the elimination of waste')
    expect(text.split('\n')).toHaveLength(3)
  })

  it('re-joins a definition wrapped mid-phrase (lowercase continuation)', () => {
    expect(reflowText('5S is a systematic approach to workplace\norganisation that sorts and shines.')).toBe(
      '5S is a systematic approach to workplace organisation that sorts and shines.',
    )
  })

  it('repairs hyphenated line breaks and collapses repeated spaces', () => {
    expect(reflowText('an inter-\nnational   standard for\nnetworks.')).toBe('an international standard for networks.')
  })

  it('does not merge bullets, numbered items, headings, labels or terminated lines', () => {
    expect(reflowText('- first item\n- second item\n1. third item')).toBe('- first item\n- second item\n1. third item')
    expect(reflowText('LEAN CONCEPTS\nKaizen is continuous improvement of work.')).toContain('\n')
    expect(reflowText('Lean Manufacturing\nKaizen focuses on waste reduction.').split('\n')).toHaveLength(2)
    expect(reflowText('Kaizen: continuous improvement of work\nKaikaku: radical change of the work').split('\n')).toHaveLength(2)
    expect(reflowText('First sentence ends here.\nSecond sentence starts here.').split('\n')).toHaveLength(2)
  })

  it('keeps blank lines as paragraph separators', () => {
    expect(reflowText('one line\n\nanother line')).toBe('one line\n\nanother line')
  })
})

describe('regression: wrapped PDF text', () => {
  const sections = groupLines(textToLines(reflowText(pdfItemsToText(pdfLines(WRAPPED_PDF)))), 'lean.pdf', 'Lean')
  const cs = extractConcepts(sections)

  it('extracts the clean terms and complete definitions', () => {
    const kaikaku = cs.find((c) => c.term === 'Kaikaku')!
    expect(kaikaku.definition).toBe('a radical, breakthrough improvement of a process, carried out over a short period of time')
    expect(cs.find((c) => c.term === 'Kaizen')).toBeDefined()
    expect(cs.find((c) => c.term === 'Kakushin')!.definition).toMatch(/for new markets$/)
    expectClean(cs)
  })

  it('never generates truncated terms or dangling-preposition options', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const qs = generateQuiz(cs, { ...all, count: 20, difficulty: seed % 2 ? 'standard' : 'challenge' }, createRng(seed))
      expectClean(cs, qs)
    }
  })

  it('writes natural MCQ prompts without quote fragments', () => {
    const qs = generateQuiz(cs, { ...all, types: ['mcq'], count: 20 }, createRng(3))
    expect(qs.some((q) => /^(What is Kaikaku\?|Which statement accurately defines Kaikaku\?)$/.test(q.prompt) || q.prompt.startsWith('Which term matches this description?'))).toBe(true)
    expect(qs.every((q) => !/[“”"]/.test(q.prompt.split('?')[0]))).toBe(true)
  })
})

describe('regression: wrapped PPTX paragraphs', () => {
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
  const para = (t: string, bullet = false) =>
    `<a:p>${bullet ? '<a:pPr><a:buChar char="•"/></a:pPr>' : ''}<a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r></a:p>`
  const slide = (paras: string[]) =>
    `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody>${para('Lean Thinking')}</p:txBody></p:sp>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody>${paras.join('')}</p:txBody></p:sp>
    </p:spTree></p:cSld></p:sld>`
  const build = async (paras: string[]) => {
    const zip = new JSZip()
    zip.file('ppt/slides/slide1.xml', slide(paras))
    return parsePptxBuffer(await zip.generateAsync({ type: 'uint8array' }), 'lean.pptx')
  }

  it('re-joins paragraphs split by a soft wrap but keeps real bullets apart', async () => {
    const doc = await build([
      para('Kaizen focuses on improving products through the'),
      para('elimination of waste and continuous small changes.'),
      para('While Kaikaku might'),
      para('involve radical change, Kaizen is gradual.'),
      para('5S Methodology: a systematic approach to workplace organisation and cleanliness', true),
      para('Kanban: a visual scheduling system that limits work in progress', true),
    ])
    const texts = doc.sections[0].lines.map((l) => l.text)
    expect(texts).toEqual([
      'Kaizen focuses on improving products through the elimination of waste and continuous small changes.',
      'While Kaikaku might involve radical change, Kaizen is gradual.',
      '5S Methodology: a systematic approach to workplace organisation and cleanliness',
      'Kanban: a visual scheduling system that limits work in progress',
    ])
    const cs = extractConcepts(doc.sections)
    expect(cs.map((c) => c.term)).toEqual(expect.arrayContaining(['Kaizen', '5S Methodology', 'Kanban']))
    expectClean(cs, generateQuiz(cs, { ...all, count: 20 }, createRng(5)))
  })

  it('discards a cut-off sentence instead of emitting a truncated concept', async () => {
    const doc = await build([para('Kaizen focuses on improving products through the')])
    const cs = extractConcepts(doc.sections)
    expect(cs.find((c) => /through the$/.test(c.definition))).toBeUndefined()
    expectClean(cs)
  })
})

describe('term & definition validation', () => {
  it('rejects fragments, stop-word starts, dangling ends and long phrases', () => {
    for (const bad of [
      'While Kaikaku might', 'Although Kaizen', 'However the plan', 'Therefore', 'When it rains', 'If needed',
      'Because of this', 'Since then', 'This approach', 'These tools', 'It works', 'In practice', 'For example',
      'To improve', 'Kaikaku might', 'Kaizen can', 'Process will', 'Waste is', 'Tools are', 'Approach through',
      'Kanban with', 'Philosophy of', 'Improvement to', 'one two three four five six seven',
      'The workplace', 'A radical change', 'An approach', 'Kaizen,', 'Kaikaku might involve',
    ]) {
      expect(isValidTerm(bad), bad).toBe(false)
    }
  })

  it('strips a leading article from an otherwise clean term rather than keeping it', () => {
    const cs = conceptsFrom('# Models\nThe OSI model: a seven-layer framework for describing network communication.')
    expect(cs.find((c) => c.term === 'OSI model')).toBeDefined()
    expect(cs.some((c) => /^(the|a|an)\b/i.test(c.term))).toBe(false)
  })

  it('never offers an option ending in a comma, conjunction or dangling preposition', () => {
    const wrapped = [
      'Kaizen is a continuous improvement philosophy that engages every employee in',
      'small, incremental changes each day.',
      'Kaikaku is a radical breakthrough improvement of a process, carried out over a',
      'short period of time.',
      'Kakushin is an innovation-driven transformation that reinvents products and',
      'services for new markets.',
    ]
    const cs = extractConcepts(groupLines(textToLines(reflowText(wrapped.join('\n'))), 'x.pdf', 'X'))
    for (let seed = 1; seed <= 20; seed++) {
      for (const q of generateQuiz(cs, { ...all, types: ['mcq'], count: 10 }, createRng(seed))) {
        for (const o of q.options) {
          expect(o, o).not.toMatch(/[,;:]\s*$/)
          expect(endsDangling(o), o).toBe(false)
        }
      }
    }
  })

  it('accepts clean noun phrases and acronyms', () => {
    for (const ok of ['Kaikaku', 'Kaizen', 'Kakushin', '5S Methodology', 'TCP', 'Round Robin', 'Translation Lookaside Buffer', 'context switch', 'Three-way handshake']) {
      expect(isValidTerm(ok), ok).toBe(true)
    }
  })

  it('trims definitions back to the last complete clause or discards them', () => {
    expect(completeClause('improving products through the', { terminal: false })).toBeNull()
    expect(completeClause('a systematic approach to', { terminal: false })).toBeNull()
    expect(completeClause('improving quality, reducing waste, and', { terminal: false })).toBe('improving quality, reducing waste')
    expect(completeClause('a short clause,', { terminal: false })).toBeNull()
    expect(completeClause('too short.', { terminal: true })).toBeNull()
    expect(completeClause('a complete clause that is long enough to keep.', { terminal: true })).toBe('a complete clause that is long enough to keep')
    expect(completeClause('a complete bullet without a period that is fine', { terminal: false })).toBe('a complete bullet without a period that is fine')
  })

  it('never cuts a sentence mid-thought when shortening', () => {
    const long = 'a very long definition that runs past the limit, and then continues for quite a while longer than we want'
    expect(shortenClause(long, 60)).toBe('a very long definition that runs past the limit')
    expect(shortenClause('no commas in this one so it must stay whole even if it is long', 20)).toContain('stay whole')
  })

  it('skips sentences that start mid-argument or are cut off', () => {
    const cs = conceptsFrom('# T\nWhile Kaikaku is a radical change, Kaizen is a gradual one that never stops.\nKaizen focuses on improving products through the')
    expect(cs.find((c) => /^While/i.test(c.term))).toBeUndefined()
    expect(cs.find((c) => /through the$/.test(c.definition))).toBeUndefined()
  })

  it('keeps a bold term\'s noun, drops list-split conditions and pronoun-led answers', () => {
    expect(concepts.find((c) => c.term === 'Round Robin scheduling')?.definition).toMatch(/^gives each process/)
    expect(concepts.find((c) => c.term === 'Round Robin')).toBeUndefined()
    expect(concepts.some((c) => /circular wait$/.test(c.term))).toBe(false)
    expect(concepts.every((c) => !/^(it|they|this|that|these|those|which)\b/i.test(c.definition))).toBe(true)
  })

  it('keeps every sample-notes concept and question clean across many seeds', () => {
    expectClean(concepts)
    for (let seed = 1; seed <= 25; seed++) {
      expectClean(concepts, generateQuiz(concepts, { ...all, count: 20, difficulty: seed % 2 ? 'standard' : 'challenge' }, createRng(seed)))
    }
  })
})
