import { describe, it, expect } from "vitest"
import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import CtxlitePlugin from "./index.js"

type SystemTransformInput = Parameters<NonNullable<Hooks["experimental.chat.system.transform"]>>[0]

function fakePluginInput(): PluginInput {
  return { client: {} } as unknown as PluginInput
}

function fakeSystemTransformInput(): SystemTransformInput {
  return {} as unknown as SystemTransformInput
}

describe("CtxlitePlugin", () => {
  it("registers every expected hook and tool", async () => {
    const hooks = await CtxlitePlugin(fakePluginInput())

    expect(hooks["tool.execute.before"]).toBeTypeOf("function")
    expect(hooks["tool.execute.after"]).toBeTypeOf("function")
    expect(hooks["experimental.chat.system.transform"]).toBeTypeOf("function")
    expect(hooks["experimental.chat.messages.transform"]).toBeTypeOf("function")
    expect(hooks["experimental.session.compacting"]).toBeTypeOf("function")
    expect(hooks.event).toBeTypeOf("function")
    expect(hooks.tool?.get_stats).toBeDefined()
    expect(hooks.tool?.trim_context).toBeDefined()
    expect(hooks.tool?.smart_read).toBeDefined()
  })

  it("appends the conciseness instructions to an empty system prompt array", async () => {
    const hooks = await CtxlitePlugin(fakePluginInput())
    const output = { system: [] as string[] }

    await hooks["experimental.chat.system.transform"]?.(fakeSystemTransformInput(), output)

    expect(output.system).toHaveLength(1)
    expect(output.system[0]).toContain("Token efficiency")
  })

  it("appends to the last existing system prompt entry instead of replacing it", async () => {
    const hooks = await CtxlitePlugin(fakePluginInput())
    const output = { system: ["base instructions"] }

    await hooks["experimental.chat.system.transform"]?.(fakeSystemTransformInput(), output)

    expect(output.system).toHaveLength(1)
    expect(output.system[0]).toContain("base instructions")
    expect(output.system[0]).toContain("Token efficiency")
  })
})
