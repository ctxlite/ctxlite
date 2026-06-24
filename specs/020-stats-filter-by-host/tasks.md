---

description: "Task list for filtering ctxlite stats by host"
---

# Tasks: Filter `ctxlite stats` by Host

**Input**: Design documents from `/specs/020-stats-filter-by-host/`

**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: MANDATORY for this repository (Constitution Principle II — Test-First, Zero Skipped Tests). Every implementation task below has a preceding test task, written and passing before the task is marked done.

**Organization**: Tasks are grouped by user story (US1 = filter overall summary, US2 = filter by-session breakdown — both P1 per spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

## Phase 1: Setup

**Purpose**: No new dependencies, no scaffolding — confirm the exact current signatures this plan modifies haven't drifted.

- [ ] T001 Confirm `StatsStore.summary(since = 0)` and `StatsStore.sessionBreakdown(since = 0)` in `packages/core/src/stats.ts` still have no host parameter, and confirm `parseArgs` in `packages/cli/src/stats-command.ts` still silently drops an unrecognized positional token under `stats` (the exact gap described in spec.md's Investigation Findings) — no file changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared host-filtering capability (query layer) and shared host-token validation (CLI layer) both user stories build on. MUST complete before either story.

### Tests for Foundational work (MANDATORY — Constitution Principle II) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [ ] T002 [P] Add cases to `packages/core/src/stats.test.ts`: with a real temp-file DB containing rows logged under `opencode`, `cursor`, AND `claude-code`, `summary(0, "opencode")` returns totals (`totalRequests`, `tokensSaved`, per-category counts) matching only the `opencode` rows; `summary(0)` (no host arg) is unchanged from before this feature (regression check matching SC-002); `summary(0, "nonexistent-host")` returns the same zero-data shape `summary` already returns for an empty DB (not a crash).
- [ ] T003 [P] Add cases to the same file for `sessionBreakdown`: with the same multi-host fixture, `sessionBreakdown(0, "cursor")` returns only `cursor`-tagged session rows, in the same shape `sessionBreakdown` already returns; `sessionBreakdown(0)` (no host arg) is unchanged (regression check).
- [ ] T004 [P] Add cases to `packages/cli/src/stats-command.test.ts`'s existing `describe("parseArgs", ...)` block: `ctxlite stats opencode` sets `args.host` to `"opencode"`; `ctxlite stats --by-session opencode` and `ctxlite stats opencode --by-session` (both token orders) both set `args.host` to `"opencode"` AND `args.bySession` to `true`; `ctxlite stats OpenCode` (mixed case) also normalizes to `"opencode"`; `ctxlite stats opncode` (typo) sets `args.host` to the raw unrecognized string `"opncode"` (not silently dropped, not normalized — `runStats` decides what to do with it); `ctxlite stats` (no host) leaves `args.host` `undefined` (regression check); `ctxlite install --some-flag` and `ctxlite hook pre-tool-use` (both real existing positional-arg subcommands) are completely unaffected by this change (regression check that the new logic is scoped to `subcommand === "stats"` only).

### Implementation for Foundational work

- [ ] T005 [P] Implement the `host?: string` parameter on `StatsStore.summary(since = 0, host?: string)` in `packages/core/src/stats.ts`: when provided, append `AND host = ?` to the existing `filterSql` passed to `summaryWithFilter`, pushing `host` onto `filterParams` — parameterized, never string-interpolated. Depends on T002.
- [ ] T006 [P] Implement the `host?: string` parameter on `StatsStore.sessionBreakdown(since = 0, host?: string)` in the same file: when provided, append `AND host = ?` to the existing `WHERE` clause, with `host` added to the bound parameters. Depends on T003.
- [ ] T007 In `packages/cli/src/stats-command.ts`'s `Args` interface, add `host?: string`. In `parseArgs`, inside the existing per-token loop, when `args.subcommand === "stats"` and the current token is a non-flag positional token, set `args.host` to the token lowercased if it case-insensitively matches one of `["opencode", "claude-code", "cursor", "mcp"]`, otherwise set `args.host` to the raw token unmodified (so `runStats` can tell valid from invalid — research.md Decision 3). Depends on T004.

**Checkpoint**: `npm run test --workspace=packages/core` and the CLI's test suite both pass for the new Foundational cases. Both user stories can now proceed.

---

## Phase 3: User Story 1 - Filter the overall summary by host (Priority: P1) 🎯 MVP

**Goal**: `ctxlite stats opencode` (no `--by-session`) shows the aggregate summary filtered to just that host.

**Independent Test**: With multi-host data logged, run `ctxlite stats opencode`; confirm displayed totals match only `opencode` rows.

### Tests for User Story 1 (MANDATORY — Constitution Principle II) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [ ] T008 [P] [US1] Add cases to `packages/cli/src/stats-command.test.ts`'s existing `describe("runStats", ...)` block: `runStats` with `args.host = "opencode"` (and `args.bySession = false`) produces text output reflecting only `opencode`'s totals (using the same multi-host-fixture pattern the existing `--last` regression test already uses); the same with `--export json` produces JSON reflecting only that host's summary; `runStats` with `args.host` set to an unrecognized raw string (e.g. `"opncode"`) writes a clear stderr message naming the 4 valid host values and returns exit code `1`, without running any query.

### Implementation for User Story 1

- [ ] T009 [US1] In `runStats` (`packages/cli/src/stats-command.ts`), after the existing `--last`/`--export` validation blocks and before the `args.bySession` branch, add the shared host validation: if `args.host` is defined and is NOT one of the 4 known values, write the FR-005 stderr message and `return 1`. Depends on T008 and Phase 2 (T007).
- [ ] T010 [US1] In the non-`--by-session` branch of `runStats`, pass `args.host` through to `store.summary(since, args.host)`. Depends on T009 and Phase 2 (T005).

**Checkpoint**: User Story 1 fully functional and testable independently — `ctxlite stats opencode` works exactly as spec'd, `ctxlite stats` (no host) is unchanged.

---

## Phase 4: User Story 2 - Filter the by-session breakdown by host (Priority: P1)

**Goal**: `ctxlite stats --by-session opencode` shows the existing per-session breakdown narrowed to just that host's sessions.

**Independent Test**: With multi-host session data, run `ctxlite stats --by-session opencode`; confirm only `opencode` sessions appear.

### Tests for User Story 2 (MANDATORY — Constitution Principle II) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [ ] T011 [P] [US2] Add cases to the same `describe("runStats", ...)` block: `runStats` with `args.bySession = true` and `args.host = "cursor"` produces text output listing only `cursor` sessions, in the existing per-session detailed format; the same with `--export json` produces a JSON array containing only `cursor` session rows; the shared invalid-host handling from US1 (T009) also applies here — `--by-session` plus an unrecognized host still errors before querying, reusing the exact same check (no duplicate validation logic).

### Implementation for User Story 2

- [ ] T012 [US2] In the `--by-session` branch of `runStats`, pass `args.host` through to `store.sessionBreakdown(since, args.host)` (both the `--compact` and detailed/JSON code paths that already call `sessionBreakdown`/iterate its rows). Depends on T011, Phase 2 (T006), and T009 (the shared validation already added for US1).

**Checkpoint**: Both user stories independently functional — `ctxlite stats <host>` and `ctxlite stats --by-session <host>` both work, for all 4 real host values, with zero change to either command's no-host-argument form.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T013 Run the full existing `stats.test.ts` and `stats-command.test.ts` suites and confirm every pre-existing test case passes unmodified — the literal verification of SC-002.
- [ ] T014 Run `npm run test:coverage` and confirm `packages/core` and `packages/cli` stay at/above the 90% floor (Constitution Principle II).
- [ ] T015 Run `./scripts/ci.sh` (full local CI) before considering this feature done.
- [ ] T016 Update the CLI's `--help` text and usage examples in `packages/cli/src/index.ts` (the `ctxlite stats [options]`/examples block) to document the new positional host argument and the 4 valid values.
- [ ] T017 Version bump: confirm current live versions via `npm view @ctxlite/core version` (and the other 3 packages) before bumping `config.version`, per the constitution's Release Discipline constraint — do not assume the last-known bumped value (0.1.31) is still unpublished.
- [ ] T018 Add a CHANGELOG.md entry under the new version describing the host filter and citing this spec.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS both user stories — both need the query-layer host param (T005/T006) and the shared parsing (T007).
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on US2.
- **User Story 2 (Phase 4)**: Depends on Foundational AND on T009 (the shared invalid-host validation added while implementing US1) — this is the one cross-story dependency in this feature, called out explicitly rather than left implicit.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Parallel Opportunities

- T002 [P], T003 [P], T004 [P] (Foundational tests across 2 files) can be written in parallel.
- T005 [P], T006 [P] (the two `stats.ts` method changes) can be implemented in parallel — different methods, no shared lines.
- T008 (US1 tests) can be written in parallel with T011 (US2 tests) once Foundational is merged, though T012's implementation must wait for T009 specifically (see above).

---

## Parallel Example: Foundational phase

```bash
# Tests, in parallel:
Task: "Add host-filter cases to stats.test.ts for summary() (T002)"
Task: "Add host-filter cases to stats.test.ts for sessionBreakdown() (T003)"
Task: "Add host-token parsing cases to stats-command.test.ts (T004)"

# Implementation, in parallel (after the above fail red):
Task: "Add host param to summary() (T005)"
Task: "Add host param to sessionBreakdown() (T006)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (trivial) + Phase 2 (Foundational: query-layer host param + CLI parsing + shared validation).
2. Complete Phase 3: User Story 1 (`ctxlite stats <host>`).
3. **STOP and VALIDATE**: confirm `ctxlite stats opencode` filters correctly and `ctxlite stats` (no arg) is unchanged.
4. This alone delivers the simpler of the two explicitly-requested forms — User Story 2 (`--by-session <host>`) is equally P1 but builds on the same Foundational work, so it's a small increment on top, not a separate large effort.

### Incremental Delivery

1. Setup + Foundational → shared capability ready, fully unit-tested.
2. Add User Story 1 → validate independently → MVP.
3. Add User Story 2 → validate independently → full feature complete.
4. Polish (full suite, coverage, CI, help text, version bump, CHANGELOG).

---

## Notes

- [P] tasks touch different files or different methods within the same file with no dependency between them.
- Every implementation task has a preceding, explicitly-required test task — Constitution Principle II permits no exceptions.
- T009 (shared invalid-host validation) is implemented once, during US1, and reused as-is by US2 (T012) — documented explicitly as a cross-story dependency rather than duplicated, since spec.md's FR-005 describes one validation behavior that applies identically regardless of `--by-session`.
