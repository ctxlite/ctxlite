import { describe, it, expect } from "vitest"
import { pruneMessageContext } from "./context-prune.js"

describe("pruneMessageContext", () => {
  it("prunes duplicate tool outputs keeping the latest call", () => {
    const args = { path: "src/a.ts" }
    const messages = [
      {
        parts: [
          {
            type: "tool",
            callID: "call-1",
            tool: "read",
            state: { status: "completed", input: args, output: "a".repeat(400) },
          },
        ],
      },
      {
        parts: [
          {
            type: "tool",
            callID: "call-2",
            tool: "read",
            state: { status: "completed", input: args, output: "b".repeat(400) },
          },
        ],
      },
    ]

    const result = pruneMessageContext(messages)
    expect(result.prunedCount).toBe(1)
    expect(result.tokensSaved).toBeGreaterThan(50)
    expect(messages[0]?.parts[0]?.state?.output).toContain("[ctxlite] Duplicate")
    expect(messages[1]?.parts[0]?.state?.output).toBe("b".repeat(400))
  })
})
