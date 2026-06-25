# Implementation Plan: Fix `upstream` to Carry the Real Tool Name on Claude Code/Cursor

**Branch**: `main` (no dedicated feature branch — no branch-creation hook registered, consistent with `017`–`021`) | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-fix-upstream-tool-attribution/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Fix three `logOptimizationSavings` call sites — two in `packages/cli/src/hook.ts` (Claude Code's `runPreToolUseHook`/`runPostToolUseHook`) and two in `packages/cli/src/cursor-hook.ts` (Cursor's `runCursorPreToolUseHook`) — to log `upstream` as the real, normalized tool name (already computed and in scope at each call site) instead of the hardcoded host string. No schema change, no new call sites, no behavior change to anything this spec didn't identify as broken.

## Technical Context

**Language/Version**: TypeScript (Node 18+ ESM), matching the rest of `@ctxlite/cli`.

**Primary Dependencies**: None new — this changes one field's value at four existing call sites in two existing files.

**Storage**: SQLite (`~/.ctxlite/stats.db`) — `upstream` is an existing, already-untyped `string` column (`OptimizationLog.upstream` in `packages/core/src/types.ts`); no migration needed since the column already accepts arbitrary strings.

**Testing**: Vitest, the existing convention in `hook.test.ts`/`cursor-hook.test.ts` (real temp-dir `homedir()` mocking, dynamic import after the mock, per `ctxlite-internals`). New cases assert on the logged row's `upstream` value via a `StatsStore` read, the same pattern those files already use for `host`/`sessionId` assertions.

**Target Platform**: Node — same as the rest of `packages/cli`'s hook bridges.

**Project Type**: Library/CLI bugfix within the existing monorepo — `@ctxlite/cli`'s two hook-bridge modules.

**Performance Goals**: None — zero added cost, this changes a string literal to a variable reference at four call sites.

**Constraints**: Must not change the `host` value (FR-004) or `estimateCost`'s computed output (FR-005) for any existing or new `upstream` value — both verified directly in spec.md's Investigation Finding #2 against `PRICE_PER_MILLION`'s real keys.

**Scale/Scope**: 4 one-line changes (2 in `hook.ts`, 2 in `cursor-hook.ts`), new test cases in both existing test files, no new files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Benefit** — What does this change achieve, measurably or directly
observably, and for whom?
Anyone (a user, or a future investigation) inspecting `ctxlite`'s own logged data for a Claude Code or Cursor session can now see which real tool (`bash`, `read`, `edit`, etc.) produced each `precall`/`compress` row — directly closes the data gap that made the user's "is one category suspiciously dominant" question unverifiable from the data alone, requiring a fresh source-code investigation each time instead.

**Risk** — What's the specific, most-likely-to-break thing? Which existing
behavior/test/host integration is in the blast radius?
The most-likely-to-break thing would be accidentally changing `host` instead of (or in addition to) `upstream`, or accidentally affecting `estimateCost`'s output — both explicitly ruled out: `host` is a separate field at a separate object key, untouched by this change (verified by inspecting every call site directly — `host` and `upstream` are distinct properties in the same `logOptimizationSavings` call, easy to tell apart, low risk of conflation); `estimateCost`'s `PRICE_PER_MILLION` table keys are providers (`"anthropic"`, `"openai"`, etc.), and neither the old (`"claude-code"`/`"cursor"`) nor new (`"bash"`/`"read"`/etc.) `upstream` values match any of those keys — both fall through to the same `default` price, confirmed by reading `tokens.ts` directly, not assumed. Existing tests in `hook.test.ts`/`cursor-hook.test.ts` don't currently assert on `upstream` at all (confirmed by grep), so there's no existing assertion to break — this is a purely additive test change.

**Validation** — How was/will this be verified? Name the actual test(s)
or the actual live host check performed (not just "typecheck and test
pass").
New cases in `packages/cli/src/hook.test.ts`: a `Bash` tool call that gets quieted logs a row whose `upstream` (read back via `StatsStore`) is `"bash"`; a blocked `Read` call logs `upstream: "read"`; a compressed tool output logs `upstream` matching its `tool_name`. New cases in `packages/cli/src/cursor-hook.test.ts`: a `Shell` tool call logs `upstream: "bash"` (via the same `normalizeToolName` mapping `optimizeToolArgs` already uses) for both the blocked and modified branches. A regression case in each file confirms `host` is still `"claude-code"`/`"cursor"` exactly as before (FR-004), read from the same logged row. No live host check needed — this is a pure data-logging correction with no change to the hook's external stdin/stdout contract (the JSON Claude Code/Cursor see is completely unaffected; only what gets written to ctxlite's own local stats DB changes).

**Cross-tool availability** — Does this apply uniformly across every host
ctxlite supports (OpenCode, Claude Code, Cursor, Claude Desktop where
relevant)? If not, is the asymmetry a documented platform constraint or an
oversight to track as a follow-up task?
OpenCode already logs `upstream` correctly (`input.tool`, confirmed in spec.md's Investigation Finding #2) — not touched by this change since it isn't broken. Claude Code and Cursor are exactly the two hosts this fix targets. Claude Desktop has no hook/plugin API at all (only MCP — `get_stats`/`trim_context`/`smart_read`, which already correctly use `upstream: "mcp"` for the mechanism itself, not a sub-tool breakdown, since MCP tool calls don't have an "underlying tool" the way a hook-intercepted Bash/Read call does) — no asymmetry introduced, this fix reaches every host that has the kind of `upstream` bug it's fixing.

*Gate result: PASS. No violations to justify.*

## Project Structure

### Documentation (this feature)

```text
specs/022-fix-upstream-tool-attribution/
├── plan.md              # This file
├── spec.md              # Already written (includes Investigation Findings)
├── checklists/
│   └── requirements.md  # Already written, all items pass
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

No `research.md` (no `[NEEDS CLARIFICATION]` markers and no remaining technical unknowns — every fact this fix depends on was already verified directly against source code in spec.md's Investigation Findings; there is nothing left to research in a separate Phase 0 step), no `data-model.md` (no entities, no schema change), no `contracts/` (no new interface — the fix doesn't change the hook's stdin/stdout JSON contract at all, only an internal logging call), no `quickstart.md` (spec.md's Acceptance Scenarios already give exact, runnable before/after checks).

### Source Code (repository root)

```text
packages/cli/src/
├── hook.ts             # MODIFIED — upstream: "claude-code" → upstream: tool (2 call sites: blocked + modified, runPreToolUseHook) and → upstream: tool_name.toLowerCase() (runPostToolUseHook)
├── hook.test.ts        # MODIFIED — new cases asserting upstream/host on logged rows
├── cursor-hook.ts      # MODIFIED — upstream: "cursor" → upstream: normalizeToolName(toolName) (2 call sites: blocked + modified, runCursorPreToolUseHook)
└── cursor-hook.test.ts # MODIFIED — new cases asserting upstream/host on logged rows
```

**Structure Decision**: All changes live in the two existing hook-bridge modules that already own this logging — no new module, no new exports, no change to `@ctxlite/core`'s `logOptimizationSavings` signature (it already accepts any `upstream` string; only the *value* passed at the call site changes).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally left empty.
