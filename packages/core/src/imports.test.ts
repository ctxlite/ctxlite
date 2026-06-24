import { describe, it, expect } from "vitest"
import { buildImportGraph, calculateImportBoosts } from "./imports.js"
import type { CodeFile } from "./types.js"

function file(path: string, language: string, content: string): CodeFile {
  return { path, language, content, tokens: 0 }
}

describe("buildImportGraph", () => {
  it("extracts relative imports for typescript", () => {
    const graph = buildImportGraph([
      file("a.ts", "typescript", `import { b } from "./b"\nimport { c } from "../c"`),
    ])
    expect(graph.get("a.ts")).toEqual(["./b", "../c"])
  })

  it("extracts relative imports for javascript", () => {
    const graph = buildImportGraph([file("a.js", "javascript", `import b from './b.js'`)])
    expect(graph.get("a.js")).toEqual(["./b.js"])
  })

  it("extracts relative imports for go", () => {
    const graph = buildImportGraph([file("main.go", "go", `import "./local"`)])
    expect(graph.get("main.go")).toEqual(["./local"])
  })

  it("extracts relative imports for python", () => {
    const graph = buildImportGraph([file("a.py", "python", `from .utils import helper`)])
    expect(graph.get("a.py")).toEqual([".utils"])
  })

  it("extracts super/self module references for rust", () => {
    const graph = buildImportGraph([file("a.rs", "rust", `use super::utils;\nuse self::helper;`)])
    expect(graph.get("a.rs")).toEqual(["super", "self"])
  })

  it("skips files in a language with no import pattern", () => {
    const graph = buildImportGraph([file("a.md", "markdown", `import { b } from "./b"`)])
    expect(graph.has("a.md")).toBe(false)
  })

  it("does not add an entry for a file with no matching imports", () => {
    const graph = buildImportGraph([file("a.ts", "typescript", `export const x = 1`)])
    expect(graph.has("a.ts")).toBe(false)
  })

  it("builds entries for multiple files independently", () => {
    const graph = buildImportGraph([
      file("a.ts", "typescript", `import { b } from "./b"`),
      file("b.ts", "typescript", `export const b = 1`),
    ])
    expect(graph.get("a.ts")).toEqual(["./b"])
    expect(graph.has("b.ts")).toBe(false)
  })
})

describe("calculateImportBoosts", () => {
  it("boosts a dependency imported by a positively-scored file", () => {
    const graph = buildImportGraph([file("a.ts", "typescript", `import { b } from "./b"`)])
    const scores = new Map([["a.ts", 10]])

    const boosts = calculateImportBoosts(graph, scores)
    expect(boosts.get("./b")).toBeCloseTo(3)
  })

  it("does not boost dependencies of a zero-or-negative-scored importer", () => {
    const graph = buildImportGraph([file("a.ts", "typescript", `import { b } from "./b"`)])
    const scores = new Map([["a.ts", 0]])

    const boosts = calculateImportBoosts(graph, scores)
    expect(boosts.size).toBe(0)
  })

  it("treats an importer missing from scores as score 0 (no boost)", () => {
    const graph = buildImportGraph([file("a.ts", "typescript", `import { b } from "./b"`)])

    const boosts = calculateImportBoosts(graph, new Map())
    expect(boosts.size).toBe(0)
  })

  it("accumulates boosts when multiple importers share the same dependency", () => {
    const graph = buildImportGraph([
      file("a.ts", "typescript", `import { shared } from "./shared"`),
      file("b.ts", "typescript", `import { shared } from "./shared"`),
    ])
    const scores = new Map([
      ["a.ts", 10],
      ["b.ts", 5],
    ])

    const boosts = calculateImportBoosts(graph, scores)
    expect(boosts.get("./shared")).toBeCloseTo(10 * 0.3 + 5 * 0.3)
  })

  it("returns an empty map for an empty graph", () => {
    expect(calculateImportBoosts(new Map(), new Map()).size).toBe(0)
  })
})
