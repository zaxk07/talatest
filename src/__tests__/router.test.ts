import { describe, expect, it } from 'vitest'
import { hrefFor, parseHash } from '../router'

describe('hash router', () => {
  it('parses every page and falls back to home for unknown hashes', () => {
    expect(parseHash('')).toEqual({ page: 'home' })
    expect(parseHash('#/')).toEqual({ page: 'home' })
    expect(parseHash('#/how')).toEqual({ page: 'how' })
    expect(parseHash('#/decks')).toEqual({ page: 'decks' })
    expect(parseHash('#/modes')).toEqual({ page: 'modes' })
    expect(parseHash('#/nope/what')).toEqual({ page: 'home' })
  })

  it('parses workspace modes and defaults to the study guide', () => {
    expect(parseHash('#/workspace/cards')).toEqual({ page: 'workspace', mode: 'cards' })
    expect(parseHash('#/workspace/exam?x=1')).toEqual({ page: 'workspace', mode: 'exam' })
    expect(parseHash('#/workspace')).toEqual({ page: 'workspace', mode: 'guide' })
    expect(parseHash('#/workspace/bogus')).toEqual({ page: 'workspace', mode: 'guide' })
  })

  it('round-trips through hrefFor', () => {
    for (const h of ['#/', '#/how', '#/decks', '#/modes', '#/workspace/match']) {
      expect(hrefFor(parseHash(h))).toBe(h)
    }
  })
})
