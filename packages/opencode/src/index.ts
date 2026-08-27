import type { Plugin } from "@opencode-ai/plugin"
import { buildSystemPromptAddition } from "./system-prompt.js"
import { createMessagesTransformHook } from "./messages-transform-hook.js"
import { createCompactionHook } from "./compaction-hook.js"
import { createStatsEventHandler } from "./stats-events.js"
import { createToolPrecallHook } from "./tool-precall-hook.js"
import { createToolCompressHook } from "./tool-compress-hook.js"
import { getStatsTool, trimContextTool, conciseReplyTool } from "./tools.js"
import { smartReadTool } from "./smart-read-tool.js"

/**
 * ctxlite OpenCode plugin
 *
 * 1. Rewrites tool args before execution (tool.execute.before)
 * 2. Compresses tool output after execution (tool.execute.after)
 * 3. Prunes duplicate and caps stale tool output from context before each LLM request
 * 4. Injects conciseness instructions into the system prompt
 * 5. Preserves task-critical detail when OpenCode compacts a long session
 * 6. Records all savings to ~/.ctxlite/stats.db
 * 7. Shows a TUI toast with per-turn savings, so users see ctxlite working
 *    without having to call get_stats
 */
const CtxlitePlugin: Plugin = async ({ client }) => {
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

    "tool.execute.before": createToolPrecallHook(),

    "tool.execute.after": createToolCompressHook(),

    "experimental.chat.messages.transform": createMessagesTransformHook(),

    "experimental.session.compacting": createCompactionHook(),

    event: createStatsEventHandler(client),

    tool: {
      get_stats: getStatsTool,
      trim_context: trimContextTool,
      smart_read: smartReadTool,
      concise_reply: conciseReplyTool,
    },
  }
}

export default CtxlitePlugin
