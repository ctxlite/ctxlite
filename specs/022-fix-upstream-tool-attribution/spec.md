# Feature Specification: Fix `upstream` to Carry the Real Tool Name on Claude Code/Cursor

**Feature Branch**: `022-fix-upstream-tool-attribution`

**Created**: 2026-06-25

**Status**: Draft

**Input**: User description: a pasted `ctxlite stats --by-session claude-code` output showing three sessions where, within each session, almost exactly one of `precall`/`compress` accounts for ~100% of activity (100/100, 0/21, 76/77) and asking "don't you think it's really suspicious that just one tool is used?"

## Investigation Findings (pre-spec research, not a placeholder)

Two genuinely different questions are bundled in "is this suspicious," with two different answers — verified against the actual code, not assumed:

1. **The precall/compress skew itself is NOT a bug — it's mathematically explained by precall's own threshold constants, confirmed by reading the actual source.** `compressToolOutput` (`packages/core/src/tool-output-compress.ts`) only compresses output ≥128 tokens (`minTokens` default) with compressible content beyond that. `optimizeBashCommand`'s quiet flags (`--silent`, `-q`, `--reporter=dot`, etc.) exist specifically to suppress the kind of verbose output that would otherwise need compressing — a successfully-quieted `npm test --silent`/`vitest --reporter=dot` typically produces a short pass/fail summary, often well under 128 tokens. So for a session dominated by bash test/build commands (like `3126580c`, `b0dcad10` — both heavy precall, near-zero compress), precall's quieting *removes the need* for compress on those same calls before compress ever gets a chance to act — they aren't competing for the same events, one is largely preempting the other for bash calls specifically. A session with no bash commands at all (like `da38d086` — zero precall, since precall's only two categories are bash-quiet-flags and blocked-reads) naturally shows zero precall and all-compress, because precall had no opportunity, not because it's broken. This is the same architecture already documented in `specs/019-precall-test-runner-coverage/spec.md` Investigation Finding #5 — this new data is consistent with, not contradictory to, that prior finding.
2. **The deeper, real, fixable problem: there's no way to *verify* point 1 independently, because `upstream` — the column that should answer "which actual tool (bash/read/grep/edit) produced this savings" — is broken for two of the three hosts.** Grepped every `logOptimizationSavings`/`logTrimResult` call site in the codebase: OpenCode's `tool-precall-hook.ts`/`tool-compress-hook.ts` correctly set `upstream: input.tool` (the real tool name — `"bash"`, `"read"`, `"edit"`, etc.). Claude Code's `hook.ts` and Cursor's `cursor-hook.ts`, however, hardcode `upstream` to the **host name** (`"claude-code"`, `"cursor"`) on every single row — discarding the actual tool name they already have in scope (the `tool`/`toolName` variable used two lines earlier to call `optimizeToolArgs`) and duplicating information the separate `host` column already carries. This means the data needed to answer "was this session bash-heavy or read-heavy" was never captured for Claude Code/Cursor — not because it's unknowable, but because two of three hosts throw it away. (`estimateCost(tokensSaved, upstream)` confirms this is safe to fix: its `PRICE_PER_MILLION` lookup table keys are provider names like `"anthropic"`/`"openai"`, not host or tool names — `"claude-code"`/`"cursor"` already miss every key and fall through to the same `default` price a real tool name like `"bash"` would also fall through to, so correcting `upstream` changes zero cost-calculation behavior.)
3. **A secondary, honest observation worth surfacing, not fixing**: `precall`'s `tokensSaved` figures are fixed *heuristic estimates* per matched rule (e.g. every `vitest_run` match always logs exactly 600 "tokens saved," per `PRECALL_ESTIMATES` — already labeled "Heuristic tokens prevented... (conservative)" in `tool-precall.ts`'s own existing comment), while `compress`'s figures are *real, measured* before/after differences. This asymmetry is a known, deliberate, pre-existing design choice (not introduced or changed by this spec), but it's worth stating plainly here since it's part of why precall's numbers can look suspiciously "round" compared to compress's organic-looking ones — that's a property of the estimate, not evidence of a bug.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - `upstream` reflects the real tool that produced each Claude Code/Cursor savings row (Priority: P1)

A user (or a future investigation, human or AI) inspecting raw `ctxlite stats` data for a Claude Code or Cursor session can tell which underlying tool (bash, read, edit, grep, etc.) each `precall`/`compress` row came from, the same way they already can for OpenCode rows — without needing to re-investigate the source code every time the question "why does one category dominate this session" comes up.

**Why this priority**: This is the one concretely fixable, low-risk gap underlying the user's repeated "is this suspicious" question — fixing it doesn't resolve every future instance of the question by itself, but it gives anyone (including a future AI investigation) the data to answer it directly instead of re-deriving it from source code each time.

**Independent Test**: Run a Claude Code `Bash` tool call through `runPreToolUseHook` with a noisy `npm test`; confirm the logged row's `upstream` value is `"bash"`, not `"claude-code"`. Run a `Read` tool call that gets blocked; confirm `upstream` is `"read"`. Repeat for Cursor's `Shell`/`Read` equivalents (normalized the same way `optimizeToolArgs` already normalizes them).

**Acceptance Scenarios**:

