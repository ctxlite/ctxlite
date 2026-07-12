# Tasks: MCP Efficiency Expansion and Agent Guidance

**Input**: Design documents from `/specs/024-mcp-efficiency-expansion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: MANDATORY for this repository (Constitution Principle II). Every task that changes behavior in `packages/*/src` includes a test task written and passing before the task is marked done.

**Organization**: Tasks grouped by user story. P1 stories (US1, US2, US6, US7) prioritized for MVP; US3–US5 (P2) deliver new tools and stats before US6 skill rewrite.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US7 per spec.md user stories

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Fixtures, failing integration scaffold, export stubs

- [X] T001 Create canonical fixtures under `packages/core/test-fixtures/mcp-efficiency/` (`large-file.ts`, `unified.diff`, `noisy.log`, `search-repo/`, `large-task-prompt.txt`) per `specs/024-mcp-efficiency-expansion/quickstart.md` and SC-001–SC-006
- [X] T002 [P] Add failing test asserting seven tools registered in `packages/mcp/src/server.test.ts`
- [X] T003 [P] Read `.claude/skills/ctxlite-internals/SKILL.md` before editing `packages/core/src/stats.ts` (document blast radius in commit message)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types and stats source union — MUST complete before new tool logging (US5) and MCP handlers

**⚠️ CRITICAL**: No user story with new `source` values until this phase is done

- [X] T004 Extend `RequestLog.source` and related unions in `packages/core/src/types.ts` with `diff_read`, `log_summary`, `code_search` per `specs/024-mcp-efficiency-expansion/data-model.md`
- [X] T005 [P] Extend `OptimizationLog` / `logOptimizationSavings` source union in `packages/core/src/stats.ts` for the three new measured sources
- [X] T006 [P] Add failing `StatsStore.summary()` aggregate tests for new sources in `packages/core/src/stats.test.ts`

**Checkpoint**: Types and stats union ready; T006 still failing until US5 implementation

---

## Phase 3: User Story 1 — Agents Read Code with Minimal Tokens (Priority: P1) 🎯 MVP

**Goal**: Preserve and document `smart_read` as default for structure reads; SC-001 compression ratio holds

**Independent Test**: Large TypeScript fixture — `smart_read` output ≥60% smaller than full read while exposing top-level signatures (SC-001)

### Tests for User Story 1 (write first — must FAIL before implementation if regressions found)

- [X] T007 [P] [US1] Add SC-001 fixture test (≥60% smaller than full read) in `packages/core/src/smart-read.test.ts`
- [X] T008 [P] [US1] Add MCP handler test for budgeted fallback output cap in `packages/mcp/src/tools/smart-read.test.ts`

### Implementation for User Story 1

- [X] T009 [US1] Update `smart_read` when-to-use and ~2–3k token threshold prose in `packages/mcp/src/server.ts` `SERVER_INSTRUCTIONS`
- [X] T010 [US1] Fix `packages/core/src/smart-read.ts` only if T007 fails; otherwise confirm no behavior change

**Checkpoint**: US1 regression green; `smart_read` documented in server instructions

---

## Phase 4: User Story 2 — Agents Narrow Multi-File Context (Priority: P1)

**Goal**: Preserve `trim_context` behavior; SC-002 keeps ≤50% of files with answer file retained

**Independent Test**: 10-file candidate set + task query — `trim_context` keeps ≤50% and retains target file (SC-002)

### Tests for User Story 2 (write first)

- [X] T011 [P] [US2] Add SC-002 fixture test in `packages/core/src/trim-files.test.ts` (or dedicated trim fixture test file)
- [X] T012 [P] [US2] Add MCP handler subset test in `packages/mcp/src/tools/trim-context.test.ts`

### Implementation for User Story 2

- [X] T013 [US2] Update `trim_context` when-to-use and skip-when-single-file guidance in `packages/mcp/src/server.ts` `SERVER_INSTRUCTIONS`

**Checkpoint**: US2 regression green; trim guidance in server instructions

---

## Phase 5: User Story 3 — Diff-Aware Reads and Log Summarization (Priority: P2)

**Goal**: Ship `diff_read` and `log_summary` MCP tools with core logic; SC-003 and SC-004

**Independent Test**: Unified diff + noisy log fixtures — hunk-focused output ≥70% smaller; log summary ≥80% smaller with all failure ids (SC-003, SC-004)

### Tests for User Story 3 (write first — must FAIL before implementation)

- [X] T014 [P] [US3] Add failing SC-003 tests for `diffRead()` in `packages/core/src/diff-read.test.ts`
- [X] T015 [P] [US3] Add failing SC-004 tests for `summarizeLog()` in `packages/core/src/log-summary.test.ts`
- [X] T016 [P] [US3] Add failing MCP zod + handler tests in `packages/mcp/src/tools/diff-read.test.ts`
- [X] T017 [P] [US3] Add failing MCP zod + handler tests in `packages/mcp/src/tools/log-summary.test.ts`

### Implementation for User Story 3

- [X] T018 [P] [US3] Implement `diffRead()` in `packages/core/src/diff-read.ts` per `specs/024-mcp-efficiency-expansion/contracts/mcp-tools.md`
- [X] T019 [P] [US3] Implement `summarizeLog()` in `packages/core/src/log-summary.ts` per `specs/024-mcp-efficiency-expansion/contracts/mcp-tools.md`
- [X] T020 [US3] Export `diffRead` and `summarizeLog` from `packages/core/src/index.ts`
- [X] T021 [P] [US3] Implement `handleDiffRead` with zod schema in `packages/mcp/src/tools/diff-read.ts`
- [X] T022 [P] [US3] Implement `handleLogSummary` with zod schema in `packages/mcp/src/tools/log-summary.ts`
- [X] T023 [US3] Register `diff_read` and `log_summary` in `packages/mcp/src/server.ts`

**Checkpoint**: US3 tools callable via MCP; core tests meet SC-003/SC-004

---

## Phase 6: User Story 4 — Search and Budget Planning (Priority: P2)

**Goal**: Ship `code_search` and `budget_planner`; SC-005 and SC-006

**Independent Test**: Monorepo fixture query returns known file in top 3; large-task planner returns ≥3 steps with sum ≤ `maxBudget` (SC-005, SC-006)

### Tests for User Story 4 (write first — must FAIL before implementation)

- [X] T024 [P] [US4] Add failing SC-005 tests for `searchCodebase()` in `packages/core/src/code-search.test.ts`
- [X] T025 [P] [US4] Add failing SC-006 tests for `planBudget()` in `packages/core/src/budget-planner.test.ts`
- [X] T026 [P] [US4] Add failing MCP handler tests in `packages/mcp/src/tools/code-search.test.ts`
- [X] T027 [P] [US4] Add failing MCP handler tests in `packages/mcp/src/tools/budget-planner.test.ts`

### Implementation for User Story 4

- [X] T028 [P] [US4] Implement `searchCodebase()` in `packages/core/src/code-search.ts` (BM25 + `ctxliteignore`, max 500 files per research.md R2)
- [X] T029 [P] [US4] Implement `planBudget()` in `packages/core/src/budget-planner.ts` (rule-based, no LLM)
- [X] T030 [US4] Export `searchCodebase` and `planBudget` from `packages/core/src/index.ts`
- [X] T031 [P] [US4] Implement `handleCodeSearch` in `packages/mcp/src/tools/code-search.ts`
- [X] T032 [P] [US4] Implement `handleBudgetPlanner` in `packages/mcp/src/tools/budget-planner.ts`
- [X] T033 [US4] Register `code_search` and `budget_planner` in `packages/mcp/src/server.ts`

**Checkpoint**: US4 tools callable; SC-005/SC-006 fixture tests green

---

## Phase 7: User Story 5 — Trust Reported Savings (Priority: P2)

**Goal**: Attribute new tool savings in stats; reinforce `get_stats` for savings questions (FR-008, SC-008)

**Independent Test**: After running new MCP tools, `ctxlite stats --last today` shows non-zero rows for `diff_read` / `log_summary` / `code_search` when savings occurred

### Tests for User Story 5 (write first)

- [X] T034 [P] [US5] Complete `StatsStore.summary()` tests for new source columns in `packages/core/src/stats.test.ts` (T006 scaffold)
- [X] T035 [P] [US5] Add breakdown row tests for new mechanisms in `packages/core/src/report.test.ts`
- [X] T036 [P] [US5] Add MCP logging integration test: `diff_read` logs `source: diff_read` in `packages/mcp/src/tools/diff-read.test.ts`

### Implementation for User Story 5

- [X] T037 [US5] Extend `StatsStore.summary()` SQL aggregates in `packages/core/src/stats.ts` for `diff_read`, `log_summary`, `code_search`
- [X] T038 [US5] Extend `buildStatsBreakdown` in `packages/core/src/report.ts` with measured rows for new sources (no `(est.)`)
- [X] T039 [P] [US5] Call `logOptimizationSavings` from `packages/mcp/src/tools/diff-read.ts` when `tokensSaved > 0`
- [X] T040 [P] [US5] Call `logOptimizationSavings` from `packages/mcp/src/tools/log-summary.ts` when `tokensSaved > 0`
- [X] T041 [P] [US5] Call `logOptimizationSavings` from `packages/mcp/src/tools/code-search.ts` when `tokensSaved > 0`
- [X] T042 [US5] Update `get_stats` description in `packages/mcp/src/server.ts` to require `get_stats` for savings questions and reference estimate vs measured labeling

**Checkpoint**: New tools attributable in stats; breakdown SQL and report stay in sync

---

## Phase 8: User Story 6 — Unified Efficiency Skill (Priority: P1)

**Goal**: Single skill on Cursor, Claude Code, OpenCode listing all seven tools (FR-001, SC-007)

**Independent Test**: `ctxlite install` for each host — installed `SKILL.md` contains all seven tool names per `specs/024-mcp-efficiency-expansion/contracts/skill-content.md`

### Tests for User Story 6 (write first)

- [X] T043 [P] [US6] Add failing install test asserting seven tool substrings in `packages/core/src/install/install.test.ts`
- [X] T044 [P] [US6] Add skill section contract test in `packages/core/src/install/skill-content.test.ts` (frontmatter + required sections)

### Implementation for User Story 6

- [X] T045 [US6] Rewrite `CTXLITE_SKILL_CONTENT` in `packages/core/src/install/skill-content.ts` per `specs/024-mcp-efficiency-expansion/contracts/skill-content.md`
- [X] T046 [US6] Confirm `packages/core/src/install/run.ts` still maps skill to all three hosts without path changes

**Checkpoint**: SC-007 satisfied; skill is single source for US1/US2/US5 behavioral guidance

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Docs, server integration, coverage gate

- [X] T047 [P] Update MCP tool table and when-to-use matrix in `docs/architecture.md`
- [X] T048 [P] Update MCP tool list in `docs/configuration.md` if section exists
- [X] T049 Complete `packages/mcp/src/server.test.ts` seven-tool registration and instructions substring checks
- [X] T050 Run `specs/024-mcp-efficiency-expansion/quickstart.md` §1–§6 (`npm run typecheck && npm test && npm run test:coverage`)
- [X] T051 [P] Ensure `packages/core/src/index.test.ts` exports list includes new public APIs

---

## Phase 10: User Story 7 — Releasable Version Bump (Priority: P1)

**Goal**: Synchronized **0.1.37** release prep (FR-011, SC-009)

**Independent Test**: `config.version` > 0.1.36; all `packages/*/package.json` aligned; `npm view @ctxlite/mcp version` < bumped version; CI green

### Implementation for User Story 7

- [X] T052 [US7] Run `npm view @ctxlite/mcp version` and confirm result is strictly less than `0.1.37`
- [X] T053 [US7] Bump `config.version` to `0.1.37` in root `package.json`
- [X] T054 [US7] Run `npm run sync-version` and verify all workspace package versions match
- [X] T055 [US7] Add `0.1.37` entry to `CHANGELOG.md` (four new MCP tools, skill update, stats sources)
- [X] T056 [US7] Run `npm run typecheck && npm test && npm run lint && npm run test:coverage` — all packages ≥90% coverage

**Checkpoint**: Feature releasable via `publish:npm:live` (manual publish out of scope)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — blocks US5 stats implementation
- **US1 (Phase 3)**: Depends on Setup only — **MVP entry point**
- **US2 (Phase 4)**: Depends on Setup only — parallel with US1 after Phase 1
- **US3 (Phase 5)**: Depends on Phase 1 — independent of US1/US2
- **US4 (Phase 6)**: Depends on Phase 1 — parallel with US3 after fixtures exist
- **US5 (Phase 7)**: Depends on Phase 2 + US3 + US4 (handlers must exist to wire logging)
- **US6 (Phase 8)**: Depends on US1–US5 tool names/contracts (skill references all seven tools)
- **Polish (Phase 9)**: Depends on US3–US6
- **US7 (Phase 10)**: Depends on all prior phases + Polish CI green

### User Story Dependencies

| Story | Depends on | Independent test |
|-------|------------|------------------|
| US1 | Phase 1 | SC-001 smart_read fixture |
| US2 | Phase 1 | SC-002 trim fixture |
| US3 | Phase 1 | SC-003/SC-004 diff + log fixtures |
| US4 | Phase 1 | SC-005/SC-006 search + planner fixtures |
| US5 | Phase 2, US3, US4 | Stats rows after tool calls |
| US6 | US1–US5 contracts | Install skill substring check |
| US7 | All above | Version + changelog + CI |

### Parallel Opportunities

- **Phase 1**: T002 ∥ T003
- **Phase 2**: T005 ∥ T006 (after T004)
- **US1**: T007 ∥ T008
- **US2**: T011 ∥ T012
- **US3**: T014–T017 parallel; T018 ∥ T019; T021 ∥ T022
- **US4**: T024–T027 parallel; T028 ∥ T029; T031 ∥ T032
- **US5**: T034–T036 parallel; T039–T041 parallel
- **US6**: T043 ∥ T044
- **Polish**: T047 ∥ T048 ∥ T051
- **Cross-story**: US1 ∥ US2 after Phase 1; US3 ∥ US4 after Phase 1

---

## Parallel Example: User Story 3

```bash
# Core tests first (all fail):
packages/core/src/diff-read.test.ts
packages/core/src/log-summary.test.ts

