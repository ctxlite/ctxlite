import { describe, it, expect } from "vitest"
import { compressGrepOutput, compressOutputForTool } from "./grep-output-compress.js"

function grepLines(file: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `${file}:${i + 1}:match number ${i + 1} in ${file}`).join("\n")
}

describe("compressGrepOutput", () => {
  it("leaves small output unchanged", () => {
    const text = grepLines("src/a.ts", 2)
    const result = compressGrepOutput(text)
    expect(result.compressed).toBe(false)
    expect(result.output).toBe(text)
  })

  it("caps matches per file, keeping a spread across many files", () => {
    const files = Array.from({ length: 10 }, (_, i) => `src/file${i}.ts`)
    const text = files.map((f) => grepLines(f, 50)).join("\n")

    const result = compressGrepOutput(text, { minTokens: 1 })
    expect(result.compressed).toBe(true)
    expect(result.tokensSaved).toBeGreaterThan(0)

    // Every file should still appear at least once — that's the whole point
    // vs. blind head/tail, which would show all of file0 and none of file9.
    for (const file of files) {
      expect(result.output).toContain(file)
    }
    expect(result.output).toContain("more match(es) in")
  })

  it("caps the number of files shown when there are too many", () => {
    const files = Array.from({ length: 50 }, (_, i) => `src/file${i}.ts`)
    const text = files.map((f) => grepLines(f, 3)).join("\n")

    const result = compressGrepOutput(text, { minTokens: 1, maxFiles: 10 })
    expect(result.compressed).toBe(true)
    expect(result.output).toContain("more file(s) with matches")
  })

  it("does not touch non-grep-style output (e.g. files_with_matches mode)", () => {
    const text = Array.from({ length: 200 }, (_, i) => `src/file${i}.ts`).join("\n")
    const result = compressGrepOutput(text, { minTokens: 1 })
    expect(result.compressed).toBe(false)
  })
})

describe("compressOutputForTool", () => {
  it("uses grep-aware compression for the Grep tool", () => {
    const files = Array.from({ length: 10 }, (_, i) => `src/file${i}.ts`)
    const text = files.map((f) => grepLines(f, 50)).join("\n")

    const result = compressOutputForTool("Grep", text)
    expect(result.compressed).toBe(true)
    expect(result.output).toContain("more match(es) in")
  })

  it("is case-insensitive on tool name", () => {
    const files = Array.from({ length: 10 }, (_, i) => `src/file${i}.ts`)
    const text = files.map((f) => grepLines(f, 50)).join("\n")

    const result = compressOutputForTool("grep", text)
    expect(result.compressed).toBe(true)
  })

  it("falls back to generic compression for non-grep tools", () => {
    const big = "line\n".repeat(5000)
    const result = compressOutputForTool("Bash", big)
    expect(result.compressed).toBe(true)
    expect(result.output).toContain("[ctxlite]")
    expect(result.output).not.toContain("more match(es) in")
  })

  it("falls back to generic compression when Grep output isn't grep -n style", () => {
    const big = "src/file.ts\n".repeat(5000) // files_with_matches style, no line numbers
    const result = compressOutputForTool("Grep", big)
    expect(result.compressed).toBe(true)
    expect(result.output).toContain("[ctxlite]")
  })
})
