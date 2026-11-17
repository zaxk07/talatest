import type { CSSProperties } from 'react'
import { BookOpen, Layers, Plus, Puzzle, Trash2, Zap } from 'lucide-react'
import type { StudyMode } from '../router'
import type { Deck } from '../types'
import { useDeckStore } from '../state/deckStore'

const QUICK: { id: StudyMode; label: string; Icon: typeof Layers }[] = [
  { id: 'cards', label: 'Flashcards', Icon: Layers },
  { id: 'exam', label: 'Exam', Icon: Zap },
  { id: 'match', label: 'Match', Icon: Puzzle },
]

/** Library of every reviewer saved in localStorage. */
export function Decks({
  onOpen,
  onNew,
}: {
  onOpen: (deck: Deck, mode: StudyMode) => void
  onNew: () => void
}) {
  const { decks, removeDeck } = useDeckStore()

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-14">
      <section className="animate-rise">
        <p className="eyebrow">My decks</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Your reviewers</h1>
        <p className="mt-3 text-muted tnum">
          {decks.length === 0 ? 'Nothing saved yet.' : `${decks.length} saved on this device.`} Stored in your browser only.
        </p>
      </section>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li className="tile-in" style={{ '--i': 0 } as CSSProperties}>
          <button
            type="button"
            onClick={onNew}
            className="flex h-full min-h-44 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line p-5 text-center font-semibold text-muted [transition:border-color_200ms_var(--ease-out),color_200ms_var(--ease-out),transform_200ms_var(--ease-out)] hover:border-accent hover:text-accent active:scale-[0.98]"
          >
            <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent"><Plus className="size-5" aria-hidden /></span>
            New reviewer
          </button>
        </li>
        {decks.map((d, i) => (
          <li key={d.id} className="tile-in" style={{ '--i': i + 1 } as CSSProperties}>
            <article className="card flex h-full flex-col">
              <h2 className="line-clamp-2 break-words font-display text-xl font-bold">{d.name}</h2>
              <p className="mt-1 text-sm text-muted tnum">
                {d.concepts.length} concepts · {d.sections.length} sections
              </p>
              <p className="text-xs text-muted">Created {new Date(d.createdAt).toLocaleDateString()}</p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                <button type="button" className="btn btn-primary" onClick={() => onOpen(d, 'guide')}>
                  <BookOpen className="size-4" aria-hidden /> Open
                </button>
                {QUICK.map(({ id, label, Icon }) => (
                  <button key={id} type="button" className="btn !px-3" title={label} aria-label={`${label} for ${d.name}`} onClick={() => onOpen(d, id)}>
                    <Icon className="size-4" aria-hidden />
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost ml-auto !px-3 text-bad"
                  aria-label={`Delete ${d.name}`}
                  onClick={() => removeDeck(d.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  )
}
