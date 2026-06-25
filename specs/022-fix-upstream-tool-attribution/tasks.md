---

description: "Task list for fixing upstream tool attribution on Claude Code/Cursor"
---

# Tasks: Fix `upstream` to Carry the Real Tool Name on Claude Code/Cursor

**Input**: Design documents from `/specs/022-fix-upstream-tool-attribution/`

**Prerequisites**: plan.md (required), spec.md (required)

**Tests**: MANDATORY for this repository (Constitution Principle II — Test-First, Zero Skipped Tests). Every implementation task below has a preceding test task, written and passing before the task is marked done.

**Organization**: spec.md has a single user story (Priority: P1) covering both hosts together — one small, narrowly-scoped data-correctness fix, not independently-deliverable increments.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (the only user story)

## Phase 1: Setup

**Purpose**: Confirm the exact current hardcoded values haven't drifted since spec/plan were written.

- [X] T001 Confirm `packages/cli/src/hook.ts`'s `runPreToolUseHook` (both branches) and `runPostToolUseHook` still hardcode `upstream: "claude-code"`, and `packages/cli/src/cursor-hook.ts`'s `runCursorPreToolUseHook` (both branches) still hardcode `upstream: "cursor"` — no file changes yet.

---

## Phase 2: User Story 1 - `upstream` reflects the real tool on Claude Code/Cursor (Priority: P1) 🎯 MVP

**Goal**: All four `logOptimizationSavings` call sites across `hook.ts`/`cursor-hook.ts` log the real, normalized tool name as `upstream`, instead of the host name; `host` and `estimateCost` behavior stay byte-identical to today.

**Independent Test**: Run a `Bash` tool call with a noisy command through `runPreToolUseHook`; read the logged row back via `StatsStore`; confirm `upstream === "bash"` and `host === "claude-code"` (unchanged).

### Tests for User Story 1 (MANDATORY — Constitution Principle II) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [X] T002 [P] [US1] In `packages/cli/src/hook.test.ts`, add cases (using the existing `StatsStore`/temp-`homedir()` pattern already in this file): after `runPreToolUseHook` rewrites a noisy `Bash` command, read the logged row back via `StatsStore` and assert `upstream === "bash"` (not `"claude-code"`) and `host === "claude-code"` (unchanged, regression check for FR-004); after it blocks a `Read` call (e.g. `node_modules/...`), assert the logged row's `upstream === "read"`; after `runPostToolUseHook` compresses a large tool output for a `Grep`-style call, assert the logged row's `upstream === "grep"`.
- [X] T003 [P] [US1] In `packages/cli/src/cursor-hook.test.ts`, add cases: after `runCursorPreToolUseHook` rewrites a noisy `Shell` command, assert the logged row's `upstream === "bash"` (via the same `normalizeToolName` mapping `optimizeToolArgs` already uses) and `host === "cursor"` (unchanged); after it blocks a `Read` call, assert `upstream === "read"`.

### Implementation for User Story 1

- [X] T004 [US1] In `packages/cli/src/hook.ts`'s `runPreToolUseHook`, change `upstream: "claude-code"` to `upstream: tool` in both the `result.blocked` and `result.modified` `logOptimizationSavings` calls (`tool` is already the lowercased tool name computed earlier in the function for the `optimizeToolArgs` call — reuse it, do not recompute). Depends on T002.
- [X] T005 [US1] In `packages/cli/src/hook.ts`'s `runPostToolUseHook`, change `upstream: "claude-code"` to `upstream: (input.tool_name ?? "").toLowerCase()` in its `logOptimizationSavings` call, matching the lowercase convention `runPreToolUseHook`'s `tool` variable already uses. Depends on T002.
- [X] T006 [US1] In `packages/cli/src/cursor-hook.ts`'s `runCursorPreToolUseHook`, change `upstream: "cursor"` to `upstream: normalizeToolName(toolName)` in both the `result.blocked` and `result.modified` `logOptimizationSavings` calls (reuse the same normalized value already computed for the `optimizeToolArgs` call, do not recompute). Depends on T003.

**Checkpoint**: User Story 1 fully functional and independently testable — every Claude Code/Cursor `precall`/`compress` row now carries the real tool name in `upstream`; `host` and cost calculations are unchanged.

---

## Phase 3: Polish & Cross-Cutting Concerns

- [X] T007 Run the full existing `hook.test.ts`/`cursor-hook.test.ts` (and the rest of the monorepo's test suite) and confirm every pre-existing test case passes unmodified — the literal verification that `host`/stdin/stdout behavior is untouched.
- [X] T008 Run `npm run test:coverage` and confirm `packages/cli` stays at/above the 90% floor (Constitution Principle II).
- [X] T009 Run `./scripts/ci.sh` (full local CI) before considering this feature done.
- [X] T010 Version bump: confirm current live versions via `npm view @ctxlite/core version` (and the other 3 packages) before bumping `config.version`, per the constitution's Release Discipline constraint — do not assume the last-known bumped value (0.1.33) is still unpublished.
- [X] T011 Add a CHANGELOG.md entry under the new version describing the `upstream` fix, citing this spec and explaining what it does and doesn't resolve (the precall/compress skew itself was already explained as not-a-bug; this fix only makes that explanation independently verifiable going forward).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **User Story 1 (Phase 2)**: Depends on Setup. The only story — no cross-story dependencies.
- **Polish (Phase 3)**: Depends on User Story 1 being complete.

### Parallel Opportunities

- T002 [P], T003 [P] (tests in two different files) can be written in parallel.
- T004/T005 (both in `hook.ts`) are sequential within the same file; T006 (`cursor-hook.ts`) is a different file and could run in parallel with T004/T005 if staffed separately, though for one person doing all of US1 the distinction doesn't matter much given the total size of this change.

---

## Parallel Example: User Story 1 tests

```bash
# Can run in parallel:
Task: "Add upstream/host assertions to hook.test.ts (T002)"
Task: "Add upstream/host assertions to cursor-hook.test.ts (T003)"
```

---

## Implementation Strategy

### MVP First (and Only)

1. Complete Phase 1 (trivial sanity check).
2. Complete Phase 2: User Story 1 — both hosts, since it's one small fix shipped together.
3. **STOP and VALIDATE**: confirm a fresh logged row for each host shows the real tool name in `upstream`, with `host` and cost calculations unchanged.
4. Polish (full suite, coverage, CI, version bump, CHANGELOG).

### Incremental Delivery

Not applicable beyond the above — this is a single small, atomic fix; splitting it further would add overhead without benefit.

---

## Notes

- [P] tasks touch different files with no dependency between them.
- Every implementation task has a preceding, explicitly-required test task — Constitution Principle II permits no exceptions, even for a fix this small.
- No task changes `host`, the hook's stdin/stdout contract, or `estimateCost`'s table — all three are explicitly verified unchanged, not just assumed, per plan.md's Risk analysis.
