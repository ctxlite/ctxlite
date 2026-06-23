import { describe, it, expect } from "vitest"
import { createCompactionHook } from "./compaction-hook.js"

describe("createCompactionHook", () => {
  it("appends the continuation checklist to the compaction context", async () => {
    const hook = createCompactionHook()
    const output = { context: ["existing context line"] }

    await hook({ sessionID: "ses-1" }, output)

    expect(output.context).toHaveLength(2)
    expect(output.context[0]).toBe("existing context line")
    expect(output.context[1]).toContain("ctxlite continuation checklist")
    expect(output.context[1]).toContain("Commands already run")
  })

  it("does not throw when context starts empty", async () => {
    const hook = createCompactionHook()
    const output = { context: [] }
    await expect(hook({ sessionID: "ses-1" }, output)).resolves.not.toThrow()
    expect(output.context).toHaveLength(1)
  })
})
