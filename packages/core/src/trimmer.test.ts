import { describe, it, expect } from "vitest"
import { trimFiles } from "./trimmer.js"
import type { CodeFile } from "./types.js"

const makeFile = (path: string, content: string): CodeFile => ({
  path,
  content,
  language: "typescript",
  tokens: Math.ceil(content.length / 4),
})

describe("trimFiles", () => {
  it("selects relevant file", () => {
    const files = [
      makeFile("auth/login.ts", "export function login(user: string) { return jwt.sign(user) }"),
      makeFile("render/template.ts", "export function render(name: string) { return html[name] }"),
      makeFile("db/migrate.ts", "export function migrate(db: Database) { return schema.up(db) }"),
    ]

    const result = trimFiles(files, "implement user login with JWT authentication")

    expect(result.filesOut).toBeLessThan(result.filesIn)
    expect(result.files.map((f) => f.path)).toContain("auth/login.ts")
  })

  it("returns all files when query is empty", () => {
    const files = [makeFile("a.ts", "content a"), makeFile("b.ts", "content b")]
    const result = trimFiles(files, "")
    expect(result.filesOut).toBe(2)
    expect(result.tokensSaved).toBe(0)
  })

  it("returns all files when trim ratio < 10%", () => {
    const files = [makeFile("only.ts", "export function hello() { return 'world' }")]
    const result = trimFiles(files, "hello world")
    expect(result.tokensSaved).toBe(0)
  })

  it("respects maxTokens budget", () => {
    const files = [
      makeFile("big.ts", "x".repeat(10000)),
      makeFile("small.ts", "export function tiny() {}"),
    ]
    const result = trimFiles(files, "tiny function", { maxTokens: 100 })
    expect(result.tokensOut).toBeLessThanOrEqual(100)
  })
})
