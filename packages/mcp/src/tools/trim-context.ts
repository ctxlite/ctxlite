import { z } from "zod"
import { trimFiles, estimateTokens } from "@ctxlite/core"
import type { CodeFile } from "@ctxlite/core"

export const trimContextSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().describe("Relative file path (e.g. src/auth/login.ts)"),
        content: z.string().describe("Full file content"),
        language: z
          .string()
          .optional()
          .describe("Programming language (e.g. typescript, go, python)"),
      }),
    )
    .min(1)
    .describe("Files to analyze for relevance"),
  query: z
    .string()
    .min(1)
    .describe("Description of your current task — used to score file relevance"),
  maxTokens: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max token budget for selected files. Default: 4096"),
})

export async function handleTrimContext(
  args: z.infer<typeof trimContextSchema>,
): Promise<string> {
  const { files, query, maxTokens = 4096 } = args

  const codeFiles: CodeFile[] = files.map((f) => ({
    path: f.path,
    content: f.content,
    language: f.language ?? f.path.split(".").pop() ?? "",
    tokens: estimateTokens(f.content),
  }))

  const result = trimFiles(codeFiles, query, { maxTokens })

  if (result.tokensSaved === 0) {
    return [
      `## trim_context`,
      ``,
      `All ${files.length} files are relevant for this task — no trimming applied.`,
      `Total tokens: ${result.tokensIn}`,
    ].join("\n")
  }

  const selectedPaths = result.files
    .map((f) => `- \`${f.path}\` (${f.tokens} tokens)`)
    .join("\n")

  const selectedSet = new Set(result.files.map((f) => f.path))
  const excludedPaths = codeFiles
    .filter((f) => !selectedSet.has(f.path))
    .map((f) => `- \`${f.path}\` (${f.tokens} tokens)`)
    .join("\n")

  return [
    `## trim_context result`,
    ``,
    `**Selected** — ${result.filesOut} of ${result.filesIn} files, ${result.tokensOut} tokens:`,
    selectedPaths,
    ``,
    `**Excluded** — saved ${result.tokensSaved} tokens (-${Math.round(result.trimRatio * 100)}%):`,
    excludedPaths,
    ``,
    `_Include only the selected files in your next prompt to reduce token usage._`,
  ].join("\n")
}
