import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { loadIgnorePatterns, isIgnored } from "./ctxliteignore.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ctxlite-ignore-"))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function writeIgnoreFile(content: string): void {
  writeFileSync(join(tmpDir, ".ctxliteignore"), content)
}

describe("loadIgnorePatterns", () => {
  it("returns an empty array when no .ctxliteignore exists (FR-004)", () => {
    expect(loadIgnorePatterns(tmpDir)).toEqual([])
  })

  it("parses a simple file-extension glob pattern", () => {
    writeIgnoreFile("*.generated.ts\n")
    const patterns = loadIgnorePatterns(tmpDir)
    expect(patterns).toHaveLength(1)
    expect(patterns.at(0)?.directoryOnly).toBe(false)
  })

  it("parses a directory pattern (trailing slash) as directoryOnly", () => {
    writeIgnoreFile("vendor/\n")
    const patterns = loadIgnorePatterns(tmpDir)
    expect(patterns).toHaveLength(1)
    expect(patterns.at(0)?.directoryOnly).toBe(true)
  })

  it("parses a ** wildcard pattern", () => {
    writeIgnoreFile("dir/**/file.ts\n")
    expect(loadIgnorePatterns(tmpDir)).toHaveLength(1)
  })

  it("skips comment and blank lines", () => {
    writeIgnoreFile("# a comment\n\nvendor/\n   \n# another\n*.ext\n")
    expect(loadIgnorePatterns(tmpDir)).toHaveLength(2)
  })

  it("skips a malformed line without throwing, and without dropping other valid lines (FR-005)", () => {
    writeIgnoreFile("vendor/\n/\n*.ext\n")
    expect(() => loadIgnorePatterns(tmpDir)).not.toThrow()
    const patterns = loadIgnorePatterns(tmpDir)
    expect(patterns).toHaveLength(2)
  })

  it("returns an empty array for a file containing only comments/blank lines", () => {
    writeIgnoreFile("# nothing here\n\n")
    expect(loadIgnorePatterns(tmpDir)).toEqual([])
  })
})

describe("isIgnored", () => {
  it("returns false when there are no patterns", () => {
    expect(isIgnored("src/index.ts", [])).toBe(false)
  })

  it("matches a directory pattern against a deeply nested file", () => {
    writeIgnoreFile("vendor/\n")
    const patterns = loadIgnorePatterns(tmpDir)
    expect(isIgnored("vendor/some-lib/deep/file.go", patterns)).toBe(true)
    expect(isIgnored("src/vendor/file.go", patterns)).toBe(true)
    expect(isIgnored("src/not-vendor/file.go", patterns)).toBe(false)
  })

  it("matches a file-extension glob pattern anywhere in the tree", () => {
    writeIgnoreFile("*.generated.ts\n")
    const patterns = loadIgnorePatterns(tmpDir)
    expect(isIgnored("foo.generated.ts", patterns)).toBe(true)
    expect(isIgnored("src/deep/foo.generated.ts", patterns)).toBe(true)
    expect(isIgnored("foo.ts", patterns)).toBe(false)
  })

  it("matches a ** pattern spanning multiple segments, including zero", () => {
    writeIgnoreFile("dir/**/file.ts\n")
    const patterns = loadIgnorePatterns(tmpDir)
    expect(isIgnored("dir/file.ts", patterns)).toBe(true)
    expect(isIgnored("dir/sub/file.ts", patterns)).toBe(true)
    expect(isIgnored("dir/sub1/sub2/file.ts", patterns)).toBe(true)
    expect(isIgnored("dir/other.ts", patterns)).toBe(false)
  })

  it("normalizes Windows-style backslash paths before matching", () => {
    writeIgnoreFile("vendor/\n")
    const patterns = loadIgnorePatterns(tmpDir)
    expect(isIgnored("vendor\\some-lib\\file.go", patterns)).toBe(true)
  })

  it("a malformed-but-skipped line never blocks valid patterns in the same file from matching", () => {
    writeIgnoreFile("vendor/\n/\n*.ext\n")
    const patterns = loadIgnorePatterns(tmpDir)
    expect(isIgnored("vendor/file.go", patterns)).toBe(true)
    expect(isIgnored("anything.ext", patterns)).toBe(true)
  })
})
