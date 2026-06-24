# Implementation Plan: Precall Quiet-Flag Coverage for Direct Test-Runner/Linter Invocations

**Branch**: `main` (no dedicated feature branch — no branch-creation hook registered, consistent with how `017`/`018` were handled) | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-precall-test-runner-coverage/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add three new quiet-flag rules to `optimizeBashCommand`'s existing `matchQuietPattern` if/else chain: direct `vitest`/`npx vitest` invocations get `--reporter=dot`, direct `jest`/`npx jest` invocations get `--silent`, direct `eslint`/`npx eslint` invocations get `--quiet`. This closes the one concretely validated gap from spec.md's Investigation Findings — this repo's own dev workflow runs these tools directly (not through `npm test`/`npm run lint` wrappers that already match), so precall showed 0 rewrites for exactly the commands that dominate this project's real usage.

## Technical Context

**Language/Version**: TypeScript (Node 18+ ESM), matching the rest of `@ctxlite/core`.

**Primary Dependencies**: None new — three additional regex/flag branches in the existing `matchQuietPattern` function in `packages/core/src/tool-precall.ts`, following the exact pattern every prior quiet-flag rule (cargo, dotnet, mvn/gradle) already uses.

**Storage**: N/A.

**Testing**: Vitest, consistent with the rest of the monorepo. Pure unit tests against `optimizeBashCommand`/`matchQuietPattern` — no filesystem, no host integration needed, since this is a string-rewriting function with no I/O.

**Target Platform**: Same as the rest of `tool-precall.ts` — Node (CLI/MCP hook bridges) and Bun (OpenCode plugin runtime). No runtime-specific dependency.

**Project Type**: Library feature within the existing monorepo (`@ctxlite/core`), consumed unchanged by every host's existing precall hook bridge (no call-site changes needed — `optimizeBashCommand` is already wired everywhere `optimizeToolArgs` routes `tool === "bash"`).

**Performance Goals**: Negligible — three more regex tests per bash command, same cost profile as the 17 existing branches.

**Constraints**: Must not change behavior for any currently-matched command (SC-002) — the new branches go at the end of the if/else chain (or wherever ordering can't shadow an existing rule) and use word-boundary-anchored patterns scoped tightly to `vitest`/`jest`/`eslint` token names, which don't overlap any existing pattern's keywords.

**Scale/Scope**: ~15-25 new lines in `matchQuietPattern`, 3 new `PRECALL_ESTIMATES` entries, new test cases in the existing `tool-precall.test.ts` (no new test file — same file every other quiet-flag rule's tests already live in).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Benefit** — What does this change achieve, measurably or directly
observably, and for whom?
Any agent session (on any host) running `npx vitest run`, `vitest`, `npx jest`, `jest`, `eslint`, or `npx eslint` directly — which is this project's own actual dev workflow, not a hypothetical — gets its output quieted by precall instead of relying entirely on post-hoc `compress`. Concretely closes the exact gap the user identified in real `--by-session` output (a Claude Code session with 15 requests, 0 precall, 15 compress).

**Risk** — What's the specific, most-likely-to-break thing? Which existing
behavior/test/host integration is in the blast radius?
The most-likely-to-break thing is a new rule accidentally shadowing or double-matching against an existing rule (e.g. if `eslint`'s pattern were loose enough to also match inside a `make`/`vite build` command string). Mitigated by scoping each new regex to a word-boundary match on the exact binary name (`\bvitest\b`, `\bjest\b`, `\beslint\b`) — none of the 17 existing patterns' keywords contain these substrings, so there's no overlap risk. A second risk: `vitest watch`/interactive modes getting a flag that doesn't fit a long-running process — mitigated by explicitly excluding `watch` as a token in the vitest pattern (FR-001's "with or without `run`" excludes `watch` per the Edge Cases section). Existing behavior is protected by SC-002 — the full pre-existing `tool-precall.test.ts` suite must still pass unmodified.

**Validation** — How was/will this be verified? Name the actual test(s)
or the actual live host check performed (not just "typecheck and test
pass").
New test cases added to `packages/core/src/tool-precall.test.ts`'s existing `describe("optimizeBashCommand", ...)` block: bare `vitest`, `npx vitest run`, already-quiet `vitest --reporter=dot` (no-op), `vitest watch` (must NOT be rewritten), `npx jest`, already-silent `jest --silent` (no-op), `eslint .`, already-quiet `npx eslint --quiet .` (no-op), and one chained-command case (`cd packages/core && npx vitest run | tail -20`) reusing the project's existing segment-aware-rewrite test pattern. No live host check needed — this is a pure function change with no new host-integration surface (every host already routes through `optimizeBashCommand` for `tool === "bash"`); the next time this project's own CI/dev workflow runs `npx vitest run` under an instrumented host session, `ctxlite stats --by-session` will show it (SC-003), which is the real-world confirmation, but isn't a precondition for considering the spec done.

**Cross-tool availability** — Does this apply uniformly across every host
ctxlite supports (OpenCode, Claude Code, Cursor, Claude Desktop where
relevant)? If not, is the asymmetry a documented platform constraint or an
oversight to track as a follow-up task?
Yes, uniformly — `optimizeBashCommand` is called by every host's precall hook bridge through the same `optimizeToolArgs` dispatcher in `@ctxlite/core` (Claude Code's `hook.ts`, Cursor's `cursor-hook.ts`, OpenCode's `tool-precall-hook.ts`). No host-specific code path exists for bash-command rewriting, so this change is automatically available everywhere as soon as `@ctxlite/core` ships it — no host is left out.

*Gate result: PASS. No violations to justify.*

## Project Structure

### Documentation (this feature)

```text
specs/019-precall-test-runner-coverage/
├── plan.md              # This file
├── spec.md              # Already written (includes Investigation Findings)
├── research.md          # Phase 0 output (exact flag/pattern decisions)
├── checklists/
│   └── requirements.md  # Already written, all items pass
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

No `data-model.md` (no entities — Key Entities section of spec.md is explicitly N/A), no `contracts/` (no user-facing file format or API surface — this is an internal rewrite-rule addition, not a new interface), and no `quickstart.md` — spec.md's Acceptance Scenarios already give exhaustive, runnable before/after examples for every new rule (the same content a quickstart would otherwise duplicate, same reasoning `018-ctxliteignore-support/plan.md` used to skip its own quickstart).

### Source Code (repository root)

```text
packages/core/src/
├── tool-precall.ts       # MODIFIED — 3 new branches in matchQuietPattern, 3 new PRECALL_ESTIMATES entries
└── tool-precall.test.ts  # MODIFIED — new cases in the existing optimizeBashCommand describe block
```

**Structure Decision**: All changes live in the single existing `tool-precall.ts` module — no new module, no new call sites, since `optimizeBashCommand` is already the one place every host's bash-command rewriting flows through (Principle IV, Core-First Architecture). This is the smallest possible change that closes the validated gap.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally left empty.
