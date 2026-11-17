// @vitest-environment jsdom
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  ParseError,
  extractDocxXml,
  extractSlideXml,
  mergeDocs,
  parseDocxBuffer,
  parseFile,
  parsePptxBuffer,
  parseText,
  pdfItemsToText,
  textToLines,
} from '../documentParser'

const NS_A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
const NS_P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

function run(text: string, bold = false): string {
  return `<a:r><a:rPr lang="en-US"${bold ? ' b="1"' : ''}/><a:t>${text}</a:t></a:r>`
}
function slideXml(title: string, paragraphs: string[]): string {
  return `<?xml version="1.0"?><p:sld ${NS_A} ${NS_P}><p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p>${run(title)}</a:p></p:txBody></p:sp>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody>${paragraphs
      .map((p) => `<a:p>${p}</a:p>`)
      .join('')}</p:txBody></p:sp>
  </p:spTree></p:cSld></p:sld>`
}
async function makePptx(slides: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const [path, xml] of Object.entries(slides)) zip.file(path, xml)
  return zip.generateAsync({ type: 'uint8array' })
}

function wp(text: string, opts: { style?: string; bullet?: boolean; bold?: boolean } = {}): string {
  const pPr =
    opts.style || opts.bullet
      ? `<w:pPr>${opts.style ? `<w:pStyle w:val="${opts.style}"/>` : ''}${opts.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}</w:pPr>`
      : ''
  return `<w:p>${pPr}<w:r>${opts.bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}
function docXml(...paras: string[]): string {
  return `<?xml version="1.0"?><w:document ${NS_W}><w:body>${paras.join('')}</w:body></w:document>`
}

describe('PPTX extraction', () => {
  it('extracts title, bullets and bold runs from slide XML', () => {
    const xml = slideXml('Networking', [run('Router', true) + run(': forwards packets'), run('Plain bullet')])
    const { title, paragraphs } = extractSlideXml(xml)
    expect(title).toBe('Networking')
    expect(paragraphs).toEqual(['**Router**: forwards packets', 'Plain bullet'])
  })

  it('orders slides numerically (slide10 after slide2) and tags locators', async () => {
    const data = await makePptx({
      'ppt/slides/slide10.xml': slideXml('Ten', [run('ten body text')]),
      'ppt/slides/slide2.xml': slideXml('Two', [run('two body text')]),
      'ppt/slides/slide1.xml': slideXml('One', [run('one body text')]),
    })
    const doc = await parsePptxBuffer(data, 'deck.pptx')
    expect(doc.sections.map((s) => s.title)).toEqual(['One', 'Two', 'Ten'])
    expect(doc.sections[1].locator).toBe('Slide 2')
    expect(doc.sections[0].lines[0]).toMatchObject({ text: 'one body text', kind: 'bullet' })
  })

  it('records bold terms on lines', async () => {
    const data = await makePptx({
      'ppt/slides/slide1.xml': slideXml('T', [run('TCP', true) + run(' is a reliable protocol')]),
    })
    const doc = await parsePptxBuffer(data, 'd.pptx')
    expect(doc.sections[0].lines[0].bold).toEqual(['TCP'])
    expect(doc.sections[0].lines[0].text).toBe('TCP is a reliable protocol')
  })

  it('includes speaker notes and ignores slide-number placeholders', async () => {
    const data = await makePptx({
      'ppt/slides/slide1.xml': slideXml('Intro', [run('Body line one here')]),
      'ppt/notesSlides/notesSlide1.xml': slideXml('', [run('Notes explain more'), run('1')]),
    })
    const doc = await parsePptxBuffer(data, 'd.pptx')
    const texts = doc.sections[0].lines.map((l) => l.text)
    expect(texts).toContain('Notes explain more')
    expect(texts).not.toContain('1')
  })

  it('rejects a corrupt file, a zip without slides and malformed XML', async () => {
    await expect(parsePptxBuffer(new Uint8Array([1, 2, 3]), 'bad.pptx')).rejects.toBeInstanceOf(ParseError)
    const empty = await makePptx({ 'readme.txt': 'hi' })
    await expect(parsePptxBuffer(empty, 'empty.pptx')).rejects.toThrow(/no slides/)
    const broken = await makePptx({ 'ppt/slides/slide1.xml': '<p:sld><unclosed>' })
    await expect(parsePptxBuffer(broken, 'broken.pptx')).rejects.toBeInstanceOf(ParseError)
  })
})

describe('DOCX extraction', () => {
  it('maps heading styles, list paragraphs and bold runs', () => {
    const lines = extractDocxXml(
      docXml(
        wp('Memory', { style: 'Heading1' }),
        wp('Paging', { bold: true }),
        wp(' divides memory into pages.'),
        wp('A bullet item', { bullet: true }),
      ),
    )
    expect(lines[0]).toMatchObject({ text: 'Memory', kind: 'heading' })
    expect(lines[1]).toMatchObject({ text: 'Paging', kind: 'para', bold: ['Paging'] })
    expect(lines[3]).toMatchObject({ text: 'A bullet item', kind: 'bullet' })
  })

  it('groups paragraphs into sections by heading', async () => {
    const zip = new JSZip()
    zip.file(
      'word/document.xml',
      docXml(
        wp('One', { style: 'Heading1' }),
        wp('First section body text.'),
        wp('Two', { style: 'Heading2' }),
        wp('Second section body text.'),
      ),
    )
    const doc = await parseDocxBuffer(await zip.generateAsync({ type: 'uint8array' }), 'notes.docx')
    expect(doc.sections.map((s) => s.title)).toEqual(['One', 'Two'])
    expect(doc.sections[1].lines[0].text).toBe('Second section body text.')
  })

  it('errors on missing document.xml and empty documents', async () => {
    const zip = new JSZip()
    zip.file('other.xml', '<x/>')
    await expect(parseDocxBuffer(await zip.generateAsync({ type: 'uint8array' }), 'x.docx')).rejects.toThrow(
      /document\.xml/,
    )
    const empty = new JSZip()
    empty.file('word/document.xml', docXml(''))
    await expect(parseDocxBuffer(await empty.generateAsync({ type: 'uint8array' }), 'e.docx')).rejects.toThrow(
      /readable text/,
    )
  })
})

describe('Text / Markdown parsing', () => {
  it('detects markdown headings, bullets and bold markers', () => {
    const lines = textToLines('# Title\n- **TCP**: reliable\n1. numbered item\nplain sentence here.')
    expect(lines.map((l) => l.kind)).toEqual(['heading', 'bullet', 'bullet', 'para'])
    expect(lines[1].bold).toEqual(['TCP'])
    expect(lines[1].text).toBe('TCP: reliable')
  })

  it('treats short unpunctuated standalone lines as headings in plain text', () => {
    const lines = textToLines('Process Scheduling\nThe scheduler picks the next process.')
    expect(lines[0].kind).toBe('heading')
  })

  it('handles CRLF and builds sections', () => {
    const doc = parseText('# A\r\nfirst line of text\r\n\r\n# B\r\nsecond line of text', 'n.md')
    expect(doc.sections.map((s) => s.title)).toEqual(['A', 'B'])
  })

  it('throws on empty text', () => {
    expect(() => parseText('   \n\n', 'empty.txt')).toThrow(ParseError)
  })
})

describe('parseFile + merge', () => {
  it('parses a .txt File and rejects unsupported / legacy types', async () => {
    const doc = await parseFile(new File(['# Topic\nSome note text here.'], 'a.txt', { type: 'text/plain' }))
    expect(doc.sections[0].title).toBe('Topic')
    await expect(parseFile(new File(['x'], 'a.exe'))).rejects.toThrow(/isn't supported/)
    await expect(parseFile(new File(['x'], 'old.ppt'))).rejects.toThrow(/legacy/)
  })

  it('merges multiple docs with globally unique section ids', () => {
    const a = parseText('# A\nline of text a', 'a.md')
    const b = parseText('# A\nline of text b', 'b.md')
    const merged = mergeDocs([a, b])
    expect(merged).toHaveLength(2)
    expect(new Set(merged.map((s) => s.id)).size).toBe(2)
    expect(merged.map((s) => s.source)).toEqual(['a.md', 'b.md'])
  })
})

describe('PDF text rebuilding', () => {
  it('breaks lines on EOL flags and y-coordinate changes', () => {
    const text = pdfItemsToText([
      { str: 'Hello', transform: [1, 0, 0, 1, 0, 700] },
      { str: ' world', transform: [1, 0, 0, 1, 40, 700], hasEOL: true },
      { str: 'Next', transform: [1, 0, 0, 1, 0, 680] },
      { str: ' line', transform: [1, 0, 0, 1, 30, 660] },
    ])
    expect(text.split('\n')).toEqual(['Hello world', 'Next', ' line'])
  })
})
