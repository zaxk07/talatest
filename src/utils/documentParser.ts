import JSZip from 'jszip'
import type { Line, LineKind, ParsedDoc, Section } from '../types'
import { endsDangling } from './language'

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export const SUPPORTED_EXTENSIONS = ['pdf', 'pptx', 'docx', 'txt', 'md', 'markdown'] as const

const BOLD_RE = /\*\*([^*]+)\*\*|__([^_]+)__/g

/** Build a Line from raw text that may contain **bold** / __bold__ markers. */
export function makeLine(raw: string, kind: LineKind): Line | null {
  const bold: string[] = []
  const text = raw
    .replace(BOLD_RE, (_m, a: string | undefined, b: string | undefined) => {
      const t = (a ?? b ?? '').trim()
      if (t) bold.push(t)
      return t
    })
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  return { text, kind, bold }
}

const BULLET_RE = /^\s*(?:[-*•▪◦●○■□➢►‣–—]|\d{1,3}[.)])\s+/
const MD_HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/

/** Convert free text (txt / md / pdf page) into structured lines. */
export function textToLines(text: string): Line[] {
  const rows = text.replace(/\r\n?/g, '\n').split('\n')
  const lines: Line[] = []
  rows.forEach((row, i) => {
    const trimmed = row.trim()
    if (!trimmed) return
    const h = MD_HEADING_RE.exec(row)
    if (h) {
      const l = makeLine(h[2], 'heading')
      if (l) lines.push(l)
      return
    }
    if (BULLET_RE.test(row)) {
      const l = makeLine(row.replace(BULLET_RE, ''), 'bullet')
      if (l) lines.push(l)
      return
    }
    const prevBlank = i === 0 || !rows[i - 1].trim()
    const nextFilled = i + 1 < rows.length && !!rows[i + 1].trim()
    const looksLikeTitle =
      prevBlank &&
      nextFilled &&
      trimmed.length <= 70 &&
      trimmed.split(/\s+/).length <= 8 &&
      !/[.!?:;,]$/.test(trimmed) &&
      !/:\s/.test(trimmed) &&
      !BULLET_RE.test(rows[i + 1])
    const l = makeLine(trimmed, looksLikeTitle ? 'heading' : 'para')
    if (l) lines.push(l)
  })
  return lines
}

/* ------------------------------------------------------------------ */
/* Soft-wrap reconstruction (PDF pages, PPTX paragraphs)                */
/* ------------------------------------------------------------------ */

const TERMINAL_END_RE = /[.?!:]["'”’)\]]*$/
const LABEL_START_RE = /^[\p{Lu}\d][^:.]{0,40}:\s/u
const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'vs', 'with', 'at', 'by'])

