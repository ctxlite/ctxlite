import { describe, it, expect } from "vitest"
import { extractFiles, extractQuery } from "./parser.js"

describe("extractFiles", () => {
  it("extracts file with path comment", () => {
    const text = [
      "Refactoreaza functia de login:",
      "```typescript",
      "// File: auth/login.ts",
      "export function login() {}",
      "```",
    ].join("\n")

    const files = extractFiles(text)
    expect(files).toHaveLength(1)
    expect(files[0]?.path).toBe("auth/login.ts")
    expect(files[0]?.language).toBe("typescript")
  })

  it("extracts multiple files", () => {
    const text = [
      "```go",
      "// File: main.go",
      "package main",
      "```",
      "```go",
      "// File: handler.go",
      "package main",
      "```",
    ].join("\n")

    const files = extractFiles(text)
    expect(files).toHaveLength(2)
  })

  it("skips empty code blocks", () => {
    const text = "```typescript\n\n```"
    const files = extractFiles(text)
    expect(files).toHaveLength(0)
  })
})

describe("extractQuery", () => {
  it("removes code blocks from text", () => {
    const text = "Fix the login bug:\n```ts\ncode here\n```\nPlease hurry."
    const query = extractQuery(text)
    expect(query).not.toContain("code here")
    expect(query).toContain("Fix the login bug")
    expect(query).toContain("Please hurry")
  })
})
