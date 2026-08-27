import { describe, it, expect } from "vitest"
import { markPrecallPending, takePrecallPending, markPathEngaged, hasPathEngagement } from "./precall-state.js"

describe("markPrecallPending / takePrecallPending", () => {
  it("returns the marked entry and clears it on take", () => {
    markPrecallPending("ses-1", "call-1", { estimatedTokensSaved: 500, label: "npm_test" })

    const first = takePrecallPending("ses-1", "call-1")
    expect(first).toEqual({ estimatedTokensSaved: 500, label: "npm_test" })

    const second = takePrecallPending("ses-1", "call-1")
    expect(second).toBeUndefined()
  })

  it("returns undefined when nothing was ever marked for that key", () => {
    expect(takePrecallPending("ses-none", "call-none")).toBeUndefined()
  })

  it("keeps entries for different sessionID+callID pairs independent", () => {
    markPrecallPending("ses-a", "call-1", { estimatedTokensSaved: 100 })
    markPrecallPending("ses-b", "call-1", { estimatedTokensSaved: 200 })
    markPrecallPending("ses-a", "call-2", { estimatedTokensSaved: 300 })

    expect(takePrecallPending("ses-a", "call-1")).toEqual({ estimatedTokensSaved: 100 })
    expect(takePrecallPending("ses-b", "call-1")).toEqual({ estimatedTokensSaved: 200 })
    expect(takePrecallPending("ses-a", "call-2")).toEqual({ estimatedTokensSaved: 300 })
  })

  it("supports an entry with no label", () => {
    markPrecallPending("ses-1", "call-3", { estimatedTokensSaved: 50 })
    expect(takePrecallPending("ses-1", "call-3")).toEqual({ estimatedTokensSaved: 50 })
  })
})

describe("markPathEngaged / hasPathEngagement (spec 026, User Story 2)", () => {
  it("is false for a path never engaged in that session", () => {
    expect(hasPathEngagement("ses-engage-1", "src/big.ts")).toBe(false)
  })

  it("is true after the path is marked engaged in that session", () => {
    markPathEngaged("ses-engage-2", "src/big.ts")
    expect(hasPathEngagement("ses-engage-2", "src/big.ts")).toBe(true)
  })

  it("keeps engagement scoped to the session it was marked in", () => {
    markPathEngaged("ses-engage-3", "src/big.ts")
    expect(hasPathEngagement("ses-engage-other", "src/big.ts")).toBe(false)
  })

  it("keeps engagement scoped to the exact path within a session", () => {
    markPathEngaged("ses-engage-4", "src/big.ts")
    expect(hasPathEngagement("ses-engage-4", "src/other.ts")).toBe(false)
  })
})