/** ALL-CAPS or Title Case short line without terminal punctuation. */
export function isHeadingLike(line: string): boolean {
  const t = line.replace(/\*\*/g, '').trim()
  if (!t || t.length > 70 || TERMINAL_END_RE.test(t) || /[,;]$/.test(t)) return false
  const words = t.split(/\s+/)
  if (words.length > 8) return false
  const letters = t.replace(/[^\p{L}]/gu, '')
  if (letters.length >= 3 && letters === letters.toUpperCase()) return true
  return words.every((w, i) => /^[\p{Lu}\d(]/u.test(w) || (i > 0 && SMALL_WORDS.has(w.toLowerCase())))
}

/**
 * Decide whether `next` is a soft-wrapped continuation of `prev`.
 * - "page": plain text lines (PDF). Merge unless prev is terminated or next starts a bullet/heading/label.
 * - "slide": PPTX paragraphs, where bullets carry no marker; merge only on clear continuations
 *   (prev dangling / ends with a comma, or next starts lowercase).
 */
function shouldMerge(prevRaw: string, nextRaw: string, mode: 'page' | 'slide'): boolean {
  const prev = prevRaw.replace(/\*\*/g, '').trim()
  const next = nextRaw.replace(/\*\*/g, '').trim()
  if (!prev || !next) return false
  if (BULLET_RE.test(next) || MD_HEADING_RE.test(next)) return false
  if (TERMINAL_END_RE.test(prev)) return false
  const unfinished = endsDangling(prev) || /[,;]$/.test(prev) || /\p{L}-$/u.test(prev)
  if (mode === 'slide') return unfinished || /^\p{Ll}/u.test(next)
  if (unfinished || /^\p{Ll}/u.test(next)) return true
  if (isHeadingLike(prev) || isHeadingLike(next)) return false
  if (LABEL_START_RE.test(next)) return false
  return true
}

function joinWrapped(prev: string, next: string): string {
  // "inter-" + "national" -> "international"
  if (/\p{L}-$/u.test(prev) && /^\p{Ll}/u.test(next)) return prev.slice(0, -1) + next
  return `${prev} ${next}`
}

/** Merge soft-wrapped lines of page text; blank lines stay paragraph separators. */
export function reflowText(text: string): string {
  const cleaned = text
    .replace(/\r\n?/g, '\n')
    .replace(/­/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2') // hyphenated line-wrap breaks
  const blocks: string[] = []
  for (const block of cleaned.split(/\n{2,}/)) {
    const out: string[] = []
    for (const line of block.split('\n')) {
      const l = line.trim()
      if (!l) continue
      const last = out.length - 1
      if (last >= 0 && shouldMerge(out[last], l, 'page')) out[last] = joinWrapped(out[last], l)
      else out.push(l)
    }
    if (out.length) blocks.push(out.join('\n'))
  }
  return blocks.join('\n\n')
}

/** Merge soft-wrapped PPTX paragraphs of one shape. `bullets[i]` = paragraph i has an explicit bullet. */
export function reflowParagraphs(paras: string[], bullets: boolean[] = []): string[] {
  const out: string[] = []
  paras.forEach((raw, i) => {
    const p = raw.replace(/\s+/g, ' ').trim()
    if (!p) return
    const last = out.length - 1
    if (last >= 0 && !bullets[i] && shouldMerge(out[last], p, 'slide')) out[last] = joinWrapped(out[last], p)
    else out.push(p)
  })
  return out
}

/** Group lines into sections; each heading starts a new section. */
export function groupLines(
  lines: Line[],
  source: string,
  defaultTitle: string,
  locatorPrefix = 'Section',
): Section[] {
  const sections: Section[] = []
  let current: Section | null = null
  const open = (title: string): Section => {
    const s: Section = {
      id: `${source}#${sections.length}`,
      title,
      source,
      locator: `${locatorPrefix} ${sections.length + 1}`,
      lines: [],
    }
    sections.push(s)
    return s
  }
  for (const line of lines) {
    if (line.kind === 'heading') {
      // Consecutive headings with no body: keep the most specific as the title.
      if (current && current.lines.length === 0) {
        current.title = line.text
      } else {
        current = open(line.text)
      }
      continue
    }
    if (!current) current = open(defaultTitle)
    current.lines.push(line)
  }
  return sections.filter((s) => s.lines.length > 0)
}

export function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

export function extensionOf(name: string): string {
  const m = /\.([^.\\/]+)$/.exec(name)
  return m ? m[1].toLowerCase() : ''
}

/* ------------------------------------------------------------------ */
/* Plain text / Markdown                                                */
/* ------------------------------------------------------------------ */

export function parseText(text: string, name: string): ParsedDoc {
  const lines = textToLines(text)
  const sections = groupLines(lines, name, stripExtension(name))
  if (sections.length === 0) throw new ParseError(`"${name}" doesn't contain any readable text.`)
  return { name, sections }
}

/* ------------------------------------------------------------------ */
/* XML helpers                                                          */
/* ------------------------------------------------------------------ */

function parseXml(xml: string, what: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new ParseError(`Could not read ${what}: the XML is malformed.`)
  }
  return doc
}

/** True when a boolean OOXML attribute is absent (default on) or not an explicit "off". */
function isOn(el: Element, attr: string): boolean {
  const v = el.getAttribute(attr)
  return v === null || !(v === '0' || v === 'false' || v === 'off')
}

function childrenByTag(parent: Element, tag: string): Element[] {
  return Array.from(parent.children).filter((c) => c.tagName === tag)
}

function slideNumber(path: string): number {
  const m = /slide(\d+)\.xml$/.exec(path)
  return m ? parseInt(m[1], 10) : 0
}

/* ------------------------------------------------------------------ */
/* PPTX                                                                 */
/* ------------------------------------------------------------------ */

/** Extract title + paragraphs (with **bold** markers) from one slide's XML. */
export function extractSlideXml(xml: string): { title: string; paragraphs: string[] } {
  const doc = parseXml(xml, 'a slide')
  let title = ''
  const paragraphs: string[] = []
  const shapes = Array.from(doc.getElementsByTagName('p:sp'))
  const containers: Element[] = shapes.length ? shapes : [doc.documentElement]
  for (const shape of containers) {
    const ph = shape.getElementsByTagName('p:ph')[0]
    const phType = ph?.getAttribute('type') ?? ''
    const isTitle = phType === 'title' || phType === 'ctrTitle'
    const texts: string[] = []
    const bullets: boolean[] = []
    for (const p of Array.from(shape.getElementsByTagName('a:p'))) {
      const pPr = childrenByTag(p, 'a:pPr')[0]
      const hasBullet = !!pPr && (!!childrenByTag(pPr, 'a:buChar')[0] || !!childrenByTag(pPr, 'a:buAutoNum')[0])
      let out = ''
      for (const r of Array.from(p.children)) {
        if (r.tagName === 'a:br') {
          out += ' '
          continue
        }
        if (r.tagName !== 'a:r' && r.tagName !== 'a:fld') continue
        const t = r.getElementsByTagName('a:t')[0]?.textContent ?? ''
        if (!t) continue
        const rPr = r.getElementsByTagName('a:rPr')[0]
        const bold = !!rPr && rPr.hasAttribute('b') && isOn(rPr, 'b') && t.trim().length > 0
        out += bold ? `**${t}**` : t
      }
      // merge adjacent bold runs: "**a****b**" -> "**ab**"
      out = out.replace(/\*\*\*\*/g, '')
      if (out.trim()) {
        texts.push(out.trim())
        bullets.push(hasBullet)
      }
    }
    if (isTitle && !title) title = texts.join(' ').replace(/\*\*/g, '')
    else paragraphs.push(...reflowParagraphs(texts, bullets))
  }
  return { title, paragraphs }
}

export async function parsePptxBuffer(
  data: ArrayBuffer | Uint8Array,
  name: string,
): Promise<ParsedDoc> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    throw new ParseError(`"${name}" isn't a valid PowerPoint (.pptx) file.`)
  }
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b))
  if (slidePaths.length === 0) throw new ParseError(`"${name}" has no slides we can read.`)

  const sections: Section[] = []
  for (const path of slidePaths) {
    const xml = await zip.file(path)!.async('string')
    const { title, paragraphs } = extractSlideXml(xml)
    const n = slideNumber(path)
    const lines: Line[] = []
    for (const p of paragraphs) {
      const l = makeLine(p, 'bullet')
      if (l) lines.push(l)
    }
    // Speaker notes often hold the real explanation.
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`)
    if (notesFile) {
      const { paragraphs: notes } = extractSlideXml(await notesFile.async('string'))
      for (const t of notes) {
        if (/^\d+$/.test(t)) continue // slide-number placeholder
        const l = makeLine(t, 'para')
        if (l) lines.push(l)
      }
    }
    if (lines.length === 0) continue
    sections.push({
      id: `${name}#${sections.length}`,
      title: title || `Slide ${n}`,
      source: name,
      locator: `Slide ${n}`,
      lines,
    })
  }
  if (sections.length === 0) throw new ParseError(`"${name}" doesn't contain any readable text.`)
  return { name, sections }
}

