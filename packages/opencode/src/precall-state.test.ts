import { describe, it, expect } from "vitest"
import { markPrecallPending, takePrecallPending } from "./precall-state.js"

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
