import type { Plugin } from "@opencode-ai/plugin"
import { buildSystemPromptAddition } from "./system-prompt.js"
import { createStatsEventHandler } from "./stats-events.js"
import { getStatsTool, trimContextTool } from "./tools.js"

/**
 * ctxlite OpenCode plugin
 *
 * 1. Injects conciseness instructions into the system prompt
 * 2. Records conciseness + trim savings to ~/.ctxlite/stats.db
 * 3. Exposes `get_stats` and `trim_context` tools
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

    event: createStatsEventHandler(),

    tool: {
      get_stats: getStatsTool,
      trim_context: trimContextTool,
    },
  }
}

export default CtxlitePlugin
