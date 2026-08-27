import { describe, it, expect } from "vitest"
import { buildSystemPromptAddition } from "./system-prompt.js"

describe("buildSystemPromptAddition", () => {
  it("starts with newlines for separation", () => {
    const addition = buildSystemPromptAddition()
    expect(addition.startsWith("\n\n")).toBe(true)
  })

  it("contains key instruction keywords", () => {
    const addition = buildSystemPromptAddition()
    expect(addition).toContain("preamble")
    expect(addition).toContain("recap")
    expect(addition).toContain("sign-off")
    expect(addition).toContain("smart_read")
    expect(addition).toContain("trim_context")
    expect(addition).toContain("NEVER use a markdown table")
  })

  it("is idempotent — same output every call", () => {
    expect(buildSystemPromptAddition()).toBe(buildSystemPromptAddition())
  })
})
