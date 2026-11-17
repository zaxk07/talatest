import type { Deck } from '../types'

const DECKS_KEY = 'talatest:v1:decks'
export const THEME_KEY = 'talatest:theme'
const MAX_DECKS = 10

function read(): Deck[] {
  try {
    const raw = localStorage.getItem(DECKS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (d): d is Deck =>
        !!d && typeof d === 'object' && typeof (d as Deck).id === 'string' && Array.isArray((d as Deck).concepts),
    )
  } catch {
    return []
  }
}

function write(decks: Deck[]): boolean {
  // Drop oldest decks until it fits the quota.
  let list = decks
  while (list.length > 0) {
    try {
      localStorage.setItem(DECKS_KEY, JSON.stringify(list))
      return true
    } catch {
      list = list.slice(0, -1)
    }
  }
  try {
    localStorage.removeItem(DECKS_KEY)
  } catch {
    /* ignore */
  }
  return false
}

/** Decks, most recently used first. */
export function listDecks(): Deck[] {
  return read()
}

export function saveDeck(deck: Deck): boolean {
  const others = read().filter((d) => d.id !== deck.id)
  return write([deck, ...others].slice(0, MAX_DECKS))
}

export function deleteDeck(id: string): void {
  write(read().filter((d) => d.id !== id))
}

export function loadDeck(id: string): Deck | null {
  return read().find((d) => d.id === id) ?? null
}
