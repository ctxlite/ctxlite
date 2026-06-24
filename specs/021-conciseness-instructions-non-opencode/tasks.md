---

description: "Task list for delivering conciseness instructions to Claude Code and Cursor"
---

# Tasks: Deliver Conciseness Instructions to Claude Code and Cursor

**Input**: Design documents from `/specs/021-conciseness-instructions-non-opencode/`

**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: MANDATORY for this repository (Constitution Principle II — Test-First, Zero Skipped Tests). Every implementation task below has a preceding test task, written and passing before the task is marked done.

**Organization**: spec.md has a single user story (Priority: P1) covering both hosts together — they ship as one coherent change, not two independently-deliverable increments, since both reuse the same generalized install logic and the same source text.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (the only user story)

## Phase 1: Setup

**Purpose**: Confirm the exact current install-target counts this plan modifies haven't drifted.

- [X] T001 Confirm `buildTargets(["claude-code"], ...)` and `buildTargets(["cursor"], ...)` each currently return exactly 3 targets (`mcp`/`hooks`/`skill`), and confirm `install.test.ts`'s existing "returns ten targets for all tools" test still says ten — both will need updating once a 4th target per host is added — no file changes yet.

---

## Phase 2: User Story 1 - Claude Code and Cursor sessions receive the same conciseness instructions OpenCode sessions already get (Priority: P1) 🎯 MVP

**Goal**: `ctxlite install --tool claude-code` writes `.claude/rules/ctxlite-conciseness.md`; `ctxlite install --tool cursor` writes `.cursor/rules/ctxlite-conciseness.mdc` — both containing the same conciseness instructions OpenCode's system prompt already gets, both idempotent and cleanly removable, neither touching any other file.

**Independent Test**: `ctxlite install --tool claude-code --scope project --yes` in a fresh temp dir creates `.claude/rules/ctxlite-conciseness.md` containing the instructions; running again is a no-op (`action: "skip"`); `--remove` deletes it cleanly.

