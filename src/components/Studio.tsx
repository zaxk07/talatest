import { useRef, useState, type DragEvent } from 'react'
import { ArrowRight, FileUp, Sparkles, X } from 'lucide-react'
import type { ParsedDoc } from '../types'
import type { StudyMode } from '../router'
import { useDeckStore } from '../state/deckStore'
import { mergeDocs, parseFiles, parseText, ParseError } from '../utils/documentParser'
import { SAMPLE_NAME, SAMPLE_NOTES } from '../utils/sampleNotes'
import { stripExt } from './shared'

const ACCEPT = '.pdf,.pptx,.docx,.txt,.md,.markdown'

const MODE_NAME: Record<StudyMode, string> = {
  guide: 'study guide',
  cards: 'flashcards',
  exam: 'practice exam',
  match: 'match game',
}

/** The upload studio: add files / paste notes, then generate a reviewer. Shown when no deck is open. */
export function Studio({ mode }: { mode: StudyMode }) {
  const { createDeck } = useDeckStore()
  const [staged, setStaged] = useState<ParsedDoc[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [paste, setPaste] = useState('')
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list)
    if (!files.length) return
    setBusy(true)
    setErrors([])
    const { docs, errors: errs } = await parseFiles(files)
    setStaged((s) => [...s, ...docs])
    setErrors(errs)
    setBusy(false)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void addFiles(e.dataTransfer.files)
  }

  function addPasted() {
    try {
      const doc = parseText(paste, `Pasted notes ${staged.filter((d) => d.name.startsWith('Pasted')).length + 1}`)
      setStaged((s) => [...s, doc])
      setPaste('')
      setErrors([])
    } catch (e) {
      setErrors([e instanceof ParseError ? 'Paste some notes first — there was no readable text.' : 'Could not read those notes.'])
    }
  }

  function generate() {
    const sections = mergeDocs(staged)
    const title =
      name.trim() ||
      (staged.length === 1 ? stripExt(staged[0].name) : `${stripExt(staged[0].name)} + ${staged.length - 1} more`)
    createDeck(title, sections)
  }

  function loadSample() {
    const doc = parseText(SAMPLE_NOTES, SAMPLE_NAME)
    createDeck('Computer Networks & Operating Systems', mergeDocs([doc]))
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <section className="animate-rise max-w-2xl">
        <p className="eyebrow">New reviewer</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-5xl">Add your notes</h1>
        <p className="mt-3 text-muted">
          Drop a lecture file or paste text. We’ll build your {MODE_NAME[mode]} — and every other study mode — right here in your browser.
        </p>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3" aria-labelledby="upload-h">
          <h2 id="upload-h" className="text-xl font-bold">1 · Add your material</h2>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mt-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center [transition:background-color_200ms_var(--ease-out),border-color_200ms_var(--ease-out)] sm:py-10 ${
              dragging ? 'border-accent bg-accent-soft' : 'border-line'
            }`}
          >
            <FileUp className="size-8 text-accent" aria-hidden strokeWidth={1.6} />
            <p className="mt-2 font-semibold">Drag &amp; drop files here</p>
            <p className="text-sm text-muted">PDF · PPTX · DOCX · TXT · Markdown — add several to merge them</p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? 'Reading files…' : 'Choose files'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                void addFiles(e.target.files ?? [])
                e.target.value = ''
              }}
            />
          </div>

          <label htmlFor="paste" className="mt-6 block text-sm font-semibold">Or paste lecture notes</label>
          <textarea
            id="paste"
            className="field mt-2 min-h-32"
            placeholder={'# Topic\nTCP: a reliable, connection-oriented protocol\n- **Router**: forwards packets between networks'}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={addPasted} disabled={!paste.trim()}>
              Add pasted notes
            </button>
            <button type="button" className="btn btn-ghost" onClick={loadSample}>
              <Sparkles className="size-4" aria-hidden /> Load sample notes
            </button>
          </div>

          {errors.length > 0 && (
            <ul role="alert" className="mt-4 space-y-1 rounded-xl bg-bad-soft p-3 text-sm text-bad">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="card h-fit lg:col-span-2" aria-labelledby="gen-h">
          <h2 id="gen-h" className="text-xl font-bold">2 · Generate</h2>
          {staged.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Nothing added yet. Try the sample notes to experience every mode in one click.
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {staged.map((d, i) => (
                  <li key={d.name + i} className="flex items-center justify-between gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{d.name}</span>
                    <span className="shrink-0 text-muted">{d.sections.length} sections</span>
                    <button
                      type="button"
                      aria-label={`Remove ${d.name}`}
                      className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-surface"
                      onClick={() => setStaged((s) => s.filter((_, k) => k !== i))}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <label htmlFor="deckname" className="mt-4 block text-sm font-semibold">Reviewer name (optional)</label>
              <input id="deckname" className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Midterm Review" />
              <button type="button" className="btn btn-primary mt-4 w-full" onClick={generate}>
                Generate reviewer <ArrowRight className="size-4" aria-hidden />
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
