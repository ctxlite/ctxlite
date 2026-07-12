import { describe, it, expect } from "vitest"
import { runAdapterTask } from "../engine.js"

describe("baseline adapter", () => {
  it("returns zero savings for every canonical scenario", async () => {
    const run = await runAdapterTask("baseline", "compress-large-output")
    expect(run.tokensSaved).toBe(0)
    expect(run.status).toBe("passed")
  })
})

describe("cursor adapter", () => {
  it("skips compress-large-output with documented N/A", async () => {
    const run = await runAdapterTask("cursor", "compress-large-output")
    expect(run.tokensSaved).toBe(0)
    expect(run.skipReason).toContain("compress unavailable")
    expect(run.status).toBe("passed")
  })
})

describe("claude-code adapter", () => {
  it("applies precall on npm test scenario", async () => {
    const run = await runAdapterTask("claude-code", "precall-npm-test")
    expect(run.mechanismAttribution.precall).toBeGreaterThan(0)
    expect(run.status).toBe("passed")
  })
})
