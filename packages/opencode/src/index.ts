import type { Plugin } from "@opencode-ai/plugin"
import { buildSystemPromptAddition } from "./system-prompt.js"
import { createMessagesTransformHook } from "./messages-transform-hook.js"
import { createStatsEventHandler } from "./stats-events.js"
import { createToolCompressHook } from "./tool-compress-hook.js"
import { getStatsTool, trimContextTool } from "./tools.js"

/**
 * ctxlite OpenCode plugin
 *
 * 1. Compresses tool output automatically (tool.execute.after)
 * 2. Prunes duplicate tool context before each LLM request
 * 3. Injects conciseness instructions into the system prompt
 * 4. Records all savings to ~/.ctxlite/stats.db
 */
const CtxlitePlugin: Plugin = async (_ctx) => {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      const addition = buildSystemPromptAddition()
      if (output.system.length > 0) {
        const last = output.system.length - 1
        output.system[last] = (output.system[last] ?? "") + addition
      } else {
        output.system.push(addition.trim())
      }
    },

    "tool.execute.after": createToolCompressHook(),

    "experimental.chat.messages.transform": createMessagesTransformHook(),

    event: createStatsEventHandler(),

    tool: {
      get_stats: getStatsTool,
      trim_context: trimContextTool,
    },
  }
}

export default CtxlitePlugin
