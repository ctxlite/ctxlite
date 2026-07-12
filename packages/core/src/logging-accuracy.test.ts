import { describe, it, expect } from "vitest"
import { isLoggingAccurate, verifyLoggingAccuracy } from "./logging-accuracy.js"

describe("verifyLoggingAccuracy", () => {
  it("returns low delta when logged matches independent count", () => {
    const before = "a".repeat(400)
    const after = "a".repeat(100)
    expect(verifyLoggingAccuracy(75, before, after)).toBeLessThanOrEqual(0.1)
    expect(isLoggingAccurate(75, before, after)).toBe(true)
  })

  it("flags large divergence", () => {
    expect(isLoggingAccurate(500, "a".repeat(400), "a".repeat(100))).toBe(false)
  })
})
