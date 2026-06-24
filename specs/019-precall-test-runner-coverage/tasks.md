---

description: "Task list for precall vitest/jest/eslint quiet-flag coverage"
---

# Tasks: Precall Quiet-Flag Coverage for Direct Test-Runner/Linter Invocations

**Input**: Design documents from `/specs/019-precall-test-runner-coverage/`

**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: MANDATORY for this repository (Constitution Principle II — Test-First, Zero Skipped Tests). Every implementation task below has a preceding test task, written and passing before the task is marked done.

**Organization**: Tasks are grouped by user story (US1 = P1 vitest/jest, US2 = P2 eslint, per spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

## Phase 1: Setup

**Purpose**: No new dependencies, no scaffolding — this is three new branches in an existing, already-tested function in one existing file.

- [ ] T001 Confirm the current `matchQuietPattern` if/else chain in `packages/core/src/tool-precall.ts` ends with the `curl` branch (sanity check the insertion point described in plan.md/research.md Decision 2 is still accurate) — no file changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None needed — both user stories add independent `else if` branches to the same existing function and existing `PRECALL_ESTIMATES` map; there is no shared new module to build first.

**Checkpoint**: N/A — proceed directly to User Story 1.

---

## Phase 3: User Story 1 - Direct `vitest`/`jest` invocations get quieted (Priority: P1) 🎯 MVP

**Goal**: `optimizeBashCommand` appends `--reporter=dot` to direct `vitest`/`npx vitest` invocations (excluding `watch` mode) and `--silent` to direct `jest`/`npx jest` invocations, matching the existing rewrite/idempotency/segment-aware-chain behavior every other rule already has.

**Independent Test**: `optimizeBashCommand("npx vitest run")` → `modified: true`, command contains `--reporter=dot`. `optimizeBashCommand("npx jest src/")` → `modified: true`, command contains `--silent`.

### Tests for User Story 1 (MANDATORY — Constitution Principle II) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [ ] T002 [P] [US1] Add cases to `packages/core/src/tool-precall.test.ts`'s existing `describe("optimizeBashCommand", ...)` block: bare `vitest` and `npx vitest run` both get `--reporter=dot` appended (`modified: true`, `estimatedTokensSaved > 0`); `vitest --reporter=dot` (already has the flag) and `vitest -r dot` (short-flag form) are both no-ops (`modified: false`); `vitest watch` and `vitest --watch` are NOT rewritten (`modified: false`) per the Edge Cases/research.md Decision 1 exclusion; a chained command `cd packages/core && npx vitest run | tail -20` rewrites only the `vitest` segment, leaving `cd packages/core` and `tail -20` untouched (mirroring the existing `npm run build 2>&1 | tail -20` regression test already in this file).
- [ ] T003 [P] [US1] Add cases to the same `describe` block for jest: bare `jest` and `npx jest src/` both get `--silent` appended; `jest --silent` (already quiet) is a no-op; a tool name inside a quoted string (e.g. `git commit -m "fix jest config"`) is NOT rewritten (reusing the existing `stripEmbeddedText` regression-test pattern already in this file for `npm install`).

### Implementation for User Story 1

- [ ] T004 [US1] In `packages/core/src/tool-precall.ts`, add a `vitest_run: 600` entry and a `jest_test: 600` entry to `PRECALL_ESTIMATES` (matching the existing `cargo_test: 600`/`pytest: 500`-style magnitude for a test-runner rule).
- [ ] T005 [US1] In `matchQuietPattern`, add an `else if` branch after the `curl` branch: `/\bvitest\b/.test(segmentSkeleton) && !/\bwatch\b/.test(segmentSkeleton) && !hasFlag(segment, ["--reporter", "-r "])` → `appendFlag(segment, "--reporter=dot")`, `label = "vitest_run"`. Depends on T002 (test must exist and fail first) and T004.
- [ ] T006 [US1] In `matchQuietPattern`, add an `else if` branch immediately after: `/\bjest\b/.test(segmentSkeleton) && !hasFlag(segment, ["--silent"])` → `appendFlag(segment, "--silent")`, `label = "jest_test"`. Depends on T003 and T004.

**Checkpoint**: User Story 1 fully functional and testable independently — `npx vitest run`/`npx jest` get quieted on every host, `npm test`/`cargo test`/etc. remain unaffected.

---

## Phase 4: User Story 2 - Direct `eslint` invocations get quieted (Priority: P2)

**Goal**: `optimizeBashCommand` appends `--quiet` to direct `eslint`/`npx eslint` invocations.

**Independent Test**: `optimizeBashCommand("eslint packages/*/src/**/*.ts")` → `modified: true`, command contains `--quiet`.

### Tests for User Story 2 (MANDATORY — Constitution Principle II) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [ ] T007 [P] [US2] Add cases to the same `describe("optimizeBashCommand", ...)` block: `eslint .` and `npx eslint packages/*/src/**/*.ts` (this repo's own `npm run lint` script string) both get `--quiet` appended; `npx eslint --quiet .` (already quiet) is a no-op.

### Implementation for User Story 2

- [ ] T008 [US2] In `packages/core/src/tool-precall.ts`, add an `eslint_lint: 400` entry to `PRECALL_ESTIMATES` (matching the existing `npm_build: 400`-style magnitude for a lint/build-adjacent rule).
- [ ] T009 [US2] In `matchQuietPattern`, add an `else if` branch immediately after the jest branch: `/\beslint\b/.test(segmentSkeleton) && !hasFlag(segment, ["--quiet"])` → `appendFlag(segment, "--quiet")`, `label = "eslint_lint"`. Depends on T007 and T008.

**Checkpoint**: Both user stories independently functional — `vitest`/`jest`/`eslint` direct invocations are all quieted, with zero change to any of the 17 pre-existing rules.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T010 Run the full existing `tool-precall.test.ts` suite and confirm every pre-existing test case (all 17 prior rules) still passes unmodified — this is the literal verification of SC-002.
- [ ] T011 Run `npm run test:coverage` and confirm `packages/core` stays at/above the 90% floor (Constitution Principle II) — `tool-precall.ts` was already well-covered before this change; three new branches with paired tests should not regress it.
- [ ] T012 Run `./scripts/ci.sh` (full local CI) before considering this feature done.
- [ ] T013 Version bump: confirm current live versions via `npm view @ctxlite/core version` (and the other 3 packages) before bumping `config.version`, per the constitution's Release Discipline constraint — do not assume the last-known bumped value (0.1.30) is still unpublished.
- [ ] T014 Add a CHANGELOG.md entry under the new version describing the three new quiet-flag rules and citing this spec.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: N/A — skipped, nothing shared to build.
- **User Story 1 (Phase 3)**: Depends on Setup only. No dependency on US2.
- **User Story 2 (Phase 4)**: Depends on Setup only. No dependency on US1 — could be implemented first or in parallel, though P1 ordering is recommended since it's the higher-priority, more-validated gap.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Parallel Opportunities

- T002 [P], T003 [P] (US1 vitest/jest tests) and T007 [P] (US2 eslint tests) can all be written in parallel — different assertions in the same file but no dependency between them, only on Setup.
- T004 (PRECALL_ESTIMATES entries for US1) and T008 (PRECALL_ESTIMATES entry for US2) touch the same object literal — sequence these two specifically (not marked [P]) to avoid a merge conflict on the same lines if worked on simultaneously by different people; trivial to resolve either way since it's just two more map entries.

---

## Parallel Example: User Story 1 + User Story 2 tests

```bash
# After Setup completes, tests for both stories can be written in parallel:
Task: "Add vitest cases to tool-precall.test.ts (T002)"
Task: "Add jest cases to tool-precall.test.ts (T003)"
Task: "Add eslint cases to tool-precall.test.ts (T007)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (trivial sanity check).
2. Complete Phase 3: User Story 1 (vitest + jest).
3. **STOP and VALIDATE**: confirm `optimizeBashCommand("npx vitest run")` and `optimizeBashCommand("npx jest")` both rewrite correctly and the full existing test suite still passes.
4. This alone closes the most concretely validated gap from spec.md (the `npx vitest run`-dominated session pattern) — User Story 2 (eslint) is the lower-priority, smaller-win addition.

### Incremental Delivery

1. Setup → trivial, immediate.
2. Add User Story 1 (vitest, jest) → validate independently → MVP.
3. Add User Story 2 (eslint) → validate independently → full feature complete.
4. Polish (full suite, coverage, CI, version bump, CHANGELOG).

---

## Notes

- [P] tasks touch different assertions in the same test file with no dependency between them — file-level conflicts are trivial to resolve (appending more `it()` blocks), so [P] is still appropriate here per the project's existing convention of marking same-file-different-assertion test additions as parallelizable.
- Every implementation task has a preceding, explicitly-required test task — Constitution Principle II permits no exceptions.
- No task touches any host's hook bridge (`hook.ts`, `cursor-hook.ts`, `tool-precall-hook.ts`) — per plan.md's Cross-tool availability answer, this change is automatically available on every host the moment `@ctxlite/core` ships it, since all three already call `optimizeBashCommand` through the shared `optimizeToolArgs` dispatcher.
