import type { ComponentType } from 'react'
import { ArrowRight, FileSearch, Lightbulb, ShieldCheck, type LucideProps } from 'lucide-react'

const STEPS: { n: string; title: string; body: string; detail: string; Icon: ComponentType<LucideProps> }[] = [
  {
    n: '01',
    title: 'Parse the document locally',
    body: 'PDF, PowerPoint and Word files are opened with in-browser readers. Wrapped lines are stitched back into whole sentences, hyphenated breaks are repaired, and slides keep their titles and speaker notes.',
    detail: 'pdf.js · JSZip · no upload',
    Icon: FileSearch,
  },
  {
    n: '02',
    title: 'Extract concepts, not fragments',
    body: 'Rule-based extraction finds definitions, acronyms and cause-and-effect statements. Anything that starts mid-argument or trails off in a dangling preposition is discarded, so every card and answer is a complete idea.',
    detail: 'Definitions · acronyms · cause & effect',
    Icon: Lightbulb,
  },
  {
    n: '03',
    title: 'Study with zero API keys',
    body: 'There is no server and no AI service involved. Your notes, decks and progress live in this browser’s local storage — nothing leaves your device, and it works offline once loaded.',
    detail: 'localStorage · private by design',
    Icon: ShieldCheck,
  },
]

export function HowItWorks({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-14">
      <section className="animate-rise max-w-2xl">
        <p className="eyebrow">How it works</p>
        <h1 className="mt-3 text-4xl font-bold leading-[1.05] sm:text-5xl">From lecture file to reviewer, in three quiet steps.</h1>
        <p className="mt-4 text-lg text-muted">No account, no upload, no waiting on a server.</p>
      </section>

      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {STEPS.map(({ n, title, body, detail, Icon }, i) => (
          <li key={n} className="tile-in" style={{ '--i': i } as React.CSSProperties}>
            <article className="card flex h-full flex-col">
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="font-display text-3xl font-bold text-line" aria-hidden>{n}</span>
              </div>
              <h2 className="mt-5 text-xl font-bold">{title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{body}</p>
              <p className="eyebrow mt-5 border-t border-line pt-3">{detail}</p>
            </article>
          </li>
        ))}
      </ol>

      <div className="mt-10">
        <button type="button" className="btn btn-primary !min-h-12" onClick={onStart}>
          Build my first reviewer <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