1. **Given** a Claude Code `Bash` tool call that gets a quiet flag added, **When** `runPreToolUseHook` logs the `precall` row, **Then** `upstream` is the lowercased real tool name (`"bash"`) instead of `"claude-code"`.
2. **Given** a Claude Code tool call whose output gets compressed, **When** `runPostToolUseHook` logs the `compress` row, **Then** `upstream` is the lowercased real tool name (matching whatever `tool_name` the event carried, e.g. `"read"`, `"grep"`), not `"claude-code"`.
3. **Given** a Cursor `Shell` tool call, **When** `runCursorPreToolUseHook` logs a `precall` row, **Then** `upstream` is the same normalized name `optimizeToolArgs` itself uses (`"bash"`, via the existing `normalizeToolName` mapping), not `"cursor"`.
4. **Given** the fix above, **When** `estimateCost` runs against any of these new `upstream` values, **Then** the computed cost is unchanged from before the fix (both old and new values miss every `PRICE_PER_MILLION` key and fall through to the same `default` price).
5. **Given** the fix above, **When** existing code that filters/groups by `host` (e.g. `ctxlite stats --by-session <host>` from `specs/020-stats-filter-by-host/`) runs, **Then** its behavior is completely unaffected — `host` is a separate column, untouched by this change.

### Edge Cases

- What happens for tool calls this project doesn't have a precall/compress rule for at all (e.g. `Task`, `WebFetch`)? → They still get logged (if `compress` triggers on their output) with their real tool name as `upstream` — this fix doesn't change *which* calls get logged, only what `upstream` says about calls that already do.
- What happens to historical rows logged before this fix ships? → Unchanged — old rows keep whatever `upstream` value they were written with (`"claude-code"`/`"cursor"`); this is a forward-only data-quality fix, not a backfill/migration (no schema change needed at all, since `upstream` already exists as a free-text column).
- Does this change what `ctxlite stats`'s existing text/JSON output displays? → No — no current `formatText`/`formatJson`/`renderStatsBarChart` code path groups or displays by `upstream` today; this fix only corrects what gets *written*, laying the groundwork for a future by-tool breakdown without itself adding one (explicitly out of scope, see below).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `packages/cli/src/hook.ts`'s `runPreToolUseHook` MUST log `upstream` as the lowercased real tool name (the same `tool` value already used to call `optimizeToolArgs`) instead of the hardcoded host string, for both the blocked and modified logging branches.
- **FR-002**: `packages/cli/src/hook.ts`'s `runPostToolUseHook` MUST log `upstream` as the lowercased real tool name from `tool_name`, instead of the hardcoded host string.
- **FR-003**: `packages/cli/src/cursor-hook.ts`'s `runCursorPreToolUseHook` MUST log `upstream` as the same normalized tool name `normalizeToolName` already produces for `optimizeToolArgs`, instead of the hardcoded host string, for both the blocked and modified logging branches.
- **FR-004**: This fix MUST NOT change the `host` column's value at all — `host` continues to carry `"claude-code"`/`"cursor"` exactly as today; only `upstream` changes.
- **FR-005**: This fix MUST NOT change `estimateCost`'s computed output for any existing or new `upstream` value (verified directly against `PRICE_PER_MILLION`'s actual keys in Investigation Finding #2 — neither the old nor new values are real price keys).
- **FR-006 (explicitly out of scope)**: This spec does NOT add a by-tool breakdown to `ctxlite stats`'s display output (text/JSON/`--by-session`) — it only corrects the data being written so such a breakdown becomes *possible* in a future spec, consistent with this project's pattern of shipping one validated, narrowly-scoped fix at a time rather than building speculative display features ahead of a concrete request for them. It also does NOT change OpenCode's already-correct `upstream` logging, and does NOT attempt to make Cursor's cost estimation provider-aware (a separate, harder problem — Cursor's hook payload doesn't expose which underlying model/provider is active, so `estimateCost` already always falls through to the `default` Anthropic price for Cursor regardless of the user's actual model choice; unrelated to this fix and not newly introduced by it).

### Key Entities

N/A — no new data entities or schema changes; this corrects the value written into an existing column (`upstream` on the `requests` table) at three existing call sites.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Claude Code `Bash` precall row's `upstream` matches the real tool name, verifiable directly from a fresh logged row without reading source code.
- **SC-002**: A Cursor precall row's `upstream` matches the real, normalized tool name, same verification.
- **SC-003**: Existing behavior is unchanged for everything this fix doesn't touch — confirmed by the full existing test suite (hook.ts/cursor-hook.ts/stats.ts tests) continuing to pass, with cost-related assertions specifically unchanged (SC verifies FR-005 directly, not just by absence of test failures).

## Assumptions

- "Real tool name" means the same string `optimizeToolArgs`/`compressOutputForTool` already operate on (lowercased `"bash"`/`"read"`/`"glob"`/etc. for Claude Code; cursor's `normalizeToolName`-mapped equivalent for Cursor) — not a new naming scheme invented for this fix, so it stays consistent with what OpenCode's bridge already logs for the same concept.
- No new dependency, no schema migration — `upstream` is already a plain `string` column (per `packages/core/src/types.ts`'s `OptimizationLog` interface) accepting any value; this changes what value three call sites pass into it, nothing structural.
- This spec does not attempt to fix or backfill any historical row — `ctxlite stats`'s totals already only read whatever was logged, and this is consistent with how every prior bug fix in this project (e.g. the missing-LICENSE/README npm packaging gaps) was handled going forward only, not retroactively.
