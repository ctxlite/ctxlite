import type { TaskId } from "../src/types.js"

export interface Scenario {
  taskId: TaskId
  description: string
  mechanisms: string[]
}

export const CANONICAL_TASK_IDS: TaskId[] = [
  "compact-stale-tool-output",
  "compress-large-output",
  "concise-10000-tokens",
  "precall-npm-test",
  "prune-duplicate-tool-call",
  "smart-read-typescript",
  "trim-file-list",
]

export const SCENARIOS: Scenario[] = [
  {
    taskId: "compact-stale-tool-output",
    description: "Large stale tool output in an older message is compacted",
    mechanisms: ["compact"],
  },
  {
    taskId: "compress-large-output",
    description: "Verbose build log output is compressed after tool execution",
    mechanisms: ["compress"],
  },
  {
    taskId: "concise-10000-tokens",
    description: "Conciseness instructions reduce verbose assistant output (estimate)",
    mechanisms: ["concise"],
  },
  {
    taskId: "precall-npm-test",
    description: "Noisy npm test command gets quiet flags (estimate)",
    mechanisms: ["precall"],
  },
  {
    taskId: "prune-duplicate-tool-call",
    description: "Duplicate read tool output is pruned from context",
    mechanisms: ["prune"],
  },
  {
    taskId: "smart-read-typescript",
    description: "TypeScript file read returns signatures only",
    mechanisms: ["smart_read"],
  },
  {
    taskId: "trim-file-list",
    description: "Irrelevant files dropped from candidate list",
    mechanisms: ["trim"],
  },
]

/** Large line-oriented tool output (~12.5k tokens). */
export function largeToolOutput(): string {
  return Array.from({ length: 800 }, (_, i) => `line ${i} of noisy output padding padding ${"x".repeat(24)}`).join("\n")
}

/** TypeScript source for smart_read scenario. */
export const TYPESCRIPT_FIXTURE = `export function add(a: number, b: number): number {
  return a + b
}
export class Calculator {
  multiply(x: number, y: number): number {
    return x * y
  }
}
`

/** Candidate files for trim scenario. */
export const TRIM_CANDIDATES = [
  { path: "src/auth/login.ts", content: "export function login(user: string) { return true }" },
  { path: "src/auth/session.ts", content: "export function session() { return 'ok' }" },
  { path: "docs/readme.md", content: "# Auth\n\nLogin flow documentation for the auth module." },
  { path: "package.json", content: '{"name":"demo"}' },
]
