import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  Circle,
  Diamond,
  Dumbbell,
  Flame,
  Leaf,
  PartyPopper,
  Square,
  ThumbsUp,
  Timer,
  Triangle,
  Trophy,
  X,
  Zap,
  type LucideProps,
} from 'lucide-react'
import type { Deck, Difficulty, PlayMode, Question, QuestionType, QuizConfig } from '../types'
import { useCountdown, useHotkeys } from '../hooks/hooks'
import { DEFAULT_CONFIG, generateQuiz, isCorrect } from '../utils/quizGenerator'
import { createRng, randomSeed } from '../utils/seededRandom'
import { StreakBadge } from './shared'

interface Answer {
  response: number | string | null // null = timed out / skipped
  correct: boolean
  points: number
}

interface Session {
  questions: Question[]
  config: QuizConfig
  mode: PlayMode
  round: number
}

const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: 'Multiple choice',
  identification: 'Identification',
  truefalse: 'True / False',
}

export function Exam({ deck }: { deck: Deck }) {
  const [config, setConfig] = useState<QuizConfig>(DEFAULT_CONFIG)
  const [mode, setMode] = useState<PlayMode>('calm')
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<{ session: Session; answers: Answer[]; bestStreak: number } | null>(null)

  const available = deck.concepts.length

  const start = useCallback(
    (cfg: QuizConfig, m: PlayMode, round: number, onlyConceptIds?: string[]) => {
      const questions = generateQuiz(deck.concepts, cfg, createRng(randomSeed()), { onlyConceptIds })
      if (questions.length === 0) return false
      setResult(null)
      setSession({ questions, config: cfg, mode: m, round })
      return true
    },
    [deck.concepts],
  )

  if (session && !result) {
    return (
      <Runner
        key={`${session.round}-${session.questions[0]?.id}`}
        session={session}
        onFinish={(answers, bestStreak) => setResult({ session, answers, bestStreak })}
        onQuit={() => setSession(null)}
      />
    )
  }

  if (result) {
    return (
      <Results
        result={result}
        onRetryMissed={() => {
          const missed = result.answers
            .map((a, i) => (a.correct ? null : result.session.questions[i].conceptId))
            .filter((x): x is string => x !== null)
          start(result.session.config, result.session.mode, result.session.round + 1, missed)
        }}
        onNew={() => start(result.session.config, result.session.mode, 1)}
        onSetup={() => {
          setResult(null)
          setSession(null)
        }}
      />
    )
  }

  const toggleType = (t: QuestionType) =>
    setConfig((c) => {
      const has = c.types.includes(t)
      if (has && c.types.length === 1) return c
      return { ...c, types: has ? c.types.filter((x) => x !== t) : [...c.types, t] }
    })

  return (
    <div className="animate-rise mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Set up your exam</h2>
        <p className="text-muted">{available} concepts available · every answer cites your notes.</p>
      </div>

      <fieldset className="card">
        <legend className="eyebrow px-1">Play mode</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {(
            [
              ['calm', Leaf, 'Calm exam', 'Untimed. Go back and forth and review at your own pace.'],
              ['kahoot', Zap, 'Speed round', 'Countdown timer, speed bonus, answer streaks & bold tiles.'],
            ] as const
          ).map(([id, Icon, title, desc]) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
              className={`tile rounded-2xl border-2 p-4 text-left ${mode === id ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent'}`}
            >
              <span className="flex items-center gap-2 font-bold"><Icon className="size-4 text-accent" aria-hidden />{title}</span>
              <span className="mt-1 block text-sm text-muted">{desc}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="card">
        <legend className="eyebrow px-1">Question count</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {([5, 10, 15, 20] as const).map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={config.count === n} onClick={() => setConfig({ ...config, count: n })}>
              {n}
            </button>
          ))}
        </div>
        {config.count > available && <p className="mt-2 text-sm text-muted">Only {available} concepts available — the quiz will have {available} questions.</p>}
      </fieldset>

      <fieldset className="card">
        <legend className="eyebrow px-1">Question types</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={config.types.includes(t)} onClick={() => toggleType(t)}>
              {config.types.includes(t) && <Check className="size-4" aria-hidden strokeWidth={2.8} />}{TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="card">
        <legend className="eyebrow px-1">Difficulty</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {(
            [
              ['standard', 'Standard', 'Forgiving typos, broader distractors.'],
              ['challenge', 'Challenge / Strict', 'Exact spelling, look-alike distractors, shorter timers.'],
            ] as const
          ).map(([id, title, desc]) => (
            <button
              key={id}
              type="button"
              aria-pressed={config.difficulty === id}
              onClick={() => setConfig({ ...config, difficulty: id as Difficulty })}
              className={`tile rounded-2xl border-2 p-4 text-left ${config.difficulty === id ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent'}`}
            >
              <span className="block font-bold">{title}</span>
              <span className="mt-1 block text-sm text-muted">{desc}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <button className="btn btn-primary w-full !min-h-14 text-base" disabled={available === 0} onClick={() => start(config, mode, 1)}>
        Start {mode === 'kahoot' ? 'speed round' : 'exam'} <ArrowRight className="size-5" aria-hidden />
      </button>
      {available === 0 && <p className="text-sm text-bad">No concepts could be extracted — add notes with definitions first.</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */

const TILE_STYLES: { bg: string; Shape: ComponentType<LucideProps> }[] = [
  { bg: 'bg-kh-red', Shape: Triangle },
  { bg: 'bg-kh-blue', Shape: Diamond },
  { bg: 'bg-kh-yellow', Shape: Circle },
  { bg: 'bg-kh-green', Shape: Square },
]

function secondsFor(q: Question, d: Difficulty): number {
  const base = q.type === 'identification' ? 30 : 20
  return d === 'challenge' ? Math.round(base / 2) : base
}

function Runner({
  session,
  onFinish,
  onQuit,
}: {
  session: Session
  onFinish: (answers: Answer[], bestStreak: number) => void
  onQuit: () => void
}) {
  const { questions, config, mode } = session
  const kahoot = mode === 'kahoot'
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<(Answer | undefined)[]>(() => questions.map(() => undefined))
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [typed, setTyped] = useState('')
  const q = questions[idx]
  const answer = answers[idx]
  const score = answers.reduce((s, a) => s + (a?.points ?? 0), 0)
  const correctCount = answers.filter((a) => a?.correct).length
  const answeredCount = answers.filter(Boolean).length
  const total = secondsFor(q, config.difficulty)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = useCallback(
    (response: number | string | null, remaining: number) => {
      if (answers[idx]) return
      const ok = response !== null && isCorrect(q, response, config.difficulty)
      let points = 0
      if (ok) {
        const nextStreak = streak + 1
        points = kahoot ? Math.round(1000 * (0.5 + 0.5 * (remaining / total))) + 100 * Math.min(nextStreak - 1, 5) : 1000
        setStreak(nextStreak)
        setBestStreak((b) => Math.max(b, nextStreak))
      } else {
        setStreak(0)
      }
      setAnswers((cur) => cur.map((a, i) => (i === idx ? { response, correct: ok, points } : a)))
    },
    [answers, idx, q, config.difficulty, kahoot, streak, total],
  )

  const remaining = useCountdown(total, kahoot && !answer, `${idx}`, () => submit(null, 0))

  useEffect(() => {
    setTyped('')
    if (q.type === 'identification') inputRef.current?.focus()
  }, [idx, q.type])

  const last = idx === questions.length - 1
  const finish = useCallback(
    () =>
      onFinish(
        answers.map((a) => a ?? { response: null, correct: false, points: 0 }),
        bestStreak,
      ),
    [answers, bestStreak, onFinish],
  )
  const next = useCallback(() => {
    if (last) finish()
    else setIdx((i) => i + 1)
  }, [last, finish])

  useHotkeys(
    {
      Enter: () => answer && next(),
      '1': () => !answer && q.type !== 'identification' && submit(0, remaining),
      '2': () => !answer && q.type !== 'identification' && q.options.length > 1 && submit(1, remaining),
      '3': () => !answer && q.type === 'mcq' && q.options.length > 2 && submit(2, remaining),
      '4': () => !answer && q.type === 'mcq' && q.options.length > 3 && submit(3, remaining),
      ArrowRight: () => !kahoot && idx < questions.length - 1 && setIdx(idx + 1),
      ArrowLeft: () => !kahoot && idx > 0 && setIdx(idx - 1),
    },
    true,
  )

  const optionState = (i: number): 'idle' | 'right' | 'wrong' | 'dim' => {
    if (!answer) return 'idle'
    if (i === q.correctIndex) return 'right'
    if (answer.response === i) return 'wrong'
    return 'dim'
  }

  const pct = remaining / total
  return (
    <div className="mx-auto max-w-3xl animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="btn btn-ghost" onClick={onQuit}><X className="size-4" aria-hidden /> Quit</button>
        <div className="flex items-center gap-3 text-sm font-semibold">
          {session.round > 1 && <span className="rounded-full bg-accent-soft px-3 py-1">Retry round {session.round}</span>}
          {kahoot && <StreakBadge streak={streak} />}
          <span className="tnum">{kahoot ? `${score.toLocaleString()} pts` : `${correctCount}/${answeredCount} correct`}</span>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={idx + 1} aria-label="Quiz progress">
        <div className="h-full bg-accent [transition:width_400ms_var(--ease-out)]" style={{ width: `${((idx + (answer ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>
      <p className="eyebrow tnum mt-3">Question {idx + 1} of {questions.length} · {TYPE_LABEL[q.type]}</p>

      {kahoot && (
        <div className="mt-2 flex items-center gap-3" aria-live="off">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-line">
            <div className={`h-full ${pct < 0.25 ? 'bg-bad' : 'bg-good'}`} style={{ width: `${answer ? 0 : pct * 100}%`, transition: 'width 0.1s linear' }} />
          </div>
          <Timer className="size-4 text-muted" aria-hidden />
          <span className="w-8 text-right font-mono text-lg font-bold tabular-nums">{answer ? '—' : Math.ceil(remaining)}</span>
        </div>
      )}

      <div className="card mt-3 !p-5 sm:mt-4 sm:!p-8">
        {q.type === 'truefalse' && <p className="eyebrow mb-2">True or false?</p>}
        <h2 className="font-display text-lg font-bold leading-snug sm:text-2xl">{q.prompt}</h2>
      </div>

      {q.type === 'identification' ? (
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (!answer && typed.trim()) submit(typed, remaining)
          }}
        >
          <label htmlFor="ident" className="sr-only">Your answer</label>
          <input
            id="ident"
            ref={inputRef}
            className="field flex-1"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={!!answer}
            autoComplete="off"
            autoCapitalize="off"
            placeholder="Type the missing term…"
          />
          <button className="btn btn-primary" type="submit" disabled={!!answer || !typed.trim()}>Submit</button>
        </form>
      ) : (
        <div className={`mt-4 grid gap-3 ${q.type === 'mcq' ? 'sm:grid-cols-2' : 'grid-cols-2'}`} role="group" aria-label="Answer options">
          {q.options.map((opt, i) => {
            const st = optionState(i)
            const tone =
              st === 'right'
                ? 'ring-4 ring-good'
                : st === 'wrong'
                  ? 'ring-4 ring-bad opacity-90'
                  : st === 'dim'
                    ? 'opacity-40'
                    : ''
            const tile = q.type === 'truefalse' ? TILE_STYLES[i === 0 ? 1 : 0] : TILE_STYLES[i]
            const style = kahoot
              ? `${tile.bg} text-white border-transparent`
              : 'bg-surface text-ink border-line hover:border-accent'
            return (
              <button
                key={i}
                type="button"
                disabled={!!answer}
                onClick={() => submit(i, remaining)}
                style={{ '--i': i } as CSSProperties}
                className={`tile tile-in flex min-h-16 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base font-semibold disabled:cursor-default ${style} ${tone} ${st === 'wrong' ? 'animate-shake' : ''}`}
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold ${kahoot ? 'bg-black/20' : 'bg-accent-soft text-accent'}`} aria-hidden>
                  {kahoot ? (
                    <tile.Shape className="size-4" fill="currentColor" />
                  ) : q.type === 'truefalse' ? (
                    i === 0 ? <Check className="size-4" strokeWidth={2.8} /> : <X className="size-4" strokeWidth={2.8} />
                  ) : (
                    String.fromCharCode(65 + i)
                  )}
                </span>
                <span className="flex-1">{opt}</span>
                {st === 'right' && <Check className="size-5 shrink-0" aria-label="Correct" strokeWidth={3} />}
                {st === 'wrong' && <X className="size-5 shrink-0" aria-label="Your answer, incorrect" strokeWidth={3} />}
              </button>
            )
          })}
        </div>
      )}

      <div aria-live="polite">
        {answer && (
          <div className={`animate-pop mt-4 rounded-2xl border-2 p-4 ${answer.correct ? 'border-good bg-good-soft' : 'border-bad bg-bad-soft'}`}>
            <p className="flex items-center gap-2 text-lg font-bold">
              {answer.correct ? <Check className="size-5" aria-hidden strokeWidth={3} /> : answer.response === null ? <Timer className="size-5" aria-hidden /> : <X className="size-5" aria-hidden strokeWidth={3} />}
              {answer.correct ? 'Correct!' : answer.response === null ? 'Time’s up' : 'Not quite'}
              {kahoot && answer.correct && <span className="ml-2 text-base font-semibold">+{answer.points}</span>}
            </p>
            {!answer.correct && q.type !== 'truefalse' && <p className="mt-1 text-sm">Answer: <strong>{q.answer}</strong></p>}
            <p className="mt-2 text-sm">{q.explanation}</p>
            <p className="mt-1 text-xs text-muted">Source: {q.citation}</p>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        {!kahoot ? (
          <button className="btn" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ArrowLeft className="size-4" aria-hidden /> Back</button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {!kahoot && !last && <button className="btn btn-ghost" onClick={finish}>Finish now</button>}
          {(answer || (!kahoot && !last)) && (
            <button className="btn btn-primary" onClick={next}>
              {last ? 'See results' : <>Next <ArrowRight className="size-4" aria-hidden /></>}
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        {kahoot ? 'Press 1–4 to answer · Enter for next' : 'Arrow keys to move between questions · Enter for next'}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Results({
  result,
  onRetryMissed,
  onNew,
  onSetup,
}: {
  result: { session: Session; answers: Answer[]; bestStreak: number }
  onRetryMissed: () => void
  onNew: () => void
  onSetup: () => void
}) {
  const { session, answers, bestStreak } = result
  const correct = answers.filter((a) => a.correct).length
  const total = answers.length
  const pct = total ? Math.round((correct / total) * 100) : 0
  const points = answers.reduce((s, a) => s + a.points, 0)
  const missed = total - correct
  const perfect = missed === 0
  const ResultIcon = perfect ? (session.round > 1 ? Trophy : PartyPopper) : pct >= 70 ? ThumbsUp : pct >= 40 ? Award : Dumbbell
  const rows = useMemo(() => session.questions.map((q, i) => ({ q, a: answers[i] })), [session, answers])

  return (
    <div className="mx-auto max-w-3xl animate-rise">
      <div className={`card text-center ${perfect ? 'border-good' : ''}`}>
        <ResultIcon className="mx-auto size-12 text-accent" aria-hidden strokeWidth={1.5} />
        <h2 className="mt-2 text-3xl font-bold">
          {perfect ? (session.round > 1 ? '100% mastery reached!' : 'Perfect score!') : `${correct} of ${total} correct`}
        </h2>
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div><p className="font-display text-3xl font-bold text-accent">{pct}%</p><p className="eyebrow">Accuracy</p></div>
          <div><p className="font-display text-3xl font-bold text-accent">{session.mode === 'kahoot' ? points.toLocaleString() : `${correct}/${total}`}</p><p className="eyebrow">{session.mode === 'kahoot' ? 'Points' : 'Score'}</p></div>
          <div><p className="font-display text-3xl font-bold text-accent">{session.mode === 'kahoot' ? <span className="inline-flex items-center gap-1"><Flame className="size-6 text-bad" aria-hidden />{bestStreak}</span> : session.round}</p><p className="eyebrow">{session.mode === 'kahoot' ? 'Best streak' : 'Round'}</p></div>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {!perfect && (
            <button className="btn btn-primary" onClick={onRetryMissed}>
              Retry {missed} missed {missed === 1 ? 'question' : 'questions'}
            </button>
          )}
          <button className="btn" onClick={onNew}>New quiz</button>
          <button className="btn btn-ghost" onClick={onSetup}>Change settings</button>
        </div>
      </div>

      <h3 className="mt-8 text-xl font-bold">Review</h3>
      <ol className="mt-3 space-y-3">
        {rows.map(({ q, a }, i) => (
          <li key={q.id} className={`card !p-4 border-l-8 ${a.correct ? 'border-l-good' : 'border-l-bad'}`}>
            <p className="eyebrow">{i + 1} · {TYPE_LABEL[q.type]}</p>
            <p className="mt-1 font-semibold">{q.prompt}</p>
            <p className="mt-2 text-sm">
              {a.correct ? <span className="inline-flex items-center gap-1 font-semibold text-good"><Check className="size-4" aria-hidden strokeWidth={3} />{q.answer}</span> : (
                <>
                  <span className="inline-flex items-center gap-1 text-bad"><X className="size-4 shrink-0" aria-hidden strokeWidth={3} />Your answer: {a.response === null ? 'no answer' : typeof a.response === 'number' ? q.options[a.response] : a.response}</span>
                  <br />
                  <span className="font-semibold text-good">Correct: {q.answer}</span>
                </>
              )}
            </p>
            <p className="mt-2 text-sm text-muted">{q.explanation}</p>
            <p className="mt-1 text-xs text-muted">Source: {q.citation}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
