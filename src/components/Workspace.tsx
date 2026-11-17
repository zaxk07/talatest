import { useMemo, type ComponentType } from 'react'
import { ArrowLeft, BookOpen, Download, Layers, Puzzle, Zap, type LucideProps } from 'lucide-react'
import type { Deck } from '../types'
import { useDeckStore } from '../state/deckStore'
import { buildMarkdown, buildText, downloadFile, safeFileName } from '../utils/exporter'
import { DEFAULT_CONFIG, generateQuiz } from '../utils/quizGenerator'
import { createRng } from '../utils/seededRandom'
import type { StudyMode } from '../router'
import { Exam } from './Exam'
import { Flashcards } from './Flashcards'
import { MatchGame } from './MatchGame'
import { StudyGuide } from './StudyGuide'

type Tab = StudyMode

const TABS: { id: Tab; label: string; Icon: ComponentType<LucideProps> }[] = [
  { id: 'guide', label: 'Study Guide', Icon: BookOpen },
  { id: 'cards', label: 'Flashcards', Icon: Layers },
  { id: 'exam', label: 'Exam', Icon: Zap },
  { id: 'match', label: 'Match', Icon: Puzzle },
]

function ExportMenu({ deck }: { deck: Deck }) {
  const { say } = useDeckStore()
  const run = (kind: 'md' | 'txt') => {
    // Seed from the deck id so the printed quiz and its answer key always agree.
    const seed = [...deck.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
    const questions = generateQuiz(deck.concepts, { ...DEFAULT_CONFIG, count: 15 }, createRng(seed))
    const base = safeFileName(deck.name)
    if (kind === 'md') downloadFile(`${base}-reviewer.md`, buildMarkdown(deck, questions), 'text/markdown')
    else downloadFile(`${base}-reviewer.txt`, buildText(deck, questions), 'text/plain')
    say(`Downloaded ${base}-reviewer.${kind}`)
  }
  return (
    <div className="flex gap-2">
      <button className="btn" onClick={() => run('md')} title="Study guide + practice quiz + answer key"><Download className="size-4" aria-hidden /> .md</button>
      <button className="btn" onClick={() => run('txt')} title="Study guide + practice quiz + answer key"><Download className="size-4" aria-hidden /> .txt</button>
    </div>
  )
}

export function Workspace({ deck, mode: tab, onMode: setTab, onBack }: { deck: Deck; mode: StudyMode; onMode: (m: StudyMode) => void; onBack: () => void }) {
  const stats = useMemo(() => `${deck.concepts.length} concepts · ${deck.sections.length} sections · ${deck.sources.length} ${deck.sources.length === 1 ? 'source' : 'sources'}`, [deck])

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-4 sm:px-6 sm:pb-16 sm:pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button className="btn btn-ghost !min-h-9 !px-2 text-muted" onClick={onBack}><ArrowLeft className="size-4" aria-hidden /> Back to Home</button>
          <h1 className="mt-1 break-words text-2xl font-bold sm:text-4xl">{deck.name}</h1>
          <p className="text-sm text-muted">{stats}</p>
        </div>
        <div className="no-print">
          <p className="eyebrow mb-1">Export printable reviewer</p>
          <ExportMenu deck={deck} />
        </div>
      </div>

      <nav
        aria-label="Study modes"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:backdrop-blur-none"
      >
        <div role="tablist" className="mx-auto grid max-w-5xl grid-cols-4 gap-1 p-1 sm:inline-flex sm:gap-2 sm:rounded-2xl sm:border sm:border-line sm:bg-surface sm:p-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="mode-panel"
              onClick={() => setTab(t.id)}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-xs font-semibold [transition:background-color_160ms_var(--ease-out),transform_160ms_var(--ease-out)] active:scale-[0.96] sm:min-h-11 sm:flex-row sm:gap-2 sm:text-sm ${
                tab === t.id ? 'bg-accent text-accent-ink' : 'hover:bg-accent-soft'
              }`}
            >
              <t.Icon aria-hidden className="size-5 sm:size-4" strokeWidth={tab === t.id ? 2.4 : 2} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main id="mode-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-4 sm:mt-6">
        {tab === 'guide' && <StudyGuide deck={deck} />}
        {tab === 'cards' && <Flashcards key={deck.id} deck={deck} />}
        {tab === 'exam' && <Exam key={deck.id} deck={deck} />}
        {tab === 'match' && <MatchGame key={deck.id} deck={deck} />}
      </main>
    </div>
  )
}