/* ------------------------------------------------------------------ */
/* DOCX                                                                 */
/* ------------------------------------------------------------------ */

export function extractDocxXml(xml: string): Line[] {
  const doc = parseXml(xml, 'the document')
  const lines: Line[] = []
  for (const p of Array.from(doc.getElementsByTagName('w:p'))) {
    const pPr = childrenByTag(p, 'w:pPr')[0]
    const style = pPr?.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') ?? ''
    const isHeading = /^(heading\s?\d|title|subtitle)/i.test(style)
    const isBullet = !!pPr?.getElementsByTagName('w:numPr')[0] || /list/i.test(style)
    let out = ''
    for (const r of Array.from(p.getElementsByTagName('w:r'))) {
      let t = ''
      for (const c of Array.from(r.children)) {
        if (c.tagName === 'w:t') t += c.textContent ?? ''
        else if (c.tagName === 'w:tab' || c.tagName === 'w:br') t += ' '
      }
      if (!t) continue
      const b = childrenByTag(r, 'w:rPr')[0]?.getElementsByTagName('w:b')[0]
      const bold = !!b && isOn(b, 'w:val') && !isHeading && t.trim().length > 0
      out += bold ? `**${t}**` : t
    }
    out = out.replace(/\*\*\*\*/g, '')
    const kind: LineKind = isHeading ? 'heading' : isBullet ? 'bullet' : 'para'
    const l = makeLine(out, kind)
    if (l) lines.push(l)
  }
  return lines
}

export async function parseDocxBuffer(
  data: ArrayBuffer | Uint8Array,
  name: string,
): Promise<ParsedDoc> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    throw new ParseError(`"${name}" isn't a valid Word (.docx) file.`)
  }
  const file = zip.file('word/document.xml')
  if (!file) throw new ParseError(`"${name}" is missing word/document.xml.`)
  const lines = extractDocxXml(await file.async('string'))
  const sections = groupLines(lines, name, stripExtension(name))
  if (sections.length === 0) throw new ParseError(`"${name}" doesn't contain any readable text.`)
  return { name, sections }
}

