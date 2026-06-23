// Claude Code hooks bridge — PreToolUse/PostToolUse run as a spawned process
// per tool call, communicating via stdin/stdout JSON. Unlike OpenCode's
// in-process plugin hooks, a parse error here must never surface to the
// user: any unexpected shape is a silent no-op, not a blocked tool call.

import { compressToolOutput, defaultDbPath, logOptimizationSavings, optimizeToolArgs } from "@ctxlite/core"

interface PreToolUseInput {
  tool_name?: string
  tool_input?: Record<string, unknown>
  session_id?: string
}

interface PostToolUseInput {
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_output?: unknown
  session_id?: string
}

async function readStdin(stream: AsyncIterable<Buffer | string>): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

/** Claude Code's tool_output shape isn't fixed per tool — handle string and the common {content}/{stdout} object shapes. */
function textFromToolOutput(output: unknown): string | null {
  if (typeof output === "string") {
    return output
  }
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>
    if (typeof obj.content === "string") {
      return obj.content
    }
    if (typeof obj.stdout === "string") {
      return obj.stdout
    }
  }
  return null
}

/** Rebuilds tool_output in the same shape it arrived in, with just the text field replaced. */
function rebuildToolOutput(original: unknown, newText: string): unknown {
  if (typeof original === "string") {
    return newText
  }
  if (original && typeof original === "object") {
    const obj = original as Record<string, unknown>
    if (typeof obj.content === "string") {
      return { ...obj, content: newText }
    }
    if (typeof obj.stdout === "string") {
      return { ...obj, stdout: newText }
    }
  }
  return newText
}

function writeJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value))
}

export async function runPreToolUseHook(stdin: AsyncIterable<Buffer | string> = process.stdin): Promise<number> {
  try {
    const input = JSON.parse(await readStdin(stdin)) as PreToolUseInput
    const tool = input.tool_name?.toLowerCase()
    if (!tool) {
      return 0
    }

    const result = optimizeToolArgs(tool, input.tool_input ?? {})
    const dbPath = defaultDbPath()

    if (result.blocked) {
      logOptimizationSavings(
        {
          source: "precall",
          upstream: "claude-code",
          tokensIn: result.estimatedTokensSaved,
          tokensOut: 0,
          host: "claude-code",
          sessionId: input.session_id,
        },
        dbPath,
      )
      writeJson({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: result.blockReason ?? "Blocked by ctxlite pre-call filter.",
        },
      })
      return 0
    }

    if (result.modified) {
      logOptimizationSavings(
        {
          source: "precall",
          upstream: "claude-code",
          tokensIn: result.estimatedTokensSaved,
          tokensOut: 0,
          host: "claude-code",
          sessionId: input.session_id,
        },
        dbPath,
      )
      writeJson({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          updatedInput: result.args,
        },
      })
    }

    return 0
  } catch {
    return 0
  }
}

export async function runPostToolUseHook(stdin: AsyncIterable<Buffer | string> = process.stdin): Promise<number> {
  try {
    const input = JSON.parse(await readStdin(stdin)) as PostToolUseInput
    const text = textFromToolOutput(input.tool_output)
    if (text === null) {
      return 0
    }

    const result = compressToolOutput(text)
    if (!result.compressed) {
      return 0
    }

    logOptimizationSavings(
      {
        source: "compress",
        upstream: "claude-code",
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        host: "claude-code",
        sessionId: input.session_id,
      },
      defaultDbPath(),
    )
    writeJson({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        updatedToolOutput: rebuildToolOutput(input.tool_output, result.output),
      },
    })

    return 0
  } catch {
    return 0
  }
}
