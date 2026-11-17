export type LineKind = 'heading' | 'bullet' | 'para'

export interface Line {
  text: string
  kind: LineKind
  /** Terms that were emphasised (bold) in the source line. */
  bold: string[]
}

export interface Section {
  id: string
  title: string
  /** Source file name, or "Pasted notes". */
  source: string
  /** Human label such as "Slide 3" or "Page 2". */
  locator: string
  lines: Line[]
}

export interface ParsedDoc {
  name: string
  sections: Section[]
}

export type ConceptKind = 'definition' | 'acronym' | 'fact'

export interface Concept {
  id: string
  term: string
  definition: string
  /** The exact source sentence the concept came from. */
  sourceSnippet: string
  sectionId: string
  citation: string
  kind: ConceptKind
  score: number
  /** Optional custom question / card-front text (used by cause-effect facts). */
  prompt?: string
}

export interface Deck {
  id: string
  name: string
  createdAt: number
  sources: string[]
  sections: Section[]
  concepts: Concept[]
  bestMatchTime?: number
  /** conceptIds the student marked as mastered in flashcards. */
  mastered: string[]
}

export type QuestionType = 'mcq' | 'identification' | 'truefalse'
export type Difficulty = 'standard' | 'challenge'
export type PlayMode = 'calm' | 'kahoot'

export interface QuizConfig {
  count: 5 | 10 | 15 | 20
  types: QuestionType[]
  difficulty: Difficulty
}

export interface Question {
  id: string
  type: QuestionType
  conceptId: string
  prompt: string
  /** mcq: 4 options; truefalse: ["True","False"]; identification: [] */
  options: string[]
  /** Index into options (mcq/truefalse) */
  correctIndex: number
  /** Accepted text answer (identification) */
  answer: string
  explanation: string
  citation: string
}

export interface StudyGuideSection {
  sectionId: string
  title: string
  citation: string
  summary: string
  takeaways: string[]
  terms: Concept[]
}

export interface StudyGuide {
  sections: StudyGuideSection[]
  glossary: Concept[]
}
