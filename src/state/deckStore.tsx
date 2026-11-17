import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Deck, Section } from '../types'
import { buildDeck } from '../utils/quizGenerator'
import { deleteDeck, listDecks, saveDeck } from '../utils/storage'

interface Store {
  deck: Deck | null
  decks: Deck[]
  notice: string | null
  createDeck: (name: string, sections: Section[]) => Deck
  openDeck: (deck: Deck) => void
  closeDeck: () => void
  removeDeck: (id: string) => void
  patchDeck: (patch: Partial<Pick<Deck, 'mastered' | 'bestMatchTime'>>) => void
  say: (message: string) => void
}

const Ctx = createContext<Store | null>(null)

export function DeckProvider({ children }: { children: ReactNode }) {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [decks, setDecks] = useState<Deck[]>(() => listDecks())
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const say = useCallback((message: string) => {
    setNotice(message)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(null), 4500)
  }, [])

  const persist = useCallback(
    (d: Deck) => {
      if (!saveDeck(d)) say('Your browser storage is full — this deck could not be saved for next time.')
      setDecks(listDecks())
    },
    [say],
  )

  const createDeck = useCallback(
    (name: string, sections: Section[]) => {
      const d = buildDeck(name, sections)
      setDeck(d)
      persist(d)
      return d
    },
    [persist],
  )

  const openDeck = useCallback(
    (d: Deck) => {
      setDeck(d)
      persist(d) // bumps to the front of "recent"
    },
    [persist],
  )

  const closeDeck = useCallback(() => setDeck(null), [])

  const removeDeck = useCallback((id: string) => {
    deleteDeck(id)
    setDecks(listDecks())
    setDeck((cur) => (cur?.id === id ? null : cur))
  }, [])

  const deckRef = useRef<Deck | null>(null)
  useEffect(() => {
    deckRef.current = deck
  }, [deck])

  const patchDeck = useCallback(
    (patch: Partial<Pick<Deck, 'mastered' | 'bestMatchTime'>>) => {
      const cur = deckRef.current
      if (!cur) return
      const next = { ...cur, ...patch }
      deckRef.current = next
      setDeck(next)
      persist(next)
    },
    [persist],
  )

  const value = useMemo<Store>(
    () => ({ deck, decks, notice, createDeck, openDeck, closeDeck, removeDeck, patchDeck, say }),
    [deck, decks, notice, createDeck, openDeck, closeDeck, removeDeck, patchDeck, say],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDeckStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useDeckStore must be used inside <DeckProvider>')
  return s
}
