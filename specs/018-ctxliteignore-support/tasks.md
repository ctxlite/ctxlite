---

description: "Task list for .ctxliteignore support"
---

# Tasks: `.ctxliteignore` Support

**Input**: Design documents from `/specs/018-ctxliteignore-support/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ctxliteignore-format.md

**Tests**: MANDATORY for this repository (Constitution Principle II — Test-First, Zero Skipped Tests). Every task below that changes behavior in `packages/*/src` includes a test task, written and passing before the task is marked done.

**Organization**: Tasks are grouped by user story (US1 = P1, US2 = P3 per spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

## Phase 1: Setup

**Purpose**: No new dependencies, no scaffolding needed — this is a small addition to an existing monorepo package. Nothing to do here beyond confirming the target file doesn't already exist.

- [ ] T001 Confirm `packages/core/src/ctxliteignore.ts` does not already exist (`ls packages/core/src/ctxliteignore.ts` should fail) — sanity check only, no file changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The core pattern-loading/matching module both user stories depend on. MUST complete before either user story.

### Tests for Foundational module (MANDATORY — Constitution Principle II) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation (the module doesn't exist yet, so this is a natural given).

- [ ] T002 [P] Write `packages/core/src/ctxliteignore.test.ts` using real temp directories (`mkdtempSync`, no filesystem mocking — per `ctxlite-internals` convention) covering: `loadIgnorePatterns(cwd)` returns `[]` when no `.ctxliteignore` exists (FR-004); returns parsed patterns for a file with `*.ext`, `dir/` (trailing slash → `directoryOnly: true`), `**` wildcard, `#` comments, and blank lines; skips a malformed line without throwing and without dropping other valid lines in the same file (FR-005); `isIgnored(path, patterns)` matches Windows-style `\` paths after normalization (Edge Cases in spec.md), matches directory patterns against files nested arbitrarily deep under that directory, and returns `false` for an empty `patterns` array.

### Implementation for Foundational module

- [ ] T003 Implement `packages/core/src/ctxliteignore.ts`: `loadIgnorePatterns(cwd: string): IgnorePattern[]` (reads `${cwd}/.ctxliteignore` via `existsSync`/`readFileSync`, returns `[]` if absent; splits into lines; skips blank/`#`-prefixed lines; for each remaining line, compiles a regex per the limited glob subset in `research.md` Decision 1 — `*` → `[^/]*`, `**` → `.*`, trailing `/` sets `directoryOnly: true` and matches the dir plus everything under it; wraps compilation in try/catch so a line that somehow fails to produce a valid `RegExp` is skipped per FR-005, never thrown) and `isIgnored(path: string, patterns: IgnorePattern[]): boolean` (normalizes `\` to `/` per existing `optimizeReadPath` convention, tests `path` against each pattern's `regex`). Depends on T002 (test file must exist and fail first).
- [ ] T004 Export `loadIgnorePatterns` and `isIgnored` (plus the `IgnorePattern` type) from `packages/core/src/index.ts`, alongside the existing `tool-precall.js` exports. Depends on T003.

**Checkpoint**: `npm run test --workspace=packages/core` (or root `npm test`) passes for `ctxliteignore.test.ts`. Foundation ready — both user stories can now proceed.

---

## Phase 3: User Story 1 - Maintainer excludes project-specific paths via precall (Priority: P1) 🎯 MVP

**Goal**: `optimizeReadPath` blocks reads matching `.ctxliteignore` patterns, in addition to its existing hardcoded `BLOCKED_READ_PATTERNS`, with zero behavior change when no `.ctxliteignore` exists.

**Independent Test**: Create a real temp dir with a `.ctxliteignore` containing `vendor/`, call `optimizeReadPath("vendor/some-lib/file.go", tmpDir)`, confirm `blocked: true` with the same message format as a built-in-pattern block.

### Tests for User Story 1 (MANDATORY — Constitution Principle II) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [ ] T005 [P] [US1] Add cases to `packages/core/src/tool-precall.test.ts`: `optimizeReadPath` with a `cwd` pointing at a real temp dir containing a `.ctxliteignore` with `vendor/` blocks `vendor/some-lib/file.go` with `blockReason` starting `"Blocked read of low-signal path:"` (same format as built-in patterns, FR-003); `optimizeReadPath` with a `cwd` pointing at a temp dir with NO `.ctxliteignore` behaves identically to calling it with no `cwd` at all (SC-002, zero behavior change); `optimizeReadPath` with a `cwd` whose `.ctxliteignore` has one malformed line and one valid line still blocks the path matching the valid line (FR-005); `optimizeToolArgs("read", { path }, cwd)` and `optimizeToolArgs("glob", { path }, cwd)` both pass `cwd` through to `optimizeReadPath`.

### Implementation for User Story 1

- [ ] T006 [US1] Modify `packages/core/src/tool-precall.ts`: give `optimizeReadPath(path: string, cwd?: string)` an optional second parameter; when provided, call `loadIgnorePatterns(cwd)` and check `isIgnored` against the normalized path in addition to the existing `BLOCKED_READ_PATTERNS` loop (same block-message format, FR-002/FR-003); thread an optional `cwd` parameter through `optimizeToolArgs(tool, args, cwd?)` to `optimizeReadPath`. No change to behavior when `cwd` is omitted (existing callers, existing tests, stay valid as-is — SC-002). Depends on T005 and on Phase 2 (T003/T004).
- [ ] T007 [US1] Identify and update every call site of `optimizeToolArgs`/`optimizeReadPath` across the host packages (Claude Code/Cursor hook bridge, OpenCode plugin precall) to pass the project root as `cwd` — grep for `optimizeToolArgs(` and `optimizeReadPath(` outside `packages/core` to find them. Depends on T006.

**Checkpoint**: User Story 1 fully functional and testable independently — a `.ctxliteignore` with `vendor/` blocks matching reads on every host that calls precall.

---

## Phase 4: User Story 2 - `.ctxliteignore` narrows `trim_context` candidates (Priority: P3)

**Goal**: Both `trim_context` tool implementations (OpenCode, MCP) drop `.ctxliteignore`-matched candidate files before calling `trimFiles`, regardless of BM25 relevance.

**Independent Test**: Call the OpenCode `trim_context` tool (and separately the MCP `trim_context` tool) with a candidate list including a path matching a `*.generated.ts` pattern in a real temp-dir `.ctxliteignore`; confirm that file never appears in the selected output.

### Tests for User Story 2 (MANDATORY — Constitution Principle II) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [ ] T008 [P] [US2] Add a case to `packages/opencode/src/tools.test.ts`: with a real temp dir (used as the tool's effective `cwd`) containing a `.ctxliteignore` matching `*.generated.ts`, `trimContextTool.execute` with a candidate list including a `*.generated.ts` file excludes it from `result.files`/the selected output regardless of its content's relevance to `query` (SC-003).
- [ ] T009 [P] [US2] Add the equivalent case to `packages/mcp/src/tools/trim-context.test.ts`: `handleTrimContext` excludes a `.ctxliteignore`-matched candidate from the "Selected" section of its returned text, regardless of relevance (SC-003).

### Implementation for User Story 2

- [ ] T010 [US2] Modify `packages/opencode/src/tools.ts`'s `trimContextTool.execute`: before calling `trimFiles(codeFiles, query, { maxTokens })`, load `.ctxliteignore` patterns for the project root (use the same `cwd` source the tool already has available — `process.cwd()`, consistent with how `getStatsDbPath()` resolves project-relative paths elsewhere in this file) and filter `codeFiles` via `isIgnored` before scoring. Depends on T008 and Phase 2.
- [ ] T011 [US2] Mirror the same filtering in `packages/mcp/src/tools/trim-context.ts`'s `handleTrimContext`, before its `trimFiles` call. Depends on T009 and Phase 2.

**Checkpoint**: Both user stories independently functional — `.ctxliteignore` affects both precall reads and `trim_context` candidate selection, on every host.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T012 [P] Update `docs/architecture.md` and the `ctxlite-internals` skill (all three copies — `.claude/skills/ctxlite-internals/SKILL.md`, `.cursor/skills/ctxlite-internals/SKILL.md`, `.opencode/skills/ctxlite-internals/SKILL.md`) with a short note on `.ctxliteignore`'s existence and where its logic lives (`packages/core/src/ctxliteignore.ts`), consistent with that skill's existing pattern of documenting real shipped mechanisms.
- [ ] T013 [P] Update `README.md`'s feature list / usage section to mention `.ctxliteignore`, linking to `specs/018-ctxliteignore-support/contracts/ctxliteignore-format.md` for the format if a "docs" link is the project's existing convention (check how other features are documented in README.md first).
- [ ] T014 Run `npm run test:coverage` and confirm the 90% floor (Constitution Principle II) still holds for `packages/core`, `packages/opencode`, and `packages/mcp` after the new module and call-site changes.
- [ ] T015 Run `./scripts/ci.sh` (full local CI, matching what `pre-push` already runs) before considering this feature done.
- [ ] T016 Version bump: confirm current live versions via `npm view @ctxlite/core version` (and the other 3 packages) before bumping `config.version`, per the constitution's Release Discipline constraint — do not assume the last-known bumped value is still unpublished.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS both user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on US2.
- **User Story 2 (Phase 4)**: Depends on Foundational. No dependency on US1 (filters candidates independently of precall blocking — could in principle run before US1, though P1 ordering is recommended).
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Parallel Opportunities

- T002 (foundational test) has no other tasks to parallelize against within Phase 2 (T003/T004 depend on it directly).
- T005 [P] (US1 tests) and T008/T009 [P] (US2 tests) can be written in parallel by different people, since Phase 3 and Phase 4 don't depend on each other — only both depend on Phase 2.
- T012/T013 (Polish docs) can run in parallel with each other and with T014/T015 (CI/coverage are read-only checks, not edits).

---

## Parallel Example: Foundational + User Story 1

```bash
# After Phase 2 completes:
Task: "Add .ctxliteignore cases to packages/core/src/tool-precall.test.ts (T005)"
Task: "Add .ctxliteignore case to packages/opencode/src/tools.test.ts (T008)"
Task: "Add .ctxliteignore case to packages/mcp/src/tools/trim-context.test.ts (T009)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (trivial) + Phase 2 (foundational module + tests).
2. Complete Phase 3 (User Story 1 — precall blocking).
3. **STOP and VALIDATE**: confirm a `.ctxliteignore` with one pattern blocks a matching read on a live host (OpenCode or Claude Code), per spec.md's Independent Test for US1.
4. This alone is a complete, shippable increment — `trim_context` filtering (US2) is explicitly the lower-priority secondary mechanism per spec.md.

### Incremental Delivery

1. Setup + Foundational → core module ready, fully unit-tested.
2. Add User Story 1 → validate independently → this is the MVP.
3. Add User Story 2 → validate independently → full feature complete.
4. Polish (docs, coverage floor, CI, version bump).

---

## Notes

- [P] tasks touch different files with no dependency between them.
- Every implementation task has a preceding, explicitly-required test task — Constitution Principle II permits no exceptions for this project, regardless of what spec.md's own scope language says about priority.
- No task touches `trimmer.ts`/`bm25.ts` — filtering happens at the tool layer (Phase 4), per `research.md` Decision 2, keeping those modules' existing pure/filesystem-free tests untouched.
- Commit after each task or logical group, consistent with the project's existing small-commit convention observed in `git log`.
