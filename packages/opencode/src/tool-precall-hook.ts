import { optimizeToolArgs, logOptimizationSavings } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"
import { markPrecallPending, markPathEngaged, hasPathEngagement } from "./precall-state.js"

const SKIP_TOOLS = new Set(["get_stats", "trim_context", "smart_read", "concise_reply"])

/** Tools whose use on a path signals real engagement with it (spec 026, User Story 2). */
const EDIT_LIKE_TOOLS = new Set(["edit", "write", "patch", "multiedit"])

function extractPathArg(args: Record<string, unknown>): string | null {
  if (typeof args.path === "string") return args.path
  if (typeof args.filePath === "string") return args.filePath
  if (typeof args.file_path === "string") return args.file_path
  return null
}

type BeforeOutput = {
  args: Record<string, unknown>
  result?: string
  error?: string
}

/**
 * Rewrites tool args before execution (quiet flags, blocked reads).
 */
export function createToolPrecallHook(): (
  input: { tool: string; sessionID: string; callID: string },
  output: BeforeOutput,
) => Promise<void> {
  const dbPath = getStatsDbPath()

  return async (input, output) => {
    const args = output.args ?? {}

    // Marks path engagement BEFORE the SKIP_TOOLS early-return below, since
    // smart_read is itself in SKIP_TOOLS — this is the only chance to record
    // "the agent already used smart_read on this path" (spec 026, User
    // Story 2). Deliberately not set from a blocked read itself, so the
    // agent can't bypass enforcement by just repeating the identical call.
    if (input.tool === "smart_read" || EDIT_LIKE_TOOLS.has(input.tool)) {
      const engagedPath = extractPathArg(args)
      if (engagedPath) {
        markPathEngaged(input.sessionID, engagedPath)
      }
    }

    if (SKIP_TOOLS.has(input.tool)) {
      return
    }

    const readPath = extractPathArg(args)
    const hasEditIntent = readPath !== null && hasPathEngagement(input.sessionID, readPath)
    // enforceSizeThreshold: true — the block-and-redirect rule is
    // OpenCode-specific by spec; see optimizeToolArgs's doc comment.
    const result = optimizeToolArgs(input.tool, args, process.cwd(), hasEditIntent, true)

    if (result.blocked) {
      output.result = `[ctxlite] ${result.blockReason ?? "Blocked by ctxlite pre-call filter."}`
      logOptimizationSavings(
        {
          source: "precall",
          upstream: input.tool,
          tokensIn: result.estimatedTokensSaved,
          tokensOut: 0,
          id: `precall-block-${input.callID}`,
          host: "opencode",
          sessionId: input.sessionID,
        },
        dbPath,
      )
      return
    }

    if (!result.modified) {
      return
    }

    Object.assign(output.args, result.args)
    markPrecallPending(input.sessionID, input.callID, {
      estimatedTokensSaved: result.estimatedTokensSaved,
      ...(result.label !== undefined ? { label: result.label } : {}),
    })
  }
}
