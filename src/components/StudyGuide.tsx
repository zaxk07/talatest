import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Deck } from '../types'
import { buildStudyGuide } from '../utils/quizGenerator'

export function StudyGuide({ deck }: { deck: Deck }) {
  const guide = useMemo(() => buildStudyGuide(deck), [deck])
  const [open, setOpen] = useState<Set<string>>(() => new Set(guide.sections.slice(0, 1).map((s) => s.sectionId)))
  const [q, setQ] = useState('')

  const facts = deck.concepts.filter((c) => c.kind === 'fact').length
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return guide.glossary
    return guide.glossary.filter((c) => (c.term + ' ' + c.definition).toLowerCase().includes(needle))
  }, [guide, q])

  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <div className="animate-rise space-y-8">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Topics', guide.sections.length],
          ['Key terms', guide.glossary.length],
          ['Cause & effect', facts],
        ].map(([label, n]) => (
          <div key={label} className="card !p-4 text-center">
            <p className="font-display text-3xl font-bold text-accent">{n}</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby="topics-h">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="topics-h" className="text-2xl font-bold">Topic summaries</h2>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => setOpen(new Set(guide.sections.map((s) => s.sectionId)))}>
              Expand all
            </button>
            <button className="btn btn-ghost" onClick={() => setOpen(new Set())}>
              Collapse all
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {guide.sections.map((s, i) => {
            const isOpen = open.has(s.sectionId)
            const panelId = `panel-${s.sectionId}`
            return (
              <article key={s.sectionId} className="card !p-0 overflow-hidden">
                <h3 className="!font-sans">
                  <button
                    type="button"
                    className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(s.sectionId)}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold">{i + 1}</span>
                    <span className="flex-1 font-display text-lg font-bold">{s.title}</span>
                    <ChevronDown aria-hidden className={`size-5 text-muted [transition:transform_250ms_var(--ease-out)] ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                </h3>
                {isOpen && (
                  <div id={panelId} className="animate-rise border-t border-line px-5 pb-5 pt-4">
                    {s.summary && <p className="text-base leading-relaxed">{s.summary}</p>}
                    {s.takeaways.length > 0 && (
                      <>
                        <p className="eyebrow mt-4">Key takeaways</p>
                        <ul className="mt-2 list-disc space-y-1.5 pl-5">
                          {s.takeaways.map((t, k) => (
                            <li key={k}>{t}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {s.terms.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {s.terms.map((t) => (
                          <span key={t.id} className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold">
                            {t.term}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-4 text-xs text-muted">Source: {s.citation}</p>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="gloss-h">
        <h2 id="gloss-h" className="text-2xl font-bold">Glossary</h2>
        <label htmlFor="gloss-q" className="sr-only">Search glossary</label>
        <input id="gloss-q" type="search" className="field mt-3" placeholder="Search terms…" value={q} onChange={(e) => setQ(e.target.value)} />
        {filtered.length === 0 ? (
          <p className="mt-4 text-muted">No terms match “{q}”.</p>
        ) : (
          <dl className="mt-4 grid gap-3 md:grid-cols-2">
            {filtered.map((c) => (
              <div key={c.id} className="card !p-4">
                <dt className="font-display text-lg font-bold">{c.term}{c.kind === 'acronym' && <span className="ml-2 text-xs font-sans font-semibold uppercase text-muted">acronym</span>}</dt>
                <dd className="mt-1 text-sm">{c.definition}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  )
}
