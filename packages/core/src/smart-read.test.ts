import { describe, it, expect } from "vitest"
import { extractSymbols, supportsSymbols } from "./smart-read.js"

describe("supportsSymbols", () => {
  it("supports ts/tsx/js/jsx", () => {
    expect(supportsSymbols("a.ts")).toBe(true)
    expect(supportsSymbols("a.tsx")).toBe(true)
    expect(supportsSymbols("a.js")).toBe(true)
    expect(supportsSymbols("a.jsx")).toBe(true)
  })

  it("returns false for unsupported extensions", () => {
    expect(supportsSymbols("a.py")).toBe(false)
    expect(supportsSymbols("a.go")).toBe(false)
    expect(supportsSymbols("a")).toBe(false)
  })
})

describe("extractSymbols", () => {
  it("returns null for unsupported extensions", async () => {
    const result = await extractSymbols("def foo(): pass", "a.py")
    expect(result).toBeNull()
  })

  it("blanks a top-level function body", async () => {
    const source = `function add(a: number, b: number): number {\n  return a + b\n}`
    const result = await extractSymbols(source, "a.ts")
    expect(result).toContain("function add(a: number, b: number): number {")
    expect(result).toContain("/* ... */")
    expect(result).not.toContain("return a + b")
  })

  it("blanks an exported arrow function body", async () => {
    const source = `export const add = (a: number, b: number): number => {\n  return a + b\n}`
    const result = await extractSymbols(source, "a.ts")
    expect(result).toContain("export const add = (a: number, b: number): number => {")
    expect(result).toContain("/* ... */")
    expect(result).not.toContain("return a + b")
  })

  it("blanks method bodies but keeps the class shape", async () => {
    const source = `class Calculator {\n  add(a: number, b: number): number {\n    return a + b\n  }\n  sub(a: number, b: number): number {\n    return a - b\n  }\n}`
    const result = await extractSymbols(source, "a.ts")
    expect(result).toContain("class Calculator {")
    expect(result).toContain("add(a: number, b: number): number {")
    expect(result).toContain("sub(a: number, b: number): number {")
    expect(result).not.toContain("return a + b")
    expect(result).not.toContain("return a - b")
  })

  it("keeps imports, interfaces, and type aliases intact", async () => {
    const source = `import { z } from "zod"\ninterface Point { x: number; y: number }\ntype ID = string`
    const result = await extractSymbols(source, "a.ts")
    expect(result).toContain('import { z } from "zod"')
    expect(result).toContain("interface Point { x: number; y: number }")
    expect(result).toContain("type ID = string")
  })

  it("parses .tsx with JSX syntax", async () => {
    const source = `export function Hello() {\n  return <div>hi</div>\n}`
    const result = await extractSymbols(source, "a.tsx")
    expect(result).toContain("export function Hello() {")
    expect(result).toContain("/* ... */")
  })

  it("parses plain JavaScript", async () => {
    const source = `function add(a, b) {\n  return a + b\n}`
    const result = await extractSymbols(source, "a.js")
    expect(result).toContain("function add(a, b) {")
    expect(result).toContain("/* ... */")
  })
})
