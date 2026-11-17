import { describe, expect, it } from 'vitest'
import { isCloseEnough, levenshtein, normalize } from '../fuzzy'

describe('fuzzy matching', () => {
  it('normalises case, punctuation, accents and leading articles', () => {
    expect(normalize('  The  Café!! ')).toBe('cafe')
    expect(normalize('A Mutex.')).toBe('mutex')
  })

  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
  })

  it('accepts case-insensitive and small typos in lenient mode', () => {
    expect(isCloseEnough('SEMAPHORE', 'semaphore', false)).toBe(true)
    expect(isCloseEnough('semaphor', 'semaphore', false)).toBe(true)
    expect(isCloseEnough('thrashing', 'trashing', false)).toBe(true)
    expect(isCloseEnough('mutex lock', 'semaphore', false)).toBe(false)
  })

  it('is exact (after normalisation) in strict mode', () => {
    expect(isCloseEnough('The Semaphore', 'semaphore', true)).toBe(true)
    expect(isCloseEnough('semaphor', 'semaphore', true)).toBe(false)
  })

  it('never fuzzy-matches very short answers or empty input', () => {
    expect(isCloseEnough('TCQ', 'TCP', false)).toBe(false)
    expect(isCloseEnough('', 'TCP', false)).toBe(false)
  })
})
