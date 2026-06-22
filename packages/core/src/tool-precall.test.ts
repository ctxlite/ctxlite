import { describe, it, expect } from "vitest"
import { optimizeBashCommand, optimizeReadPath, optimizeToolArgs } from "./tool-precall.js"

describe("optimizeBashCommand", () => {
  it("adds --silent to npm test", () => {
    const result = optimizeBashCommand("npm test")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("--silent")
    expect(result.estimatedTokensSaved).toBeGreaterThan(0)
  })

  it("adds -q to pytest", () => {
    const result = optimizeBashCommand("pytest tests/")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("-q")
  })

  it("leaves already-quiet commands unchanged", () => {
    const result = optimizeBashCommand("npm test --silent")
    expect(result.modified).toBe(false)
  })
})

describe("optimizeReadPath", () => {
  it("blocks node_modules reads", () => {
    const result = optimizeReadPath("node_modules/foo/index.js")
    expect(result.blocked).toBe(true)
    expect(result.estimatedTokensSaved).toBeGreaterThan(0)
  })

  it("allows normal source reads", () => {
    const result = optimizeReadPath("src/index.ts")
    expect(result.blocked).toBe(false)
  })
})

describe("optimizeToolArgs", () => {
  it("routes bash tool", () => {
    const result = optimizeToolArgs("bash", { command: "cargo test" })
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("--quiet")
  })
})
