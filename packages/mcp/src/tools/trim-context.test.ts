import { describe, it, expect, afterAll, vi } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// shared.ts computes STATS_DB_PATH from homedir() once, at import time — the
// fake homedir must exist before that import happens, or this test suite
// writes real rows into the user's actual ~/.ctxlite/stats.db on every run.
const tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-mcp-trim-context-home-"))
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { handleTrimContext } = await import("./trim-context.js")
const { closeSharedStores } = await import("@ctxlite/core")

afterAll(() => {
  closeSharedStores()
  rmSync(tmpHome, { recursive: true, force: true })
})

describe("handleTrimContext", () => {
  const authFile = {
    path: "src/auth/login.ts",
    content: `export function login(user: string, pass: string) {
      return jwt.sign({ user }, process.env.JWT_SECRET)
    }`,
    language: "typescript",
  }

  const templateFile = {
    path: "src/render/template.ts",
    content: `export function renderHTML(name: string) {
      return templates[name]
    }`,
    language: "typescript",
  }

  const migrationFile = {
    path: "src/db/migrate.ts",
    content: `export function runMigrations(db: Database) {
      return schema.up(db)
    }`,
    language: "typescript",
  }

  it("selects auth file for login query", async () => {
    const result = await handleTrimContext({
      files: [authFile, templateFile, migrationFile],
      query: "implement user login with JWT authentication",
    })

    expect(result).toContain("src/auth/login.ts")
  })

  it("returns all files message when no trimming needed", async () => {
    const result = await handleTrimContext({
      files: [authFile],
      query: "login",
    })

    expect(result).toContain("All")
    expect(result).toContain("no trimming applied")
  })

  it("respects maxTokens budget", async () => {
    const bigFile = {
      path: "big.ts",
      content: "x".repeat(20000),
      language: "typescript",
    }
    const smallFile = {
      path: "small.ts",
      content: "export function tiny() { return true }",
      language: "typescript",
    }

    const result = await handleTrimContext({
      files: [bigFile, smallFile],
      query: "tiny function",
      maxTokens: 50,
    })

    expect(result).toContain("small.ts")
    expect(result).toContain("big.ts")
  })

  it("returns string, never throws", async () => {
    await expect(
      handleTrimContext({
        files: [{ path: "empty.ts", content: "", language: "typescript" }],
        query: "something",
      }),
    ).resolves.toBeTypeOf("string")
  })

  it("excludes a .ctxliteignore-matched candidate before BM25 scoring, regardless of relevance (SC-003)", async () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpHome)
    writeFileSync(join(tmpHome, ".ctxliteignore"), "*.generated.ts\n")
    try {
      const result = await handleTrimContext({
        files: [
          { ...authFile, content: authFile.content.repeat(50) },
          { path: "auth.generated.ts", content: authFile.content.repeat(50), language: "typescript" },
          { ...templateFile, content: templateFile.content.repeat(50) },
        ],
        query: "implement user login with JWT authentication",
        maxTokens: 20,
      })

      expect(result).not.toContain("auth.generated.ts")
      expect(result).toContain("src/auth/login.ts")
    } finally {
      cwdSpy.mockRestore()
    }
  })
})
