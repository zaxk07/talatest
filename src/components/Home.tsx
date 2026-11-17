import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type DragEvent } from 'react'
import { ArrowRight, BookOpen, FileText, Layers, Lock, Presentation, Puzzle, RotateCcw, Sparkles, Upload, Zap, type LucideProps } from 'lucide-react'
import type { Route, StudyMode } from '../router'
import { useDeckStore } from '../state/deckStore'
import { mergeDocs, parseFiles, parseText } from '../utils/documentParser'
import { SAMPLE_NAME, SAMPLE_NOTES } from '../utils/sampleNotes'
import { stripExt } from './shared'

const ACCEPT = '.pdf,.pptx,.docx,.txt,.md,.markdown'

const MODES: { id: StudyMode; title: string; blurb: string; Icon: ComponentType<LucideProps> }[] = [
  { id: 'guide', title: 'Study Guide', blurb: 'Topic summaries, key takeaways and an A–Z glossary, each cited back to your notes.', Icon: BookOpen },
  { id: 'cards', title: 'Smart Flashcards', blurb: 'Flip, rate, and re-queue what you miss until every card is mastered.', Icon: Layers },
  { id: 'exam', title: 'Exam & Kahoot Mode', blurb: 'Calm untimed exams, or a speed round with a countdown, bonuses and streaks.', Icon: Zap },
  { id: 'match', title: 'Speed Match', blurb: 'Pair terms with definitions against the clock and beat your best time.', Icon: Puzzle },
]

/** Landing-page demo: a real flashcard the visitor can flip. */
function LivePreview() {
  const [flipped, setFlipped] = useState(false)
  return (
    <div className="mx-auto w-full max-w-md" aria-label="Live flashcard preview">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">Live preview</p>
        <p className="text-xs text-muted tnum">Card 3 of 24</p>
      </div>
      <div className="flip-scene">
        <div className={`flip-card h-64 sm:h-72 ${flipped ? 'is-flipped' : ''}`}>
          <button
            type="button"
            className="flip-face card flex h-full w-full cursor-pointer flex-col items-center justify-center text-center"
            onClick={() => setFlipped(true)}
            aria-hidden={flipped}
            tabIndex={flipped ? -1 : 0}
            aria-label="Sample flashcard front: Mutex. Press to flip."
          >
            <span className="eyebrow">Term</span>
            <span className="mt-3 font-display text-4xl font-bold">Mutex</span>
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted">
              <RotateCcw className="size-3.5" aria-hidden /> Tap to flip
            </span>
          </button>
          <button
            type="button"
            className="flip-face flip-back card flex h-full w-full cursor-pointer flex-col justify-center border-accent text-left"
            onClick={() => setFlipped(false)}
            aria-hidden={!flipped}
            tabIndex={flipped ? 0 : -1}
            aria-label="Sample flashcard back. Press to flip back."
          >
            <span className="eyebrow">Definition</span>
            <span className="mt-2 text-lg font-semibold leading-snug">
              a lock that lets only one thread enter a critical section at a time
            </span>
            <span className="mt-4 rounded-xl bg-accent-soft p-3 text-sm">
              <span className="block italic">“A mutex is a lock that lets only one thread enter a critical section at a time.”</span>
              <span className="mt-1 block text-xs text-muted">operating-systems.pdf › Page 4 — Synchronization</span>
            </span>
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3" aria-hidden>
        <span className="btn !min-h-10 justify-center border-bad text-bad opacity-60"><RotateCcw className="size-4" /> Still learning</span>
        <span className="btn btn-good !min-h-10 justify-center opacity-60">Mastered</span>
      </div>
    </div>
  )
}

