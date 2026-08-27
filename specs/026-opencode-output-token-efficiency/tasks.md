---

description: "Task list for OpenCode Output Token Efficiency"
---

# Tasks: OpenCode Output Token Efficiency

**Input**: Design documents from `/specs/026-opencode-output-token-efficiency/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: MANDATORY for this repository (Constitution Principle II — Test-First, Zero Skipped Tests). Every task below that changes behavior includes a test task, written and failing before implementation.

**Organization**: Tasks are grouped by user story (US1–US4, matching spec.md priorities P1, P1, P2, P3) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

## Path Conventions

Existing TypeScript npm workspace monorepo — `packages/core/src/`, `packages/opencode/src/`, `bench/` (existing, unmodified), `bench-live/` (new, sibling to `bench/`). See plan.md Project Structure.

---

## Phase 1: Setup

**Purpose**: Scaffold the new live-benchmark harness directory so User Story 3 has somewhere to write files. No other cross-story setup is needed — this feature otherwise extends existing files in place.

- [X] T001 [P] Create `bench-live/` scaffold (`bench-live/scenarios/`, `bench-live/src/`, `bench-live/results/`, a minimal `bench-live/README.md` mirroring `bench/README.md`'s structure)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one piece of shared infrastructure both US2 (blocking logic) and US3 (live task-set sizing) need: a single, exported size/token threshold that decides `smart_read` eligibility, so the two don't drift out of sync (research.md §3).

**⚠️ CRITICAL**: T002/T003 must complete before US2 or US3 implementation tasks begin.

- [X] T002 [P] Test: `packages/core/src/smart-read.test.ts` asserts a new exported threshold constant exists and correctly classifies fixtures above/below the cutoff
- [X] T003 Export a single size/token threshold constant (e.g. `SMART_READ_ELIGIBLE_THRESHOLD`) from `packages/core/src/smart-read.ts`, used as the sole cutoff for both `smart_read` eligibility and the new precall blocking rule (depends on T002)

**Checkpoint**: Foundation ready — US1, US2, US3, US4 can now proceed (US1 and US4 don't depend on T002/T003 but must not start before this phase per phase ordering).

---

## Phase 3: User Story 1 - Trustworthy savings dashboard (Priority: P1) 🎯 MVP

**Goal**: The stats/dashboard view reliably shows accurate, real numbers every time it's queried — no intermittently missing data, no fabricated non-zero values.

**Independent Test**: Run a series of OpenCode sessions with ctxlite active, query stats after each; every query returns present, accurate values matching real measured savings (or explicit zero).

### Tests for User Story 1 (MANDATORY — Constitution Principle II) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation

- [X] T004 [P] [US1] Reproduction test for intermittent missing/stale stats rows across repeated writes+reads in `packages/core/src/stats.test.ts`
- [X] T005 [P] [US1] Test asserting a session with zero qualifying savings returns explicit zero/no-data, never a fabricated non-zero value, in `packages/core/src/stats.test.ts`
- [X] T006 [P] [US1] Reproduction test for dashboard/graph query reliability (100% presence across ≥20 consecutive sessions, per SC-004) in `packages/core/src/report.test.ts`
- [X] T007 [P] [US1] Integration test: OpenCode session-end stats are visible immediately after the session in `packages/opencode/src/stats-events.test.ts`

### Implementation for User Story 1

- [X] T008 [US1] Fix the write/read path inconsistency between the `better-sqlite3` and `bun:sqlite` adapters in `packages/core/src/sqlite-adapter.ts` identified by T004 (depends on T004)
- [X] T009 [US1] Ensure `logOptimizationSavings`/`logSessionUsage` writes in `packages/core/src/stats.ts` are durably committed before returning, closing the race from T004/T006 (depends on T008)
- [X] T010 [US1] Fix `packages/core/src/report.ts` query path so it never returns a stale/empty read for a session that has committed rows (depends on T009)
- [X] T011 [US1] Fix `packages/opencode/src/session-display.ts` to render the corrected query results reliably, closing T007 (depends on T010)
- [X] T012 [US1] Ensure no-savings sessions render as explicit zero in `packages/core/src/report.ts` and `packages/opencode/src/session-display.ts`, closing T005 (depends on T010, T011)

**Checkpoint**: User Story 1 is fully functional and independently testable — stats are reliable regardless of US2/US3/US4 status.

---

## Phase 4: User Story 2 - Enforced token-efficient file access in OpenCode (Priority: P1)

**Goal**: The OpenCode agent is blocked from doing expensive full-content reads when a cheaper ctxlite alternative (`smart_read`) would do, and is redirected to retry — while edit-intent reads and small-file reads are unaffected.

**Independent Test**: In a live OpenCode session, ask the agent to inspect a large file's structure; confirm the native read is blocked and redirected. Ask it to edit a file; confirm the full read is allowed.

### Tests for User Story 2 (MANDATORY — Constitution Principle II) ⚠️

- [X] T013 [P] [US2] Test: `optimizeReadPath`/`optimizeToolArgs` blocks a full read above the T003 threshold with no edit intent, returning `blocked: true` and a `blockReason` naming `smart_read` per `contracts/precall-block-read.md`, in `packages/core/src/tool-precall.test.ts`
- [X] T014 [P] [US2] Test: the same call with edit intent signaled is **not** blocked, in `packages/core/src/tool-precall.test.ts`
- [X] T015 [P] [US2] Test: a full read below the T003 threshold is never blocked regardless of edit intent, in `packages/core/src/tool-precall.test.ts`
- [X] T016 [P] [US2] Test: existing low-signal-path blocking (`node_modules/`, lockfiles, `.ctxliteignore`) is unchanged by the new rule (regression guard), in `packages/core/src/tool-precall.test.ts`
- [X] T017 [P] [US2] Test: `packages/opencode/src/precall-state.ts` correctly tracks a recent edit/write call per session+path within the relevant window, in `packages/opencode/src/precall-state.test.ts`
- [X] T018 [P] [US2] Test: `packages/opencode/src/tool-precall-hook.ts` surfaces the `[ctxlite] <blockReason>` message and logs a `precall` savings row on block, in `packages/opencode/src/tool-precall-hook.test.ts`

### Implementation for User Story 2

- [X] T019 [US2] Extend `optimizeReadPath`/`optimizeToolArgs` in `packages/core/src/tool-precall.ts` to accept a `hasEditIntent` input and implement the block-and-redirect rule per `contracts/precall-block-read.md` (depends on T013–T016, T003)
- [X] T020 [US2] Extend `packages/opencode/src/precall-state.ts` to record and query recent edit/write tool calls per session+path (depends on T017)
- [X] T021 [US2] Wire `packages/opencode/src/tool-precall-hook.ts` to compute `hasEditIntent` from `precall-state.ts` and pass it into `optimizeToolArgs`, logging the block via `logOptimizationSavings` per the existing pattern (depends on T019, T020, T018)
- [X] T022 [P] [US2] Update `packages/opencode/src/system-prompt.ts` to briefly mention the enforced block-and-redirect behavior so the agent isn't surprised by a blocked read (depends on T021)

**Checkpoint**: User Stories 1 AND 2 both work independently — enforcement is live and stats correctly reflect it (via US1's fixes).

---

## Phase 5: User Story 3 - Realistic, model-in-the-loop validation (Priority: P2)

**Goal**: A live benchmark harness proves the 70–90% output-token cost reduction target against a real local OpenCode invocation and a real (free-tier) model, with logging and rerun support.

**Independent Test**: Run `npm run bench:live -- --mode both` end-to-end; confirm it records actual token/cost/quality data for enforced vs. disabled runs and can be rerun for stability comparison.

### Tests for User Story 3 (MANDATORY — Constitution Principle II) ⚠️

- [X] T023 [P] [US3] Test: `bench-live/src/report.ts` percent-reduction and SC-001 pass/fail-band calculation, in `bench-live/src/report.test.ts`
- [X] T024 [P] [US3] Test: `bench-live/src/run.ts` task-set and model-config loading/validation (including the "no local `opencode` CLI" clear-error path), in `bench-live/src/run.test.ts`

### Implementation for User Story 3

- [X] T025 [US3] Define the representative task set (prompts, fixtures, `expectedEditIntent`, `correctnessCheck`) in `bench-live/scenarios/` per `data-model.md` Task Set entity
- [X] T026 [US3] Implement `bench-live/src/models.ts` free-tier model configuration (swappable, per research.md §5)
- [X] T027 [US3] Implement `bench-live/src/run.ts` CLI runner — shells out to local `opencode` CLI, runs `--mode enforced|disabled|both`, supports `--task`, `--rerun`, `--model` per `contracts/bench-live-cli.md` (depends on T023, T024, T025, T026)
- [X] T028 [US3] Implement `bench-live/src/report.ts` — writes per-run JSON, `summary.json`, and `report.txt` with the SC-001 pass/fail gate and exit code (depends on T027)
- [X] T029 [P] [US3] Add `bench:live` npm script to root `package.json` (depends on T027)
- [X] T030 [US3] Run `bench-live` locally against a real free-tier model with US1+US2 implementation complete; record baseline results under `bench-live/results/`, confirming ≥70% output-token reduction with no correctness regression (SC-001, SC-002, SC-003) (depends on T012, T021, T028, T029)

**Checkpoint**: User Stories 1, 2, and 3 are all independently functional, and US3's harness provides real evidence the 70–90% target is met.

---

## Phase 6: User Story 4 - Seamless install/build not pinned to a Node version (Priority: P3)

**Goal**: The package builds and installs cleanly on any currently-supported Node.js LTS version, with clear errors on genuine native-module mismatches.

**Independent Test**: Fresh install on the oldest and newest supported Node LTS versions in clean environments; both succeed with no manual intervention.

### Tests for User Story 4 (MANDATORY — Constitution Principle II) ⚠️

- [X] T031 [P] [US4] Test/script asserting a native-module ABI mismatch surfaces a clear, specific error (not a generic failure) from `packages/core/src/sqlite-adapter.ts`'s load path, in `packages/core/src/sqlite-adapter.test.ts`

### Implementation for User Story 4

- [X] T032 [P] [US4] Add informational (non-`engine-strict`) `engines` fields to root `package.json` and `packages/core/package.json` documenting the supported Node LTS range (per research.md §6)
- [X] T033 [US4] Improve the native-module load failure path in `packages/core/src/sqlite-adapter.ts` to surface a clear, specific error identifying the ABI mismatch, falling back to the existing Bun path where applicable (depends on T031)
- [X] T034 [US4] Add a CI matrix job to `.github/workflows/ci.yml` testing install + `npm test` on the oldest and newest supported Node LTS versions (depends on T032, T033)
- [X] T035 [P] [US4] Document the supported Node range and seamless-install guarantee in `docs/contributing.md` (depends on T032)

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation that spans all stories.

- [X] T036 Run `specs/026-opencode-output-token-efficiency/quickstart.md` end-to-end and confirm every step's expected outcome
- [X] T037 Run `npm run typecheck && npm test && npm run lint` with no regressions
- [X] T038 Run `npm run test:coverage` and confirm no package in `packages/*` drops below the 90% floor
- [X] T039 Run `npm run bench` (existing deterministic suite) and confirm no regression against `bench/baseline/summary.json`
- [X] T040 [P] Update `docs/benchmarks.md` to describe `bench-live/` alongside the existing `bench/` suite and how the two relate (per research.md §5 non-goals)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS US2 and US3 (US1 and US4 don't need T002/T003 but should not start before Phase 2 per standard ordering).
- **User Stories (Phase 3–6)**: All depend on Foundational phase completion.
  - US1 (P1) and US2 (P1) have no dependency on each other and can proceed in parallel.
  - US3 (P2) depends on US1 and US2 being implemented for its live validation run (T030), though its harness code (T025–T029) can be built in parallel with US1/US2.
  - US4 (P3) is fully independent of US1/US2/US3.
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Independent — no dependency on other stories.
- **US2 (P1)**: Independent implementation; depends on Foundational (T003) for the shared threshold.
- **US3 (P2)**: Harness build (T025–T029) is independent; the validation run (T030) depends on US1 (T012) and US2 (T021) being done so the harness measures the real enforced behavior.
- **US4 (P3)**: Fully independent of US1/US2/US3.

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Constitution Principle II).
- Core (`packages/core`) changes before adapter (`packages/opencode`) wiring, matching the "business logic only in `@ctxlite/core`" constraint.
- Story complete before moving to the next priority, though US1/US2/US4 may run in parallel given team capacity.

### Parallel Opportunities

- T001 (Setup) and T002 (Foundational test) can start immediately in parallel.
- All [P]-marked test tasks within a story can run in parallel (different files or independent assertions in the same file, written before any implementation task in that story).
- US1 and US2 implementation can proceed fully in parallel once Phase 2 completes.
- US4 can proceed in parallel with everything else at any point after Phase 2.
- US3's harness-building tasks (T025–T029) can proceed in parallel with US1/US2; only the final validation run (T030) must wait.

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Reproduction test for intermittent missing/stale stats rows in packages/core/src/stats.test.ts"
Task: "Test asserting zero-savings session returns explicit zero in packages/core/src/stats.test.ts"
Task: "Reproduction test for dashboard/graph query reliability in packages/core/src/report.test.ts"
Task: "Integration test for OpenCode session-end stats visibility in packages/opencode/src/stats-events.test.ts"
```

## Parallel Example: User Story 2

```bash
# Launch all tests for User Story 2 together:
Task: "Test: block full read above threshold with no edit intent in packages/core/src/tool-precall.test.ts"
Task: "Test: allow full read with edit intent in packages/core/src/tool-precall.test.ts"
Task: "Test: never block below-threshold reads in packages/core/src/tool-precall.test.ts"
Task: "Regression test: existing low-signal-path blocking unchanged in packages/core/src/tool-precall.test.ts"
Task: "Test: precall-state tracks recent edit/write per session+path in packages/opencode/src/precall-state.test.ts"
Task: "Test: tool-precall-hook surfaces block message and logs savings row in packages/opencode/src/tool-precall-hook.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (trustworthy dashboard)
4. **STOP and VALIDATE**: Query stats across ≥20 sessions per SC-004; confirm no missing/fabricated values
5. This alone fixes the user's most concrete, immediately observable complaint (flaky dashboard) even before enforcement (US2) ships

### Incremental Delivery

1. Setup + Foundational → shared threshold ready
2. US1 → trustworthy stats → validate independently
3. US2 → real enforcement live in OpenCode → validate independently (blocked/allowed cases)
4. US3 → live benchmark harness proves the 70–90% target with US1+US2 in place → validate independently
5. US4 → install friction removed → validate independently
6. Polish → full regression sweep, quickstart, docs

### Parallel Team Strategy

With multiple developers, after Phase 2 completes:
- Developer A: US1 (stats reliability)
- Developer B: US2 (enforcement)
- Developer C: US4 (install), then US3 harness scaffolding once free to help
- US3's final validation run (T030) waits until A and B finish their stories
