// Orchestrator: BM25 + import graph + file selection

import { BM25 } from "./bm25.js"
import { buildImportGraph, calculateImportBoosts } from "./imports.js"
import type { CodeFile, TrimResult } from "./types.js"

export interface TrimOptions {
  maxTokens?: number
  minScore?: number
  useImportGraph?: boolean
}

const DEFAULTS: Required<TrimOptions> = {
  maxTokens: 4096,
  minScore: 0.1,
  useImportGraph: true,
}

/**
 * Trim files to the most relevant ones for the query.
 * Returns originals when query/files empty or trim ratio < 10%.
 */
export function trimFiles(
  files: CodeFile[],
  query: string,
  options: TrimOptions = {},
): TrimResult {
  const opts = { ...DEFAULTS, ...options }

  const tokensIn = files.reduce((sum, f) => sum + f.tokens, 0)

  if (files.length === 0 || query.trim().length === 0) {
    return {
      files,
      tokensIn,
      tokensOut: tokensIn,
      tokensSaved: 0,
      trimRatio: 0,
      filesIn: files.length,
      filesOut: files.length,
    }
  }

  const docs = files.map((f) => `${f.path} ${f.content}`)
  const scorer = new BM25(docs)
  const scored = scorer.scoreAll(query)

  const scoreMap = new Map<string, number>()
  for (const { index, score } of scored) {
    const file = files[index]
    if (file) scoreMap.set(file.path, score)
  }

  let boosts = new Map<string, number>()
  if (opts.useImportGraph) {
    const graph = buildImportGraph(files)
    boosts = calculateImportBoosts(graph, scoreMap)
  }

  const finalScores = new Map<string, number>()
  for (const [path, score] of scoreMap) {
    finalScores.set(path, score + (boosts.get(path) ?? 0))
  }

  const sortedFiles = [...files].sort((a, b) => {
    const scoreA = finalScores.get(a.path) ?? 0
    const scoreB = finalScores.get(b.path) ?? 0
    return scoreB - scoreA
  })

  const selected: CodeFile[] = []
  let tokensOut = 0

  for (const file of sortedFiles) {
    const score = finalScores.get(file.path) ?? 0

    if (score < opts.minScore) continue
    if (tokensOut + file.tokens > opts.maxTokens) continue

    selected.push(file)
    tokensOut += file.tokens
  }

  const tokensSaved = tokensIn - tokensOut
  const trimRatio = tokensIn > 0 ? tokensSaved / tokensIn : 0

  if (trimRatio < 0.1) {
    return {
      files,
      tokensIn,
      tokensOut: tokensIn,
      tokensSaved: 0,
      trimRatio: 0,
      filesIn: files.length,
      filesOut: files.length,
    }
  }

  return {
    files: selected,
    tokensIn,
    tokensOut,
    tokensSaved,
    trimRatio,
    filesIn: files.length,
    filesOut: selected.length,
  }
}
