// Cursor hooks bridge — Cursor's preToolUse uses a flat JSON shape
// (`permission`, `updated_input`), distinct from Claude Code's
// hookSpecificOutput wrapper, even though the concept is the same.
// Cursor's postToolUse can only replace output for MCP tools, not
// built-in ones (Shell/Read/Write), so there is no equivalent of the
// Claude Code "compress" hook here — only the precall (input-rewrite)
// side is portable.

import { defaultDbPath, logOptimizationSavings, optimizeToolArgs } from "@ctxlite/core"

interface CursorPreToolUseInput {
  tool_name?: string
  tool_input?: Record<string, unknown>
  conversation_id?: string
}

async function readStdin(stream: AsyncIterable<Buffer | string>): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

function writeJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value))
}

/** Cursor names its shell tool "Shell"; @ctxlite/core's dispatcher expects "bash". */
function normalizeToolName(name: string): string {
  const lower = name.toLowerCase()
  return lower === "shell" ? "bash" : lower
}

export async function runCursorPreToolUseHook(
  stdin: AsyncIterable<Buffer | string> = process.stdin,
): Promise<number> {
  try {
    const input = JSON.parse(await readStdin(stdin)) as CursorPreToolUseInput
    const toolName = input.tool_name
    if (!toolName) {
      return 0
    }

    const result = optimizeToolArgs(normalizeToolName(toolName), input.tool_input ?? {})
    const dbPath = defaultDbPath()

    if (result.blocked) {
      logOptimizationSavings(
        {
          source: "precall",
          upstream: "cursor",
          tokensIn: result.estimatedTokensSaved,
          tokensOut: 0,
          host: "cursor",
          sessionId: input.conversation_id,
        },
        dbPath,
      )
      writeJson({
        permission: "deny",
        agent_message: result.blockReason ?? "Blocked by ctxlite pre-call filter.",
      })
      return 0
    }

    if (result.modified) {
      logOptimizationSavings(
        {
          source: "precall",
          upstream: "cursor",
          tokensIn: result.estimatedTokensSaved,
          tokensOut: 0,
          host: "cursor",
          sessionId: input.conversation_id,
        },
        dbPath,
      )
      writeJson({ updated_input: result.args })
    }

    return 0
  } catch {
    return 0
  }
}
