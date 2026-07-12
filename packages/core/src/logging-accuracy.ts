import { estimateTokens } from "./tokens.js"

export const LOGGING_ACCURACY_TOLERANCE = 0.1

/**
 * Compare logged savings to an independent before/after token count.
 * Returns relative delta (0 = exact, 0.1 = 10% off).
 */
export function verifyLoggingAccuracy(logged: number, before: string, after: string): number {
  const independent = Math.max(0, estimateTokens(before) - estimateTokens(after))
  if (independent === 0) {
    return logged === 0 ? 0 : 1
  }
  return Math.abs(logged - independent) / independent
}

export function isLoggingAccurate(logged: number, before: string, after: string, tolerance = LOGGING_ACCURACY_TOLERANCE): boolean {
  return verifyLoggingAccuracy(logged, before, after) <= tolerance
}
