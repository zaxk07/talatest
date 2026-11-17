import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { CheckCircle2, Medal, RefreshCw, Timer } from 'lucide-react'
import type { Concept, Deck } from '../types'
import { formatTime, useStopwatch } from '../hooks/hooks'
import { useDeckStore } from '../state/deckStore'
import { shortenClause } from '../utils/quizGenerator'
import { createRng, randomSeed, shuffle } from '../utils/seededRandom'

interface Tile {
  key: string
  conceptId: string
  side: 'term' | 'def'
  text: string
}

const PAIRS = 6

function buildBoard(concepts: Concept[]): Tile[] {
  const rng = createRng(randomSeed())
  const pool = concepts.filter((c) => c.kind !== 'fact')
  const base = pool.length >= 3 ? pool : concepts
  const picked = shuffle(base, rng).slice(0, PAIRS)
  const tiles: Tile[] = picked.flatMap((c) => [
    { key: `${c.id}-t`, conceptId: c.id, side: 'term' as const, text: c.kind === 'fact' ? shortenClause(c.term, 90) : c.term },
    { key: `${c.id}-d`, conceptId: c.id, side: 'def' as const, text: shortenClause(c.definition, 140) },
  ])
  return shuffle(tiles, rng)
}

export function MatchGame({ deck }: { deck: Deck }) {
  const { patchDeck } = useDeckStore()
  const [tiles, setTiles] = useState<Tile[]>(() => buildBoard(deck.concepts))
  const [cleared, setCleared] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [wrong, setWrong] = useState<string[]>([])
  const [mistakes, setMistakes] = useState(0)
  const [finished, setFinished] = useState<{ time: number; record: boolean } | null>(null)
  const watch = useStopwatch()
  const lock = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const tileByKey = useMemo(() => new Map(tiles.map((t) => [t.key, t])), [tiles])
  const pairs = tiles.length / 2

  const newBoard = useCallback(() => {
    window.clearTimeout(timer.current)
    lock.current = false
    watch.reset()
    setTiles(buildBoard(deck.concepts))
    setCleared(new Set())
    setSelected(null)
    setWrong([])
    setMistakes(0)
    setFinished(null)
  }, [deck.concepts, watch])

  function tap(tile: Tile) {
    if (lock.current || cleared.has(tile.key) || finished) return
    if (!watch.running) watch.start()
    if (selected === null) {
      setSelected(tile.key)
      return
    }
    if (selected === tile.key) {
      setSelected(null)
      return
    }
    const first = tileByKey.get(selected)!
    if (first.side === tile.side) {
      setSelected(tile.key) // switch selection within the same column type
      return
    }
    if (first.conceptId === tile.conceptId) {
      const next = new Set(cleared).add(first.key).add(tile.key)
      setCleared(next)
      setSelected(null)
      if (next.size === tiles.length) {
        const time = watch.stop()
        const record = deck.bestMatchTime === undefined || time < deck.bestMatchTime
        if (record) patchDeck({ bestMatchTime: time })
        setFinished({ time, record })
      }
    } else {
      lock.current = true
      setWrong([first.key, tile.key])
      setMistakes((m) => m + 1)
      timer.current = window.setTimeout(() => {
        setWrong([])
        setSelected(null)
        lock.current = false
      }, 600)
    }
  }

  if (deck.concepts.length < 3) {
    return <p className="card">Match needs at least 3 terms — add more notes with definitions.</p>
  }

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <p className="inline-flex items-center gap-2 font-mono text-3xl font-bold tabular-nums" aria-label="Elapsed time" role="timer"><Timer className="size-5 text-muted" aria-hidden />{formatTime(watch.ms)}</p>
          <div className="text-sm text-muted">
            <p>{cleared.size / 2}/{pairs} pairs · {mistakes} {mistakes === 1 ? 'miss' : 'misses'}</p>
            <p>Best: {deck.bestMatchTime !== undefined ? formatTime(deck.bestMatchTime) : '—'}</p>
          </div>
        </div>
        <button className="btn" onClick={newBoard}><RefreshCw className="size-4" aria-hidden /> New board</button>
      </div>
      <p className="mt-2 hidden text-sm text-muted sm:block">Tap a term, then its matching definition. The clock starts on your first tap.</p>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:mt-4 sm:grid-cols-3 sm:gap-3" role="group" aria-label="Match board">
        {tiles.map((t, n) => {
          const isCleared = cleared.has(t.key)
          const isSel = selected === t.key
          const isWrong = wrong.includes(t.key)
          return (
            <button
              key={t.key}
              type="button"
              disabled={isCleared}
              aria-pressed={isSel}
              onClick={() => tap(t)}
              style={{ '--i': n } as CSSProperties}
              className={`tile ${isCleared ? '' : 'tile-in'} min-h-[4.5rem] rounded-2xl border-2 p-3 text-center sm:min-h-24 ${
                t.side === 'term' ? 'font-display text-base font-bold sm:text-lg' : 'text-sm font-medium'
              } ${
                isCleared
                  ? 'pointer-events-none scale-90 border-transparent bg-good-soft text-good opacity-0'
                  : isWrong
                    ? 'animate-shake border-bad bg-bad-soft'
                    : isSel
                      ? 'border-accent bg-accent-soft -translate-y-0.5 ring-4 ring-accent/25'
                      : t.side === 'term'
                        ? 'border-line bg-surface hover:border-accent'
                        : 'border-dashed border-line bg-surface hover:border-accent'
              }`}
            >
              {t.text}
            </button>
          )
        })}
      </div>

      {finished && (
        <div className="card animate-pop mx-auto mt-6 max-w-md text-center" role="status">
          {finished.record ? <Medal className="mx-auto size-10 text-accent" aria-hidden strokeWidth={1.5} /> : <CheckCircle2 className="mx-auto size-10 text-good" aria-hidden strokeWidth={1.5} />}
          <h2 className="mt-2 text-2xl font-bold">Board cleared in {formatTime(finished.time)}</h2>
          <p className="text-muted">{finished.record ? 'New best time!' : `Best: ${formatTime(deck.bestMatchTime ?? finished.time)}`} · {mistakes} {mistakes === 1 ? 'miss' : 'misses'}</p>
          <button className="btn btn-primary mt-4" onClick={newBoard}>Play again</button>
        </div>
      )}
    </div>
  )
}
