import { describe, it, expect } from "vitest"
import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { diffRead, parseUnifiedDiffHunks } from "./diff-read.js"
import { estimateTokens } from "./tokens.js"

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../test-fixtures/mcp-efficiency")

describe("parseUnifiedDiffHunks", () => {
  it("parses hunk headers", async () => {
    const diff = await readFile(join(FIXTURE_DIR, "unified.diff"), "utf8")
    const hunks = parseUnifiedDiffHunks(diff)
    expect(hunks.length).toBeGreaterThan(0)
    expect(hunks[0]?.newStart).toBeGreaterThan(0)
  })
})

describe("diffRead", () => {
  it("SC-003: output is ≥70% smaller than full file and includes changed hunk", async () => {
    const path = join(FIXTURE_DIR, "large-file.ts")
    const diff = await readFile(join(FIXTURE_DIR, "unified.diff"), "utf8")
    const full = await readFile(path, "utf8")
    const tokensIn = estimateTokens(full)

    const result = await diffRead({ path, diff, cwd: FIXTURE_DIR })
    expect(result.tokensIn).toBe(tokensIn)
    expect(result.hunksIncluded).toBeGreaterThan(0)
    expect(result.output).toContain("login(email: string, password: string)")
    expect(result.tokensSaved / tokensIn).toBeGreaterThanOrEqual(0.7)
  })

  it("rejects unparseable diff", async () => {
    await expect(diffRead({ path: join(FIXTURE_DIR, "large-file.ts"), diff: "not a diff" })).rejects.toThrow(
      /no hunks/,
    )
  })

  it("rejects missing file", async () => {
    const diff = await readFile(join(FIXTURE_DIR, "unified.diff"), "utf8")
    await expect(diffRead({ path: "missing.ts", diff, cwd: FIXTURE_DIR })).rejects.toThrow(/not found/)
  })
})