export function Home({
  route,
  navigate,
  onLaunchMode,
}: {
  route: Route
  navigate: (r: Route) => void
  onLaunchMode: (m: StudyMode) => void
}) {
  const { createDeck } = useDeckStore()
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const modesRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (route.page === 'modes') modesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [route.page])

  /** Quick launcher: files in → reviewer built → straight into the practice exam. */
  async function quickLaunch(list: FileList | File[]) {
    const files = Array.from(list)
    if (!files.length) return
    setBusy(true)
    setError(null)
    const { docs, errors } = await parseFiles(files)
    setBusy(false)
    if (docs.length === 0) {
      setError(errors[0] ?? 'Could not read that file.')
      return
    }
    const title = docs.length === 1 ? stripExt(docs[0].name) : `${stripExt(docs[0].name)} + ${docs.length - 1} more`
    createDeck(title, mergeDocs(docs))
    navigate({ page: 'workspace', mode: 'exam' })
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void quickLaunch(e.dataTransfer.files)
  }

  function trySample() {
    createDeck('Computer Networks & Operating Systems', mergeDocs([parseText(SAMPLE_NOTES, SAMPLE_NAME)]))
    navigate({ page: 'workspace', mode: 'cards' })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <section className="grid items-center gap-10 pt-8 sm:pt-14 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        <div className="animate-rise">
          <p className="eyebrow inline-flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden /> No API keys · 100% in your browser</p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.05] sm:text-6xl">
            Turn your notes into a <span className="text-accent">reviewer</span> you can actually remember.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted sm:mt-5 sm:text-lg">
            Drop a lecture PDF, PowerPoint or Word doc. TalaTest builds a study guide, active-recall flashcards, a
            practice exam and a match game — nothing ever leaves your device.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`card mt-6 flex flex-col gap-3 !p-3 sm:flex-row sm:items-center sm:!p-2.5 [transition:border-color_200ms_var(--ease-out),background-color_200ms_var(--ease-out)] ${
              dragging ? '!border-accent !bg-accent-soft' : ''
            }`}
          >
            <div className="flex flex-1 items-center gap-2 px-2 text-sm font-semibold">
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1"><FileText className="size-3.5" aria-hidden />PDF</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1"><Presentation className="size-3.5" aria-hidden />PPTX</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1"><FileText className="size-3.5" aria-hidden />DOCX</span>
              <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="truncate">Practice Exam</span>
            </div>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" aria-hidden /> {busy ? 'Building…' : 'Upload & build exam'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                void quickLaunch(e.target.files ?? [])
                e.target.value = ''
              }}
            />
          </div>
          <p className="mt-3 text-sm text-muted">
            or drop a file on the bar ·{' '}
            <button type="button" className="font-semibold text-accent underline-offset-4 hover:underline" onClick={trySample}>
              <Sparkles className="mr-1 inline size-3.5" aria-hidden />try the sample notes
            </button>
          </p>
          {error && <p role="alert" className="mt-3 rounded-xl bg-bad-soft p-3 text-sm text-bad">{error}</p>}
        </div>

        <div className="animate-rise [animation-delay:120ms]">
          <LivePreview />
        </div>
      </section>

      <section ref={modesRef} id="modes" className="mt-20 sm:mt-28" aria-labelledby="modes-h">
        <p className="eyebrow">Study modes</p>
        <h2 id="modes-h" className="mt-2 max-w-2xl text-3xl font-bold sm:text-4xl">Four ways to make it stick</h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map(({ id, title, blurb, Icon }, i) => (
            <li key={id} className="tile-in" style={{ '--i': i } as CSSProperties}>
              <button
                type="button"
                onClick={() => onLaunchMode(id)}
                className="card group flex h-full w-full cursor-pointer flex-col text-left [transition:transform_200ms_var(--ease-out),border-color_200ms_var(--ease-out)] hover:border-accent active:scale-[0.98] sm:hover:-translate-y-0.5"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="mt-4 font-display text-xl font-bold">{title}</span>
                <span className="mt-1.5 flex-1 text-sm text-muted">{blurb}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                  Launch <ArrowRight className="size-4 [transition:transform_200ms_var(--ease-out)] group-hover:translate-x-0.5" aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
