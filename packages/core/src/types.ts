// Shared types used across the library

export interface CodeFile {
  path: string
  content: string
  language: string
  tokens: number
}

export interface TrimResult {
  files: CodeFile[]
  tokensIn: number
  tokensOut: number
  tokensSaved: number
  trimRatio: number
  filesIn: number
  filesOut: number
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface RequestLog {
  upstream: string
  cacheHit: boolean
  tokensIn: number
  tokensUsed: number
  tokensOut: number
  tokensSaved: number
  costSaved: number
  latencyMs: number
  /** trim | concise | compress | prune | precall | compact | smart_read | diff_read | log_summary | code_search | cache | session */
  source?:
    | "trim"
    | "concise"
    | "compress"
    | "prune"
    | "precall"
    | "compact"
    | "smart_read"
    | "diff_read"
    | "log_summary"
    | "code_search"
    | "cache"
    | "session"
  /** opencode | claude-code | cursor | mcp — which integration produced this row, for per-session/per-host reporting. */
  host?: string | undefined
  /** Real session/conversation id when the host exposes one (OpenCode, Claude Code, Cursor hooks); absent for MCP tool calls. */
  sessionId?: string | undefined
}

export interface SessionBreakdownRow {
  host: string
  sessionId: string | null
  totalRequests: number
  tokensSaved: number
  firstTs: number
  lastTs: number
}

export interface Summary {
  totalRequests: number
  trimmedRequests: number
  concisenessRequests: number
  compressRequests: number
  pruneRequests: number
  precallRequests: number
  tokensSaved: number
  trimTokensSaved: number
  concisenessTokensSaved: number
  compressTokensSaved: number
  pruneTokensSaved: number
  precallTokensSaved: number
  compactRequests: number
  compactTokensSaved: number
  smartReadRequests: number
  smartReadTokensSaved: number
  diffReadRequests: number
  diffReadTokensSaved: number
  logSummaryRequests: number
  logSummaryTokensSaved: number
  codeSearchRequests: number
  codeSearchTokensSaved: number
  /**
   * tokensSaved minus trimTokensSaved. trim_context measures savings against
   * candidate files the agent chose to evaluate, not files that were
   * necessarily about to enter context, so it has no real session baseline
   * to compare against — excluded here, used as the numerator for
   * tokensBefore/savingsPercent instead of tokensSaved. Still shown on its
   * own in the breakdown.
   */
  realtimeTokensSaved: number
  /** Actual input + output/reasoning tokens sent to/from the model across the session (from message.updated events) — already reduced by ctxlite, not a hypothetical. */
  sessionTokensUsed: number
  /** Completed assistant turns with provider usage logged (source = session). */
  sessionTurnCount: number
  /** Tokens that would have flowed through without ctxlite: realtimeTokensSaved + sessionTokensUsed. */
  tokensBefore: number
  /** realtimeTokensSaved / tokensBefore * 100 — savings relative to total session traffic, not just the subset ctxlite touched, and not inflated by trim_context's speculative accounting. */
  savingsPercent: number
  costSaved: number
  avgLatencyMs: number
  period: string
}

export interface CacheStats {
  totalEntries: number
  sizeBytes: number
  oldestEntry: Date | null
}
