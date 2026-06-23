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
  /** trim | concise | compress | prune | precall | cache | session */
  source?: "trim" | "concise" | "compress" | "prune" | "precall" | "cache" | "session"
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
  /** Actual input tokens sent to the model across the session (from message.updated events) — already reduced by ctxlite, not a hypothetical. */
  sessionTokensUsed: number
  /** Tokens that would have flowed through without ctxlite: tokensSaved + sessionTokensUsed. */
  tokensBefore: number
  /** tokensSaved / tokensBefore * 100 — savings relative to total session traffic, not just the subset ctxlite touched. */
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
