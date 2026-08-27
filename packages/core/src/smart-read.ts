// Tree-sitter-based symbol extraction — returns function/class/method
// signatures without bodies, so a large file can be read for its shape
// without paying for every implementation detail.

import { createRequire } from "node:module"
import { readFile } from "node:fs/promises"
import { statSync } from "node:fs"
import { Parser, Language, type Node } from "web-tree-sitter"

const require = createRequire(import.meta.url)

type GrammarName = "typescript" | "tsx" | "javascript"

const WASM_PATHS: Record<GrammarName, string> = {
  typescript: "tree-sitter-typescript/tree-sitter-typescript.wasm",
  tsx: "tree-sitter-typescript/tree-sitter-tsx.wasm",
  javascript: "tree-sitter-javascript/tree-sitter-javascript.wasm",
}

let initPromise: Promise<void> | null = null
const languageCache = new Map<GrammarName, Language>()

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = Parser.init({
      locateFile: () => require.resolve("web-tree-sitter/tree-sitter.wasm"),
    })
  }
  return initPromise
}

async function loadLanguage(name: GrammarName): Promise<Language> {
  const cached = languageCache.get(name)
  if (cached) {
    return cached
  }
  await ensureInit()
  const bytes = await readFile(require.resolve(WASM_PATHS[name]))
  const language = await Language.load(bytes)
  languageCache.set(name, language)
  return language
}

/**
 * Resolved from the file extension directly, not @ctxlite/core's
 * detectLanguage() — that collapses .tsx into "typescript", but TSX needs
 * its own grammar (JSX syntax is ambiguous with TS generics otherwise).
 */
function grammarForPath(path: string): GrammarName | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  switch (ext) {
    case "ts":
    case "mts":
    case "cts":
      return "typescript"
    case "tsx":
      return "tsx"
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript"
    default:
      return null
  }
}

/** Whether extractSymbols has a grammar for this file, based on its extension. */
export function supportsSymbols(path: string): boolean {
  return grammarForPath(path) !== null
}

/**
 * Single cutoff, shared by the "prefer smart_read over a full read" guidance
 * and the precall blocking rule in tool-precall.ts (spec 026 research.md
 * §3) — one threshold, not two, so the two never drift out of sync.
 * ~2k tokens matches the existing conciseness-instructions guidance
 * ("files above ~2-3k tokens").
 */
export const SMART_READ_ELIGIBLE_THRESHOLD_TOKENS = 2000

/**
 * Whether a file at `path` is large enough that smart_read (signatures-only)
 * would meaningfully help, checked from on-disk byte size alone (~4
 * bytes/token estimate) so callers never have to read the full file just to
 * decide. Returns false — never throws — when the file doesn't exist, can't
 * be stat'd, or has no symbol grammar (no cheaper alternative exists, so
 * blocking a read would leave the agent stuck with no path forward).
 */
export function isEligibleForSmartRead(path: string): boolean {
  if (!supportsSymbols(path)) {
    return false
  }
  try {
    const { size } = statSync(path)
    return size / 4 >= SMART_READ_ELIGIBLE_THRESHOLD_TOKENS
  } catch {
    return false
  }
}

function isNode(value: Node | null): value is Node {
  return value !== null
}

function blankFunctionBody(node: Node, source: string): string {
  const body = node.childForFieldName("body")
  if (!body) {
    return source.slice(node.startIndex, node.endIndex)
  }
  const signature = source.slice(node.startIndex, body.startIndex).trimEnd()
  return `${signature} { /* ... */ }`
}

function summarizeClassMember(node: Node, source: string): string {
  if (node.type === "method_definition") {
    return blankFunctionBody(node, source)
  }
  return source.slice(node.startIndex, node.endIndex)
}

function summarizeClass(node: Node, source: string): string {
  const body = node.childForFieldName("body")
  if (!body) {
    return source.slice(node.startIndex, node.endIndex)
  }

  const header = source.slice(node.startIndex, body.startIndex).trimEnd()
  const members = body.namedChildren
    .filter(isNode)
    .map((member) => `  ${summarizeClassMember(member, source)}`)
    .join("\n")

  return members ? `${header} {\n${members}\n}` : `${header} {}`
}

/** Handles `const foo = () => {...}` / `const foo = function () {...}` — the common single-declarator case. */
function summarizeDeclaration(node: Node, source: string): string {
  const declarator = node.namedChildren.filter(isNode).find((child) => child.type === "variable_declarator")
  if (!declarator) {
    return source.slice(node.startIndex, node.endIndex)
  }

  const value = declarator.childForFieldName("value")
  if (value && (value.type === "arrow_function" || value.type === "function_expression")) {
    const body = value.childForFieldName("body")
    if (body) {
      const signature = source.slice(node.startIndex, body.startIndex).trimEnd()
      return `${signature} { /* ... */ }`
    }
  }

  return source.slice(node.startIndex, node.endIndex)
}

function summarizeTopLevelNode(node: Node, source: string): string {
  switch (node.type) {
    case "function_declaration":
    case "generator_function_declaration":
      return blankFunctionBody(node, source)
    case "class_declaration":
      return summarizeClass(node, source)
    case "lexical_declaration":
    case "variable_declaration":
      return summarizeDeclaration(node, source)
    case "export_statement": {
      const inner = node.namedChildren.filter(isNode)[0]
      if (!inner) {
        return source.slice(node.startIndex, node.endIndex)
      }
      const prefix = source.slice(node.startIndex, inner.startIndex)
      return prefix + summarizeTopLevelNode(inner, source)
    }
    default:
      // Imports, interfaces, type aliases, and anything else are already
      // signature-only or short enough that summarizing them risks losing
      // information for no real savings.
      return source.slice(node.startIndex, node.endIndex)
  }
}

/**
 * Returns top-level declaration signatures with function/method bodies
 * blanked out, or null when there's no grammar for this file extension —
 * callers should fall back to budget truncation in that case.
 */
export async function extractSymbols(content: string, path: string): Promise<string | null> {
  const grammar = grammarForPath(path)
  if (!grammar) {
    return null
  }

  const lang = await loadLanguage(grammar)
  const parser = new Parser()
  parser.setLanguage(lang)

  try {
    const tree = parser.parse(content)
    if (!tree) {
      return null
    }

    return tree.rootNode.namedChildren
      .filter(isNode)
      .map((child) => summarizeTopLevelNode(child, content))
      .join("\n\n")
  } finally {
    parser.delete()
  }
}
