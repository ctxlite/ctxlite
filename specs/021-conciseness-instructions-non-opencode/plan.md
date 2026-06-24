# Implementation Plan: Deliver Conciseness Instructions to Claude Code and Cursor

**Branch**: `main` (no dedicated feature branch — no branch-creation hook registered, consistent with `017`–`020`) | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-conciseness-instructions-non-opencode/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add two new ctxlite-owned, full-file install targets — `.claude/rules/ctxlite-conciseness.md` (Claude Code) and `.cursor/rules/ctxlite-conciseness.mdc` (Cursor) — that deliver the existing `CONCISENESS_INSTRUCTIONS` text (currently wired only into OpenCode's system prompt) to both hosts. Both rule-file mechanisms load unconditionally at session start (verified against Claude Code's current documentation during Phase 0 research below, and against this project's own already-working `.cursor/rules/*.mdc` files for Cursor), so no merge-into-shared-file logic is needed — this follows the exact same full-file-ownership pattern `packages/core/src/install/run.ts` already uses for `.claude/skills/ctxlite/SKILL.md`/`.cursor/skills/ctxlite/SKILL.md`, just with different content and two new paths.

## Technical Context

**Language/Version**: TypeScript (Node 18+ ESM), matching the rest of `@ctxlite/core`.

**Primary Dependencies**: None new — reuses the existing full-file read/write/idempotent-compare logic in `packages/core/src/install/run.ts` (`skillChange`/`isSkillKind`), generalized to cover two more file kinds with their own content.

**Storage**: Plain text files on disk (no database involvement) — `.claude/rules/ctxlite-conciseness.md` and `.cursor/rules/ctxlite-conciseness.mdc`, project or global scope per the existing `--scope` flag.

**Testing**: Vitest. Pure unit tests against `planInstall`/`applyInstall` (or whatever the existing skill-install tests target) with a real temp directory standing in for `homeDir`/`projectDir` — existing convention already used by `packages/core/src/install/*.test.ts` (no filesystem mocking, real `mkdtempSync` temp dirs, per `ctxlite-internals`).

**Target Platform**: Same as the rest of `packages/core/src/install/` — Node, cross-platform path handling already proven by the existing skill/hook/MCP install targets.

**Project Type**: Library feature within the existing monorepo (`@ctxlite/core`'s install module), exercised through `@ctxlite/cli`'s `install` subcommand — no new package.

**Performance Goals**: Negligible — one more small text file write per `ctxlite install` run, same cost class as the existing skill-file write.

**Constraints**: Must not touch the user's own `CLAUDE.md` or any pre-existing `.cursor/rules/*.mdc` file at all (FR-003) — the new files are separate, ctxlite-owned siblings, never merged into shared content. Must be byte-identical on re-run (idempotent, SC-002).

**Scale/Scope**: One new content module per host (~30-40 lines each, derived directly from the existing `CONCISENESS_INSTRUCTIONS` text), two new `ConfigKind` values, two new path resolvers in `paths.ts`, one generalization of `run.ts`'s skill-file-kind handling to also cover the two new kinds, new test cases in the existing install test suite.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Benefit** — What does this change achieve, measurably or directly
observably, and for whom?
Every Claude Code and Cursor user who runs `ctxlite install` gets the same token-efficiency system-prompt nudge (skip preamble/recap/sign-off, prefer inline comments, use smart_read/trim_context proactively) that OpenCode users already get automatically — directly closes the one part of the user's "always zero" investigation that real research showed was an actual, fixable gap (Investigation Finding #3), not a platform limitation.

**Risk** — What's the specific, most-likely-to-break thing? Which existing
behavior/test/host integration is in the blast radius?
The most-likely-to-break thing is accidentally touching the user's own `CLAUDE.md` or an existing `.cursor/rules/*.mdc` file instead of writing to a separate, ctxlite-owned path — mitigated by using brand-new dedicated filenames (`ctxlite-conciseness.md`/`.mdc`) under the same directories Claude Code's/Cursor's *rules* mechanism already scans, never touching `CLAUDE.md` itself or any other rule file by name. A second risk: assuming Claude Code's `.claude/rules/` behaves like documented without verifying — mitigated by real research (Phase 0 below cites the exact current-docs language confirming unconditional load). Existing `claude-code-skill`/`cursor-skill` install/uninstall tests are the regression boundary — adding two more full-file-ownership kinds must not change how skill files are planned/applied (different `ConfigKind` values, no shared code path conflict).

**Validation** — How was/will this be verified? Name the actual test(s)
or the actual live host check performed (not just "typecheck and test
pass").
New unit tests in the existing install test suite: `planInstall`/the apply step creates `.claude/rules/ctxlite-conciseness.md` with the expected content for `tool: "claude-code"`; creates `.cursor/rules/ctxlite-conciseness.mdc` with valid `alwaysApply: true` frontmatter for `tool: "cursor"`; re-running produces `action: "skip"` (idempotent, SC-002); an existing `CLAUDE.md`/other `.cursor/rules/*.mdc` file's content is provably untouched (read before and after, byte-equal) for both global and project scope. No live host session needed — this is a pure file-write change with no host-integration runtime surface (Claude Code/Cursor discover and load these files entirely on their own, per their own documented behavior; there's nothing in this change for ctxlite to run live to prove).

**Cross-tool availability** — Does this apply uniformly across every host
ctxlite supports (OpenCode, Claude Code, Cursor, Claude Desktop where
relevant)? If not, is the asymmetry a documented platform constraint or an
oversight to track as a follow-up task?
OpenCode already has this (the pre-existing system-prompt injection this spec is matching). Claude Code and Cursor gain it via this feature. Claude Desktop is explicitly out — it has no project-local filesystem install target at all (global-scope-only, MCP-server-config only, confirmed by `resolveConfigPath`'s existing `claude-desktop` branch throwing on `scope === "project"`) and no documented "always-loaded rules directory" equivalent; this is a pre-existing, already-accepted platform asymmetry for that host (it only ever gets `get_stats`/`trim_context`/`smart_read` via MCP, per the README's own host-capability table), not a new oversight introduced here.

*Gate result: PASS. No violations to justify.*

## Project Structure

### Documentation (this feature)

```text
specs/021-conciseness-instructions-non-opencode/
├── plan.md              # This file
├── spec.md              # Already written (includes Investigation Findings)
├── research.md          # Phase 0 output (rules-directory verification, content-source decision)
├── checklists/
│   └── requirements.md  # Already written, all items pass
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

No `data-model.md` (no entities — spec.md's Key Entities section is explicitly N/A), no `contracts/` (the two file formats themselves, plus spec.md's Acceptance Scenarios, already fully describe the "interface" — a plain Markdown file and an `.mdc` file with two frontmatter fields, both copying an existing, already-proven format), and no `quickstart.md` for the same reason already used in `018`–`020` (Acceptance Scenarios already give runnable before/after checks).

### Source Code (repository root)

```text
packages/core/src/install/
├── conciseness-rule-content.ts   # NEW — CLAUDE_CODE_CONCISENESS_RULE_CONTENT, CURSOR_CONCISENESS_RULE_CONTENT (derived from packages/opencode/src/system-prompt.ts's CONCISENESS_INSTRUCTIONS)
├── types.ts                      # MODIFIED — two new ConfigKind values: "claude-code-conciseness-rule", "cursor-conciseness-rule"
├── paths.ts                      # MODIFIED — two new path resolvers + two new entries in buildTargets' claude-code/cursor branches
├── run.ts                        # MODIFIED — generalize the existing skill-file full-ownership read/compare/write logic to also cover the two new kinds (different content per kind, same idempotent-compare shape)
└── *.test.ts                     # MODIFIED — new cases (existing install test file(s); exact filename matched to wherever claude-code-skill/cursor-skill are currently tested)
```

**Structure Decision**: New content lives in a new `conciseness-rule-content.ts` module (mirroring `skill-content.ts`'s existing role) rather than importing directly from `packages/opencode/src/system-prompt.ts`, since `@ctxlite/core` cannot depend on `@ctxlite/opencode` (the dependency direction is the other way — Principle IV, Core-First Architecture) — the text itself is duplicated by value (a constant copied once, not re-exported), the same way the OpenCode-specific `CONCISENESS_INSTRUCTIONS` constant is itself self-contained today. No new package, no new top-level directory — everything lives inside the existing `packages/core/src/install/` module that already owns every other install target.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally left empty.
