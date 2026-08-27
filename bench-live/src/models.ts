/**
 * Free-tier model configuration for the live benchmark harness (spec 026,
 * research.md §5). Kept as a small, swappable list — not a spec-level
 * commitment to a specific vendor — since free-tier availability changes
 * over time. Run `opencode models` to see what's currently available
 * through the authenticated OpenCode account; anything ending in `-free`,
 * plus `opencode/big-pickle`, are OpenCode's no-cost tier as of this
 * writing.
 */
export const DEFAULT_MODEL = "opencode/big-pickle"

export const FREE_TIER_MODELS = [
  "opencode/big-pickle",
  "opencode/nemotron-3-ultra-free",
  "opencode/nemotron-3.5-lightning-free",
] as const

export function resolveModel(override?: string): string {
  return override ?? DEFAULT_MODEL
}
