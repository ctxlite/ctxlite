// Import graph detection via regex — no native dependencies

import type { CodeFile } from "./types.js"

const IMPORT_PATTERNS: Record<string, RegExp> = {
  typescript: /(?:import|from)\s+['"](\.[^'"]+)['"]/g,
  javascript: /(?:import|from)\s+['"](\.[^'"]+)['"]/g,
  go: /import\s+(?:[\w]+\s+)?["'](\.[^"']+)["']/g,
  python: /from\s+(\.[^\s]+)\s+import/g,
  rust: /(?:use|mod)\s+(super|self)::[^\s;]+/g,
}

export type ImportGraph = Map<string, string[]>

/**
 * Build a relative import graph for a list of files.
 */
export function buildImportGraph(files: CodeFile[]): ImportGraph {
  const graph: ImportGraph = new Map()

  for (const file of files) {
    const pattern = IMPORT_PATTERNS[file.language]
    if (!pattern) continue

    const imports: string[] = []
    pattern.lastIndex = 0

    let match: RegExpExecArray | null
    while ((match = pattern.exec(file.content)) !== null) {
      const imp = match[1]
      if (imp) imports.push(imp)
    }

    if (imports.length > 0) {
      graph.set(file.path, imports)
    }
  }

  return graph
}

const BOOST_FACTOR = 0.3

/**
 * Calculate import boost scores for files imported by top-scored files.
 */
export function calculateImportBoosts(
  graph: ImportGraph,
  scores: Map<string, number>,
): Map<string, number> {
  const boosts = new Map<string, number>()

  for (const [importer, imported] of graph) {
    const importerScore = scores.get(importer) ?? 0
    if (importerScore <= 0) continue

    for (const dep of imported) {
      const current = boosts.get(dep) ?? 0
      boosts.set(dep, current + importerScore * BOOST_FACTOR)
    }
  }

  return boosts
}