### Tests for User Story 1 (MANDATORY — Constitution Principle II) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [X] T002 [P] [US1] In `packages/core/src/install/install.test.ts`, update the existing "returns ten targets for all tools" test (around the `describe` block listing target counts) to expect **twelve** targets (claude-code and cursor each gain one more), and add a new assertion confirming the new 4th target's `kind` is `"claude-code-conciseness-rule"` / `"cursor-conciseness-rule"` respectively, alongside the existing per-tool target-count tests (mirroring the existing "also targets settings.json and a skill file for claude-code" style of test).
- [X] T003 [P] [US1] In the same file, add path-resolution tests mirroring the existing skill-path tests: claude-code's conciseness-rule path resolves to `.claude/rules/ctxlite-conciseness.md` (project) / `~/.claude/rules/ctxlite-conciseness.md` (global, using the temp `homeDir`); cursor's resolves to `.cursor/rules/ctxlite-conciseness.mdc` (project) / global equivalent.
- [X] T004 [US1] In the same file, add a new `describe("conciseness rule install (claude-code-conciseness-rule / cursor-conciseness-rule)", ...)` block (mirroring the existing skill-install describe block's structure) with cases: `runInstall({ tools: ["claude-code"], ... })` creates `.claude/rules/ctxlite-conciseness.md` whose content contains the same key phrases `CONCISENESS_INSTRUCTIONS` has (e.g. "Skip preamble", "Skip recap"); `runInstall({ tools: ["cursor"], ... })` creates `.cursor/rules/ctxlite-conciseness.mdc` whose content has `alwaysApply: true` in its frontmatter and the same instruction text in its body; re-running either is idempotent (`action: "skip"`, second call); `remove: true` deletes the file (`action: "remove"`, file no longer readable); a pre-existing, unrelated file at the project's `CLAUDE.md` path (and a pre-existing unrelated `.cursor/rules/security.mdc`-style file) is read before and after install and asserted byte-identical, proving FR-003's "never touches shared content" claim directly rather than just by absence of errors. Depends on T002/T003 (must fail first).

### Implementation for User Story 1

- [X] T005 [P] [US1] Create `packages/core/src/install/conciseness-rule-content.ts` exporting `CLAUDE_CODE_CONCISENESS_RULE_CONTENT` (plain Markdown, no frontmatter needed since `.claude/rules/*.md` files without `paths` frontmatter load unconditionally per research.md Decision 1) and `CURSOR_CONCISENESS_RULE_CONTENT` (`.mdc` with `---\ndescription: ...\nalwaysApply: true\n---` frontmatter, matching this project's own `.cursor/rules/security.mdc` format) — both bodies are the conciseness instructions, copied by value from `packages/opencode/src/system-prompt.ts`'s `CONCISENESS_INSTRUCTIONS` text (not imported — research.md Decision 2, core cannot depend on the opencode package). Depends on T004 (test references the expected phrases).
- [X] T006 [US1] In `packages/core/src/install/types.ts`, add `"claude-code-conciseness-rule"` and `"cursor-conciseness-rule"` to the `ConfigKind` union. Depends on T002.
- [X] T007 [US1] In `packages/core/src/install/paths.ts`, add `resolveClaudeCodeConcisenessRulePath(scope, ctx)` (→ `.claude/rules/ctxlite-conciseness.md` project, `~/.claude/rules/ctxlite-conciseness.md` global) and `resolveCursorConcisenessRulePath(scope, ctx)` (→ `.cursor/rules/ctxlite-conciseness.mdc` project, `~/.cursor/rules/ctxlite-conciseness.mdc` global), mirroring `resolveClaudeCodeSkillConfigPath`/`resolveCursorSkillConfigPath`'s exact structure. Add one new target entry to `buildTargets`'s `claude-code` branch (`kind: "claude-code-conciseness-rule"`) and `cursor` branch (`kind: "cursor-conciseness-rule"`). Depends on T003/T006.
- [X] T008 [US1] In `packages/core/src/install/run.ts`, generalize the existing `SKILL_KINDS`/`isSkillKind`/`skillChange` full-file-ownership logic (research.md Decision 3) to a lookup covering all 5 kinds now (3 skill + 2 conciseness-rule) — e.g. a `Record<ConfigKind, string>`-shaped map from kind to its expected content constant, with `isSkillKind` renamed/generalized to something like `isFullFileKind` checking membership in that map's keys, and `skillChange` taking the looked-up expected content as a parameter instead of hardcoding `CTXLITE_SKILL_CONTENT`. Update both `planInstall` and `runInstall`'s `isSkillKind(...)` branches to use the generalized check/write so the new kinds get created/skipped/removed through the exact same code path skills already use. Depends on T005/T006/T007.

**Checkpoint**: User Story 1 fully functional and independently testable — `ctxlite install --tool claude-code`/`--tool cursor` both deliver the conciseness instructions, idempotently, removably, without touching any other file; all pre-existing skill-install tests still pass unmodified.

---

## Phase 3: Polish & Cross-Cutting Concerns

- [X] T009 Run the full existing `install.test.ts` (and the rest of the monorepo's test suite) and confirm every pre-existing test case — including the now-updated "ten/twelve targets" test from T002 — passes; this is the literal verification of SC-002 (idempotency) and "no regression to skill installation."
- [X] T010 Run `npm run test:coverage` and confirm `packages/core` stays at/above the 90% floor (Constitution Principle II).
- [X] T011 Run `./scripts/ci.sh` (full local CI) before considering this feature done.
- [X] T012 Update `docs/contributing.md` or the relevant install-documentation section (wherever the skill-install targets are currently documented, if anywhere) to mention the new conciseness-rule targets — check first whether such documentation exists before adding it.
- [X] T013 Version bump: confirm current live versions via `npm view @ctxlite/core version` (and the other 3 packages) before bumping `config.version`, per the constitution's Release Discipline constraint — do not assume the last-known bumped value (0.1.32) is still unpublished.
- [X] T014 Add a CHANGELOG.md entry under the new version describing the new conciseness-rule install targets, citing this spec and explicitly noting the answer to the user's original "is it a bug?" question (smart_read/trim → host-label artifact; prune/compact → confirmed platform limitation; concise → now closed for instruction delivery).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **User Story 1 (Phase 2)**: Depends on Setup. The only story — no cross-story dependencies to manage.
- **Polish (Phase 3)**: Depends on User Story 1 being complete.

### Parallel Opportunities

- T002 [P], T003 [P] (target-count and path-resolution tests, same file but independent assertions) can be written in parallel.
- T005 [P] (content module) can be implemented in parallel with T006 (types.ts) — different files, no dependency between them; T007 depends on both being done first (needs the new `ConfigKind` values and references the content module indirectly via T008's lookup).

---

## Parallel Example: User Story 1 tests

```bash
# Can run in parallel:
Task: "Update target-count test to twelve, assert new kind values (T002)"
Task: "Add path-resolution tests for the 2 new rule paths (T003)"
```

---

## Implementation Strategy

### MVP First (and Only)

1. Complete Phase 1 (trivial sanity check).
2. Complete Phase 2: User Story 1 — the entire feature, both hosts, since they ship together.
3. **STOP and VALIDATE**: confirm both hosts' rule files are created correctly, idempotently, removably, with zero impact on any other file or any pre-existing skill-install behavior.
4. Polish (full suite, coverage, CI, docs, version bump, CHANGELOG).

### Incremental Delivery

Not applicable in the usual multi-story sense here — both hosts are delivered together as one change, per spec.md's own framing (a single P1 story). The natural incremental boundary, if ever needed, would be doing one host's path/content/test trio (e.g. T005/T007's claude-code half) before the other's (cursor half) — both are marked where they'd split if that became useful, but the plan doesn't require it.

---

## Notes

- [P] tasks touch different files or independent assertions within the same file with no dependency between them.
- Every implementation task has a preceding, explicitly-required test task — Constitution Principle II permits no exceptions.
- T008 (generalizing `run.ts`) is the one task every other implementation task in this story converges on — it's where the new kinds actually become live, writable install targets, not just declared types/paths/content sitting unused.
