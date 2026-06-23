import { describe, it, expect } from "vitest"
import { pruneMessageContext, capStaleToolOutputs, type PruneMessage } from "./context-prune.js"

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

describe("capStaleToolOutputs", () => {
  it("caps a large unique output in an older message", () => {
    const messages: PruneMessage[] = [
      {
        parts: [
          {
            type: "tool",
            callID: "call-1",
            tool: "read",
            state: { status: "completed", output: "x".repeat(5000) },
          },
        ],
      },
      {
        parts: [{ type: "text" }],
      },
    ]

    const result = capStaleToolOutputs(messages)
    expect(result.cappedCount).toBe(1)
    expect(result.tokensSaved).toBeGreaterThan(0)
    expect(messages[0]?.parts[0]?.state?.output).toContain("[ctxlite]")
    expect(messages[0]?.parts[0]?.state?.output?.length).toBeLessThan(5000)
  })

  it("leaves the most recent message untouched", () => {
    const messages = [
      {
        parts: [
          {
            type: "tool",
            callID: "call-1",
            tool: "read",
            state: { status: "completed", output: "x".repeat(5000) },
          },
        ],
      },
    ]

    const result = capStaleToolOutputs(messages)
    expect(result.cappedCount).toBe(0)
    expect(messages[0]?.parts[0]?.state?.output).toBe("x".repeat(5000))
  })

  it("leaves small outputs alone", () => {
    const messages: PruneMessage[] = [
      { parts: [{ type: "tool", callID: "call-1", tool: "read", state: { status: "completed", output: "short" } }] },
      { parts: [{ type: "text" }] },
    ]

    const result = capStaleToolOutputs(messages)
    expect(result.cappedCount).toBe(0)
    expect(messages[0]?.parts[0]?.state?.output).toBe("short")
  })
})
