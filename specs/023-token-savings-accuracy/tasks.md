# Tasks: Token Savings Accuracy and Verification

**Input**: Design documents from `/specs/023-token-savings-accuracy/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: MANDATORY for this repository (Constitution Principle II). Every task that changes behavior in `packages/*/src` or `bench/src/` includes a test task written and passing before the task is marked done.

**Organization**: Tasks grouped by user story — US1 and US2 are both P1; US1 (accuracy/trust) ships first as MVP; US2 (bench proof) depends on US1 fixes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2, or US3 per spec.md user stories

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bench directory layout, pinned baseline, npm entry point

- [X] T001 Create `bench/` layout (`baseline/`, `fixtures/`, `scenarios/`, `src/adapters/`, `results/`) per `specs/023-token-savings-accuracy/plan.md`
- [X] T002 [P] Copy archived baseline from `bench/results/2026-06-29T08-42-22-464Z/summary.json` to `bench/baseline/summary.json` and add `measuredSavingsPercent` field per `specs/023-token-savings-accuracy/contracts/bench-summary.md`
- [X] T003 [P] Add `"bench"` script to root `package.json` invoking `bench/src/run.ts` (via `tsx` or `node --import tsx`)
- [X] T004 [P] Add `bench/README.md` with one-paragraph purpose and link to `docs/benchmarks.md` (stub OK until US3)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Gap audit and measurement definitions — MUST complete before user stories

**⚠️ CRITICAL**: No user story implementation until this phase is done

- [X] T005 Grep all `logOptimizationSavings` / `logConcisenessSavings` call sites and append gap-audit table (source × host × measurement kind × issue) to `specs/023-token-savings-accuracy/research.md` (FR-001)
- [X] T006 [P] Document canonical `estimateTokens()` definition as the single verification counter in `specs/023-token-savings-accuracy/research.md` §R5 cross-reference
- [X] T007 [P] Add `bench/src/types.ts` with `RunResult`, `BaselineComparison`, `LoggingAccuracyRow` types from `specs/023-token-savings-accuracy/data-model.md`
- [X] T008 Add `bench/src/report.test.ts` with failing tests for `measuredSavingsPercent` computation (excludes `precall` + `concise` numerators) per `specs/023-token-savings-accuracy/contracts/bench-summary.md`

**Checkpoint**: Gap audit complete; bench types and report test scaffold ready

---

## Phase 3: User Story 1 — Users See Savings Figures That Match Reality (Priority: P1) 🎯 MVP

**Goal**: Fix logging bugs, label heuristics honestly, align measured `tokens_saved` within 10% of independent counts

**Independent Test**: Run unit tests for hook/report fixes; measured-mechanism fixtures show `|logged − independent| / independent ≤ 0.10` (SC-002 partial — full gate in US2 bench)

### Tests for User Story 1 (write first — must FAIL before implementation)

- [X] T009 [P] [US1] Add failing test: compress row `upstream === input.tool` (not `"opencode"`) in `packages/opencode/src/tool-compress-hook.test.ts`
- [X] T010 [P] [US1] Add failing test: smart_read row `upstream` is meaningful tool id (not `"opencode"`) in `packages/opencode/src/smart-read-tool.test.ts`
- [X] T011 [P] [US1] Add failing test: `buildStatsBreakdown` labels precall as `precall (est.)` in `packages/core/src/report.test.ts`
- [X] T012 [P] [US1] Add regression test: Claude Code `upstream` is real tool name in `packages/cli/src/hook.test.ts` (verify `022` — FR-002)
- [X] T013 [P] [US1] Add regression test: Cursor `upstream` is normalized tool name in `packages/cli/src/cursor-hook.test.ts` (verify `022` — FR-002)
- [X] T014 [P] [US1] Add table-driven tests: logged `tokensSaved` within 10% of `estimateTokens(before) − estimateTokens(after)` for compress/prune/compact in `packages/core/src/tool-output-compress.test.ts` and `packages/core/src/context-prune.test.ts`

### Implementation for User Story 1

- [X] T015 [US1] Fix `upstream: input.tool` on compress branch in `packages/opencode/src/tool-compress-hook.ts`
- [X] T016 [US1] Fix meaningful `upstream` on smart_read logging in `packages/opencode/src/smart-read-tool.ts`
- [X] T017 [US1] Change precall label to `precall (est.)` in `packages/core/src/report.ts` per `specs/023-token-savings-accuracy/contracts/stats-display.md`
- [X] T018 [P] [US1] Add optional `measurementKind: "measured" | "estimate"` per breakdown row in JSON stats output in `packages/core/src/report.ts` (if `packages/cli` JSON formatter uses it)
- [X] T019 [US1] Implement `verifyLoggingAccuracy(logged, before, after)` helper in `packages/core/src/tokens.ts` (or `packages/core/src/logging-accuracy.ts`) using `estimateTokens()`
- [X] T020 [P] [US1] Calibrate `compressToolOutput` defaults in `packages/core/src/tool-output-compress.ts` if T014 shows >10% drift on canonical fixture strings
- [X] T021 [P] [US1] Calibrate `pruneMessageContext` / `capStaleToolOutputs` in `packages/core/src/context-prune.ts` if T014 shows >10% drift
- [X] T022 [US1] Run `npm run typecheck && npm test` for `packages/core`, `packages/opencode`, `packages/cli` — all US1 tests green

**Checkpoint**: Upstream bugs fixed; precall labeled `(est.)`; measured logging within 10% on unit fixtures

---

## Phase 4: User Story 2 — Improvements Proven via Simulated Sessions (Priority: P1)

**Goal**: Deterministic bench replays 7 scenarios, enforces 15% measured-rate gate, archives reproducible reports

**Independent Test**: `npm run bench` exits 0; `bench/results/<timestamp>/report.txt` shows `Regression Verdict: PASS`; `measuredSavingsPercent ≥ baseline × 1.15` (SC-001)

### Tests for User Story 2 (write first — must FAIL before implementation)

- [X] T023 [P] [US2] Add failing tests for regression verdict fail conditions in `bench/src/report.test.ts` (correctness penalty, loggingAccuracy >10%, measured rate below gate)
- [X] T024 [P] [US2] Add failing adapter smoke test: `baseline` adapter returns zero savings in `bench/src/adapters/baseline.test.ts`
- [X] T025 [P] [US2] Add failing test: `claude-code` adapter `precall-npm-test` logs `upstream: "bash"` in `bench/src/adapters/claude-code.test.ts`
- [X] T026 [P] [US2] Add failing test: `cursor` adapter skips or documents N/A for `compress-large-output` in `bench/src/adapters/cursor.test.ts`

### Implementation for User Story 2

- [X] T027 [P] [US2] Create seven scenario fixture files in `bench/fixtures/` (`compact-stale-tool-output`, `compress-large-output`, `concise-10000-tokens`, `precall-npm-test`, `prune-duplicate-tool-call`, `smart-read-typescript`, `trim-file-list`)
- [X] T028 [P] [US2] Create scenario manifest `bench/scenarios/index.ts` mapping `taskId` → fixtures, assertions, mechanisms per `specs/023-token-savings-accuracy/data-model.md`
- [X] T029 [P] [US2] Implement single-mechanism adapters (`baseline`, `precall`, `compress`, `prune`, `compact`, `smart_read`, `trim`, `concise`) in `bench/src/adapters/`
- [X] T030 [US2] Implement `ctxlite-all` adapter composing all mechanisms in `bench/src/adapters/ctxlite-all.ts`
- [X] T031 [P] [US2] Implement `claude-code` adapter invoking `packages/cli/src/hook.ts` with fixture stdin in `bench/src/adapters/claude-code.ts`
- [X] T032 [P] [US2] Implement `cursor` adapter invoking `packages/cli/src/cursor-hook.ts` with fixture stdin in `bench/src/adapters/cursor.ts`
- [X] T033 [US2] Implement aggregation + `baselineComparison` + `measuredSavingsPercent` in `bench/src/report.ts` per `specs/023-token-savings-accuracy/contracts/bench-summary.md`
- [X] T034 [US2] Implement `loggingAccuracy` per-run checks in `bench/src/report.ts` (SC-002 bench enforcement)
- [X] T035 [US2] Implement CLI runner `bench/src/run.ts` (all adapters × all tasks, write `bench/results/<timestamp>/`)
- [X] T036 [US2] Tune `packages/core/src/tool-output-compress.ts` and `packages/core/src/context-prune.ts` until `npm run bench` passes 15% `measuredSavingsPercent` gate with 100% correctness (FR-006)
- [X] T037 [US2] Re-pin `bench/baseline/summary.json` from passing run after T036
- [X] T038 [US2] Run `npm run bench` and confirm `regressionVerdict.verdict === "pass"` per `specs/023-token-savings-accuracy/quickstart.md` §2

**Checkpoint**: Bench is authoritative proof mechanism; archived report demonstrates ≥15% measured improvement

---

## Phase 5: User Story 3 — Documentation and Published Metrics (Priority: P2)

**Goal**: Docs explain per-host capabilities, estimate vs measured, and how to run bench; metrics match latest baseline

**Independent Test**: `docs/` spot-check per `specs/023-token-savings-accuracy/quickstart.md` §6; metrics within ±0.5pp of `bench/baseline/summary.json` (SC-004)

### Implementation for User Story 3

- [X] T039 [P] [US3] Add per-host capability matrix table to `docs/architecture.md` per `specs/023-token-savings-accuracy/contracts/stats-display.md`
- [X] T040 [P] [US3] Add estimate-vs-measured legend and `upstream` semantics to `docs/architecture.md`
- [X] T041 [US3] Create `docs/benchmarks.md` with canonical scenarios, metrics table from `bench/baseline/summary.json`, and `report.txt` interpretation
- [X] T042 [US3] Add `npm run bench` contributor section (when to run, PR gate, re-pin baseline) to `docs/contributing.md`
- [X] T043 [US3] Expand `bench/README.md` with link to `docs/benchmarks.md` and quickstart steps

**Checkpoint**: New contributor can run bench from docs alone in <5 minutes (SC-005)

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Full validation, coverage floor, audit changelog

- [X] T044 Run full `specs/023-token-savings-accuracy/quickstart.md` validation checklist end-to-end
- [X] T045 Run `npm run typecheck && npm test && npm run lint` at repo root
- [X] T046 Run `npm run test:coverage` — confirm every `packages/*` package ≥ 90% (Principle II)
- [X] T047 [P] Append threshold-tuning changelog (before/after values) to `specs/023-token-savings-accuracy/research.md` after T036
- [X] T048 [P] Update gap-audit table in `specs/023-token-savings-accuracy/research.md` marking fixed vs documented items

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **blocks all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 — MVP deliverable
- **US2 (Phase 4)**: Depends on US1 (core fixes + logging helper must exist before bench adapters)
- **US3 (Phase 5)**: Depends on US2 (needs final `bench/baseline/summary.json` for metrics table)
- **Polish (Phase 6)**: Depends on US1–US3

### User Story Dependencies

```text
Phase 2 (Foundational)
       │
       ▼
   US1 (P1) ──accuracy fixes, labels, unit-level 10% checks
       │
       ▼
   US2 (P1) ──bench harness, 15% gate, re-pin baseline
       │
       ▼
   US3 (P2) ──docs + published metrics
```

- **US1**: Independent after Foundational — no dependency on US2/US3
- **US2**: Depends on US1 T015–T019 (fixes + `verifyLoggingAccuracy`)
- **US3**: Depends on US2 T037 (pinned baseline with final metrics)

### Within Each User Story

- Tests (T009–T014, T023–T026) MUST fail before implementation tasks in same story
- Core calibration (T020–T021) before bench tuning (T036)
- Bench implementation (T027–T035) before gate tuning (T036)

### Parallel Opportunities

- **Phase 1**: T002, T003, T004 in parallel after T001
- **Phase 2**: T006, T007 in parallel after T005
- **US1 tests**: T009–T014 all parallel
- **US1 impl**: T018, T020, T021 parallel after T015–T017
- **US2 fixtures**: T027, T028 parallel; T029 adapters parallel; T031, T032 parallel after T030
- **US3 docs**: T039, T040 parallel
- **Polish**: T047, T048 parallel

---

## Parallel Example: User Story 1

```bash
# All US1 tests together (must fail first):
T009 tool-compress-hook.test.ts
T010 smart-read-tool.test.ts
T011 report.test.ts
T012 hook.test.ts
T013 cursor-hook.test.ts
T014 tool-output-compress.test.ts + context-prune.test.ts
```

## Parallel Example: User Story 2

```bash
# Fixtures + scenario manifest together:
T027 bench/fixtures/*
T028 bench/scenarios/index.ts

# Host adapters together (after ctxlite-all):
T031 bench/src/adapters/claude-code.ts
T032 bench/src/adapters/cursor.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (gap audit)
3. Complete Phase 3: User Story 1 (upstream fixes + `precall (est.)` + unit-level accuracy)
4. **STOP and VALIDATE**: `npm test` green for core/opencode/cli; manual `ctxlite stats` shows `(est.)` labels

### Incremental Delivery

1. Setup + Foundational → audit artifact ready
2. US1 → trustworthy logging and labels (MVP)
3. US2 → bench proves 15% measured improvement (release gate)
4. US3 → docs and metrics for contributors/users
5. Polish → quickstart + coverage

### Suggested MVP Scope

**User Story 1 only** (Phases 1–3): fixes misleading counts and labels without waiting for full bench. US2 is required before calling the **feature** done per spec SC-001, but US1 alone restores user trust in displayed numbers.

---

## Notes

- Read `ctxlite-internals` skill before editing `packages/core/src/tool-precall.ts`, `tool-output-compress.ts`, or `context-prune.ts`
- Do not inflate `PRECALL_ESTIMATES` or `CONCISENESS_SAVINGS_RATE` to pass the 15% gate — gate is `measuredSavingsPercent` only
- `022` Claude Code/Cursor upstream is already fixed — T012/T013 are regression guards, not re-implementation
- Historical SQLite rows are not backfilled (FR-009)

---

## Task Summary

| Phase | Task IDs | Count |
|-------|----------|-------|
| Setup | T001–T004 | 4 |
| Foundational | T005–T008 | 4 |
| US1 (P1) | T009–T022 | 14 |
| US2 (P1) | T023–T038 | 16 |
| US3 (P2) | T039–T043 | 5 |
| Polish | T044–T048 | 5 |
| **Total** | **T001–T048** | **48** |

| User Story | Tasks | Test tasks |
|------------|-------|------------|
| US1 | 14 | 6 tests + 8 impl |
| US2 | 16 | 4 tests + 12 impl |
| US3 | 5 | 0 (docs-only; validated via quickstart §6) |

**Format validation**: All 48 tasks use `- [X] [Tnnn] [P?] [USn?] Description with file path` ✅