# Core implementation in parallel:
packages/core/src/diff-read.ts
packages/core/src/log-summary.ts

# MCP adapters in parallel:
packages/mcp/src/tools/diff-read.ts
packages/mcp/src/tools/log-summary.ts
```

---

## Parallel Example: User Story 4

```bash
# Core tests first:
packages/core/src/code-search.test.ts
packages/core/src/budget-planner.test.ts

# Core implementation in parallel:
packages/core/src/code-search.ts
packages/core/src/budget-planner.ts
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 1: Setup
2. Complete Phase 3: User Story 1 (`smart_read` regression + instructions)
3. **STOP and VALIDATE**: SC-001 fixture test green
4. Optionally add US2 (trim) before new tools

### Incremental Delivery

1. Setup + Foundational → types ready
2. US1 + US2 → existing tools documented and regression-locked
3. US3 + US4 → four new MCP tools (core + adapters)
4. US5 → stats attribution wired
5. US6 → unified skill ships
6. Polish → docs + seven-tool server test
7. US7 → 0.1.37 release prep

### Suggested full-order for single developer

T001–T006 → T007–T013 → T014–T023 → T024–T033 → T034–T042 → T043–T046 → T047–T051 → T052–T056

---

## Notes

- `budget_planner` does not call `logOptimizationSavings` (planning only per research.md R3)
- MCP handlers stay thin — all parsing/compression logic in `@ctxlite/core`
- Do not add persistent cross-session cache (FR-012 out of scope)
- Read ctxlite-internals skill before `stats.ts` / `report.ts` edits (T003)
- Every `[P]` task targets a different file — avoid same-file parallel edits
