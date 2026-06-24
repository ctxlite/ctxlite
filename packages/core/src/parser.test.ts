import { describe, it, expect } from "vitest"
import { extractFiles, extractQuery, detectLanguage } from "./parser.js"

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

describe("detectLanguage", () => {
  it.each([
    ["main.ts", "typescript"],
    ["component.tsx", "typescript"],
    ["index.js", "javascript"],
    ["component.jsx", "javascript"],
    ["main.go", "go"],
    ["script.py", "python"],
    ["lib.rs", "rust"],
    ["Main.java", "java"],
    ["app.rb", "ruby"],
    ["index.php", "php"],
    ["Program.cs", "csharp"],
    ["main.cpp", "cpp"],
    ["main.cc", "cpp"],
    ["main.cxx", "cpp"],
    ["main.c", "c"],
    ["header.h", "c"],
    ["README.md", "markdown"],
    ["data.json", "json"],
    ["config.yaml", "yaml"],
    ["config.yml", "yaml"],
    ["run.sh", "bash"],
    ["run.bash", "bash"],
    ["schema.sql", "sql"],
  ])("maps %s to %s", (path, expected) => {
    expect(detectLanguage(path)).toBe(expected)
  })

  it("is case-insensitive on the extension", () => {
    expect(detectLanguage("Main.TS")).toBe("typescript")
  })

  it("falls back to the raw extension when it isn't in the map", () => {
    expect(detectLanguage("data.xyz")).toBe("xyz")
  })

  it("falls back to the whole (lowercased) filename when there's no dot", () => {
    expect(detectLanguage("Makefile")).toBe("makefile")
  })

  it("uses the last extension for a multi-dot filename", () => {
    expect(detectLanguage("archive.tar.gz")).toBe("gz")
  })
})
