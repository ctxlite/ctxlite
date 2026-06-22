import { describe, it, expect } from "vitest"
import { handleTrimContext } from "./trim-context.js"

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
})
