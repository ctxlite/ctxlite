// BM25 scoring algorithm — zero dependencies

const DEFAULT_K1 = 1.5
const DEFAULT_B = 0.75

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "it",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "and",
  "or",
  "but",
  "not",
  "with",
  "this",
  "that",
  "be",
  "as",
  "are",
  "was",
  "were",
  "been",
  "have",
  "has",
  "had",
  "return",
  "returns",
  "const",
  "let",
  "var",
  "function",
  "class",
  "import",
  "export",
  "from",
  "default",
  "type",
  "interface",
  "extends",
  "implements",
  "new",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "throw",
  "try",
  "catch",
  "async",
  "await",
  "void",
  "null",
  "undefined",
  "true",
  "false",
])

/**
 * Tokenize text for BM25 (camelCase, snake_case, etc.).
 */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[_\-./\\(){}[\];:,<>'"#@!?=+*&|^%$~`]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t) && !/^\d+$/.test(t))
}

export interface ScoredDoc {
  index: number
  score: number
}

/**
 * BM25 scorer for a collection of documents.
 */
export class BM25 {
  private readonly tokenized: string[][]
  private readonly avgDocLen: number
  private readonly idf: Map<string, number>
  private readonly k1: number
  private readonly b: number

  constructor(docs: string[], k1 = DEFAULT_K1, b = DEFAULT_B) {
    this.k1 = k1
    this.b = b
    this.tokenized = docs.map(tokenize)

    const totalLen = this.tokenized.reduce((sum, d) => sum + d.length, 0)
    this.avgDocLen = this.tokenized.length > 0 ? totalLen / this.tokenized.length : 1

    this.idf = this.computeIDF()
  }

  private computeIDF(): Map<string, number> {
    const N = this.tokenized.length
    const df = new Map<string, number>()

    for (const doc of this.tokenized) {
      const seen = new Set<string>()
      for (const token of doc) {
        if (!seen.has(token)) {
          df.set(token, (df.get(token) ?? 0) + 1)
          seen.add(token)
        }
      }
    }

    const idf = new Map<string, number>()
    for (const [term, freq] of df) {
      idf.set(term, Math.log((N - freq + 0.5) / (freq + 0.5) + 1))
    }
    return idf
  }

  score(docIndex: number, query: string): number {
    const queryTokens = tokenize(query)
    const doc = this.tokenized[docIndex]
    if (!doc) return 0

    const docLen = doc.length

    const tf = new Map<string, number>()
    for (const token of doc) {
      tf.set(token, (tf.get(token) ?? 0) + 1)
    }

    let score = 0
    for (const qt of queryTokens) {
      const idfVal = this.idf.get(qt) ?? 0
      const freq = tf.get(qt) ?? 0

      const numerator = freq * (this.k1 + 1)
      const denominator = freq + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLen))

      score += idfVal * (numerator / denominator)
    }
    return score
  }

  scoreAll(query: string): ScoredDoc[] {
    const scores: ScoredDoc[] = this.tokenized.map((_, i) => ({
      index: i,
      score: this.score(i, query),
    }))
    return scores.sort((a, b) => b.score - a.score)
  }
}
