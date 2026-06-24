# Implementation Plan: Filter `ctxlite stats` by Host

**Branch**: `main` (no dedicated feature branch — no branch-creation hook registered, consistent with `017`/`018`/`019`) | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-stats-filter-by-host/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add an optional `host` parameter to `StatsStore.summary()` and `StatsStore.sessionBreakdown()` (`packages/core/src/stats.ts`), and parse an optional positional host token in the CLI's `stats` subcommand (`packages/cli/src/stats-command.ts`), validated against the four real host values (`opencode`, `claude-code`, `cursor`, `mcp`). Closes the gap confirmed in spec.md's Investigation Findings: today a host token after `stats` is silently dropped by `parseArgs`, and neither query method can filter by host at all.

## Technical Context

**Language/Version**: TypeScript (Node 18+ ESM), matching the rest of `@ctxlite/core`/`@ctxlite/cli`.

**Primary Dependencies**: None new — one additional optional SQL filter clause (parameterized, no string interpolation of user input) in two existing methods, plus argument-parsing additions in the existing `parseArgs` function.

**Storage**: SQLite (`better-sqlite3`/`bun:sqlite`/`node:sqlite` via the existing `StatsSqlite` interface) — `host` is an existing, already-indexed column (`idx_requests_session ON requests(host, session_id)`), so no schema or migration change.

**Testing**: Vitest. Pure unit tests against `StatsStore.summary()`/`sessionBreakdown()` with a real temp-file SQLite DB (existing convention in `stats.test.ts`/`stats-command.test.ts` — real temp dirs, not filesystem mocks), plus CLI argument-parsing tests in `stats-command.test.ts`'s existing `describe("parseArgs", ...)` block.

**Target Platform**: Same as the rest of `@ctxlite/core`/`@ctxlite/cli` — Node (CLI) and Bun (OpenCode plugin reads the same DB format, though this specific feature is CLI-only per spec.md's scope).

**Project Type**: CLI feature within the existing monorepo — `@ctxlite/core` (query layer) consumed by `@ctxlite/cli` (argument parsing + display).

**Performance Goals**: Negligible — one more indexed equality filter on an already-indexed column.

**Constraints**: Must not change output for any existing invocation with no host argument (SC-002) — the host parameter is optional and defaults to "no filter" everywhere it's threaded.

**Scale/Scope**: ~10-20 new lines in `stats.ts` (two methods gain an optional param + one SQL clause each), ~15-25 new lines in `stats-command.ts` (positional host-token parsing + validation against the 4 known values), new test cases in the existing `stats.test.ts` and `stats-command.test.ts` (no new test files).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Benefit** — What does this change achieve, measurably or directly
observably, and for whom?
A user investigating per-host behavior (e.g. comparing how much OpenCode's precall saves versus Cursor's) can run `ctxlite stats opencode` or `ctxlite stats --by-session cursor` and get exactly that host's numbers, instead of manually cross-referencing `--by-session`'s full unfiltered list. Directly closes the gap the user hit while investigating the `019` precall finding — they wanted to look at one host's stats in isolation and the CLI silently couldn't do it.

**Risk** — What's the specific, most-likely-to-break thing? Which existing
behavior/test/host integration is in the blast radius?
The most-likely-to-break thing is the positional-argument parsing change in `parseArgs` accidentally swallowing or misinterpreting a token that isn't a host name (e.g. breaking the existing `install`/`hook` subcommand passthrough, which `parseArgs` already has dedicated handling for and existing regression tests covering). Mitigated by only treating a positional token as a host filter when `args.subcommand === "stats"` specifically (never touching `install`/`hook`'s own positional args) and only when the token matches one of the 4 known host strings case-insensitively — an unrecognized token is reported per FR-005, not silently absorbed as a no-op the way it is today. A second risk: the new SQL filter clause being built via string concatenation instead of parameterized — mitigated by following the exact existing pattern `summaryWithFilter`/`sessionBreakdown` already use (`?` placeholders, params array), never interpolating the host string directly into SQL.

**Validation** — How was/will this be verified? Name the actual test(s)
or the actual live host check performed (not just "typecheck and test
pass").
New cases in `packages/core/src/stats.test.ts`: `summary(since, "opencode")` returns totals matching only `opencode`-tagged rows in a real temp-file DB with multi-host data; `sessionBreakdown(since, "cursor")` returns only `cursor` rows. New cases in `packages/cli/src/stats-command.test.ts`'s `describe("parseArgs", ...)`: `ctxlite stats opencode` and `ctxlite stats --by-session opencode` (both token orders) both populate a new `host` field correctly; `ctxlite stats opncode` (typo) is captured as an unrecognized value rather than silently dropped. New `runStats` cases verifying the unknown-host case produces the clear message from FR-005, and that the existing `install`/`hook` subcommand passthrough tests still pass unmodified (the literal verification of "doesn't break unrelated positional-arg handling"). No live host check needed — pure CLI/query-layer change with no host-bridge-integration surface.

**Cross-tool availability** — Does this apply uniformly across every host
ctxlite supports (OpenCode, Claude Code, Cursor, Claude Desktop where
relevant)? If not, is the asymmetry a documented platform constraint or an
oversight to track as a follow-up task?
This is a CLI-only feature (`ctxlite stats`, run by a human, not by any host integration) — there's no per-host code path to keep in sync, since all four host values are just data already logged identically regardless of which host produced them. The feature works uniformly for inspecting any of the four hosts' data from the one shared CLI; no host is "left out" because this isn't a host-side feature at all.

*Gate result: PASS. No violations to justify.*

## Project Structure

### Documentation (this feature)

```text
specs/020-stats-filter-by-host/
├── plan.md              # This file
├── spec.md              # Already written (includes Investigation Findings)
├── research.md          # Phase 0 output (exact parsing/SQL decisions)
├── checklists/
│   └── requirements.md  # Already written, all items pass
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

No `data-model.md` (no new entities — `host` is an existing column on the existing `requests` table), no `contracts/` (the CLI syntax itself — `ctxlite stats <host>` / `ctxlite stats --by-session <host>` — is the interface, and spec.md's Acceptance Scenarios already document it precisely enough that a separate contracts file would only duplicate them), and no `quickstart.md` for the same reason already used in `018`/`019`.

### Source Code (repository root)

```text
packages/core/src/
├── stats.ts       # MODIFIED — summary(since, host?) and sessionBreakdown(since, host?) gain an optional host param
└── stats.test.ts  # MODIFIED — new cases for host-filtered summary/sessionBreakdown

packages/cli/src/
├── stats-command.ts       # MODIFIED — parseArgs captures an optional positional host token (validated against the 4 known values); runStats passes args.host through to summary()/sessionBreakdown()
└── stats-command.test.ts  # MODIFIED — new cases for host-token parsing and host-filtered runStats output
```

**Structure Decision**: Changes live in the two existing modules that already own this behavior — no new module, no new call sites elsewhere (`get_stats` MCP/OpenCode tools already call `summaryForSession`/`summary` directly and are unaffected, since this feature only extends the CLI's own `stats` subcommand per spec.md's scope).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally left empty.
