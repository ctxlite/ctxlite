import type { Plugin } from "@opencode-ai/plugin"
import { buildSystemPromptAddition } from "./system-prompt.js"
import { getStatsTool, trimContextTool } from "./tools.js"

/**
 * ctxlite OpenCode plugin
 *
 * 1. Injects conciseness instructions into the system prompt
 * 2. Exposes `get_stats` for token savings reporting
 * 3. Exposes `trim_context` for explicit file trimming
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

    tool: {
      get_stats: getStatsTool,
      trim_context: trimContextTool,
    },
  }
}

export default CtxlitePlugin
