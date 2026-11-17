import { useCallback, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, PartyPopper, RotateCcw, Shuffle } from 'lucide-react'
import type { Concept, Deck } from '../types'
import { useHotkeys } from '../hooks/hooks'
import { useDeckStore } from '../state/deckStore'
import { conceptFront } from '../utils/quizGenerator'
import { createRng, randomSeed, shuffle } from '../utils/seededRandom'
import { ProgressRing } from './shared'

/** Insert `id` so that it comes back after `gap` other cards. */
function requeue(queue: string[], pos: number, gap: number): string[] {
  const id = queue[pos]
  const rest = queue.filter((_, i) => i !== pos)
  const at = Math.min(pos + gap, rest.length)
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

export function Flashcards({ deck }: { deck: Deck }) {
  const { patchDeck } = useDeckStore()
  const byId = useMemo(() => new Map(deck.concepts.map((c) => [c.id, c])), [deck.concepts])
  const total = deck.concepts.length
  const [queue, setQueue] = useState<string[]>(() => deck.concepts.map((c) => c.id).filter((id) => !deck.mastered.includes(id)))
  const [pos, setPos] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [learningCount, setLearningCount] = useState(0)

  const mastered = deck.mastered.length
  const current: Concept | undefined = byId.get(queue[Math.min(pos, queue.length - 1)] ?? '')

  const go = useCallback(
    (delta: number) => {
      if (!queue.length) return
      setFlipped(false)
      setPos((p) => (p + delta + queue.length) % queue.length)
    },
    [queue.length],
  )

  const rate = useCallback(
    (kind: 'learning' | 'mastered') => {
      if (!current) return
      setFlipped(false)
      if (kind === 'mastered') {
        const next = queue.filter((_, i) => i !== pos)
        setQueue(next)
        setPos(next.length ? pos % next.length : 0)
        if (!deck.mastered.includes(current.id)) patchDeck({ mastered: [...deck.mastered, current.id] })
      } else {
        setLearningCount((n) => n + 1)
        setQueue(requeue(queue, pos, 3))
        setPos((p) => (queue.length > 1 ? p % queue.length : 0))
        if (deck.mastered.includes(current.id)) patchDeck({ mastered: deck.mastered.filter((m) => m !== current.id) })
      }
    },
    [current, queue, pos, deck.mastered, patchDeck],
  )

  const restart = (doShuffle: boolean) => {
    patchDeck({ mastered: [] })
    const ids = deck.concepts.map((c) => c.id)
    setQueue(doShuffle ? shuffle(ids, createRng(randomSeed())) : ids)
    setPos(0)
    setFlipped(false)
    setLearningCount(0)
  }

  useHotkeys({
    Space: () => current && setFlipped((f) => !f),
    ArrowRight: () => go(1),
    ArrowLeft: () => go(-1),
    '1': () => flipped && rate('learning'),
    '2': () => flipped && rate('mastered'),
  })

  if (total === 0) {
    return <p className="card">No flashcards could be built from these notes. Try notes with definitions like “Term: meaning”.</p>
  }

  if (queue.length === 0 || !current) {
    return (
      <div className="card animate-pop mx-auto max-w-xl text-center">
        <PartyPopper className="mx-auto size-12 text-accent" aria-hidden strokeWidth={1.5} />
        <h2 className="mt-3 text-3xl font-bold">All {total} cards mastered!</h2>
        <p className="mt-2 text-muted">Great recall. Review again later to lock it in.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button className="btn btn-primary" onClick={() => restart(true)}>Study again (shuffled)</button>
        </div>
      </div>
    )
  }

  const frontIsPrompt = current.kind !== 'definition'
  return (
    <div className="animate-rise mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow tnum">Card {Math.min(pos, queue.length - 1) + 1} of {queue.length} in queue</p>
          <p className="text-sm text-muted tnum">{mastered} mastered · {learningCount} re-queued</p>
        </div>
        <ProgressRing value={mastered / total} size={56} />
      </div>

      <div className="flip-scene mt-3 sm:mt-5">
        <div
          className={`flip-card h-[clamp(15rem,46svh,24rem)] sm:h-96 ${flipped ? 'is-flipped' : ''}`}
        >
          <button
            type="button"
            className="flip-face card flex h-full w-full cursor-pointer flex-col items-center justify-center text-center"
            onClick={() => setFlipped(true)}
            aria-hidden={flipped}
            tabIndex={flipped ? -1 : 0}
            aria-label={`Flashcard front: ${conceptFront(current)}. Press to flip.`}
          >
            <span className="eyebrow">{current.kind === 'acronym' ? 'Acronym' : frontIsPrompt ? 'Cause & effect' : 'Term'}</span>
            <span className="mt-3 font-display text-2xl font-bold leading-tight sm:text-4xl">{conceptFront(current)}</span>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted"><RotateCcw className="size-3.5" aria-hidden /> Tap or press Space to flip</span>
          </button>
          <div
            className="flip-face flip-back card flex h-full w-full flex-col justify-center border-accent text-left"
            aria-hidden={!flipped}
            onClick={() => setFlipped(false)}
          >
            <span className="eyebrow">Definition</span>
            <p className="mt-2 text-lg font-semibold leading-snug sm:text-xl">{current.definition}</p>
            <div className="mt-4 rounded-xl bg-accent-soft p-3 text-sm">
              <p className="italic">“{current.sourceSnippet}”</p>
              <p className="mt-1 text-xs text-muted">{current.citation}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-5">
        <button className="btn !min-h-14 border-bad text-bad" disabled={!flipped} onClick={() => rate('learning')}>
          <RotateCcw className="size-4" aria-hidden /> Still learning <kbd className="hidden text-xs opacity-60 sm:inline">1</kbd>
        </button>
        <button className="btn btn-good !min-h-14" disabled={!flipped} onClick={() => rate('mastered')}>
          <Check className="size-4" aria-hidden strokeWidth={2.8} /> Mastered <kbd className="hidden text-xs opacity-70 sm:inline">2</kbd>
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between sm:mt-3">
        <button className="btn btn-ghost" onClick={() => go(-1)} aria-label="Previous card"><ArrowLeft className="size-4" aria-hidden /> Prev</button>
        <button className="btn btn-ghost" onClick={() => restart(true)}><Shuffle className="size-4" aria-hidden /> Shuffle<span className="hidden sm:inline"> &amp; reset</span></button>
        <button className="btn btn-ghost" onClick={() => go(1)} aria-label="Next card">Next <ArrowRight className="size-4" aria-hidden /></button>
      </div>
      <p className="mt-3 hidden text-center text-xs text-muted sm:block">Space flips · ← → browse · 1 still learning · 2 mastered</p>
    </div>
  )
}