/* ------------------------------------------------------------------ */
/* PDF                                                                  */
/* ------------------------------------------------------------------ */

export interface PdfTextItem {
  str: string
  hasEOL?: boolean
  transform?: number[]
  height?: number
}

/**
 * Rebuild lines from pdf.js text items (breaks on EOL or y changes). A vertical gap much larger than
 * the line height becomes a blank line (paragraph break); `reflowText` later re-joins soft wraps.
 */
export function pdfItemsToText(items: PdfTextItem[]): string {
  let out = ''
  let lastY: number | null = null
  let lastH = 0
  for (const it of items) {
    if (typeof it.str !== 'string') continue
    const y = it.transform ? it.transform[5] : null
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
      const bigGap = lastH > 0 && Math.abs(y - lastY) > lastH * 2
      if (bigGap) out = out.replace(/\n*$/, '\n\n')
      else if (!out.endsWith('\n')) out += '\n'
    }
    if (it.height && it.str.trim()) lastH = it.height
    out += it.str
    if (it.hasEOL) out += '\n'
    if (y !== null) lastY = y
  }
  return out
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null
function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
      return mod
    })
  }
  return pdfjsPromise
}

export async function parsePdfBuffer(
  data: ArrayBuffer | Uint8Array,
  name: string,
): Promise<ParsedDoc> {
  const pdfjs = await loadPdfjs()
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const task = pdfjs.getDocument({ data: bytes })
  let pdf
  try {
    pdf = await task.promise
  } catch {
    throw new ParseError(
      `"${name}" couldn't be opened as a PDF (it may be corrupt or password-protected).`,
    )
  }
  const sections: Section[] = []
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      const text = reflowText(pdfItemsToText(content.items as PdfTextItem[]))
      const lines = textToLines(text)
      if (lines.length === 0) continue
      const first = lines[0]
      const useFirstAsTitle = first.text.length <= 80 && lines.length > 1
      const body = useFirstAsTitle ? lines.slice(1) : lines
      sections.push({
        id: `${name}#${sections.length}`,
        title: useFirstAsTitle ? first.text : `Page ${n}`,
        source: name,
        locator: `Page ${n}`,
        lines: body.map((l) => (l.kind === 'heading' ? { ...l, kind: 'para' as const } : l)),
      })
    }
  } finally {
    void task.destroy()
  }
  if (sections.length === 0) {
    throw new ParseError(
      `"${name}" has no selectable text (it may be a scanned image). OCR isn't supported — try a text-based PDF.`,
    )
  }
  return { name, sections }
}

/* ------------------------------------------------------------------ */
/* Dispatch + merge                                                     */
/* ------------------------------------------------------------------ */

async function readBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer()
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as ArrayBuffer)
    r.onerror = () => reject(new ParseError(`Could not read "${file.name}".`))
    r.readAsArrayBuffer(file)
  })
}

async function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new TextDecoder().decode(await readBuffer(file))
}

export async function parseFile(file: File): Promise<ParsedDoc> {
  const ext = extensionOf(file.name)
  switch (ext) {
    case 'pdf':
      return parsePdfBuffer(await readBuffer(file), file.name)
    case 'pptx':
      return parsePptxBuffer(await readBuffer(file), file.name)
    case 'docx':
      return parseDocxBuffer(await readBuffer(file), file.name)
    case 'txt':
    case 'md':
    case 'markdown':
      return parseText(await readText(file), file.name)
    case 'ppt':
    case 'doc':
      throw new ParseError(
        `"${file.name}" is a legacy format. Please save it as .pptx / .docx and try again.`,
      )
    default:
      throw new ParseError(
        `"${file.name}" isn't supported. Use PDF, PPTX, DOCX, TXT or Markdown.`,
      )
  }
}

export interface ParseFilesResult {
  docs: ParsedDoc[]
  errors: string[]
}

/** Parse several files; failures are collected, not thrown, so good files still load. */
export async function parseFiles(files: File[]): Promise<ParseFilesResult> {
  const docs: ParsedDoc[] = []
  const errors: string[] = []
  for (const f of files) {
    try {
      docs.push(await parseFile(f))
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `Could not read "${f.name}".`)
    }
  }
  return { docs, errors }
}

/** Merge parsed documents into a single ordered section list with globally unique ids. */
export function mergeDocs(docs: ParsedDoc[]): Section[] {
  const out: Section[] = []
  docs.forEach((doc, di) => {
    doc.sections.forEach((s, si) => {
      out.push({ ...s, id: `d${di}-s${si}`, source: s.source || doc.name })
    })
  })
  return out
}
