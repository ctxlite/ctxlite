# Implementation Plan: `.ctxliteignore` Support

**Branch**: `main` (no dedicated feature branch — no branch-creation hook registered, consistent with how `017-better-sqlite3-security-audit` was handled) | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-ctxliteignore-support/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add an optional, project-root `.ctxliteignore` file (gitignore-style patterns) that extends `optimizeReadPath`'s existing hardcoded `BLOCKED_READ_PATTERNS` list with project-specific paths, and that `trim_context` (both OpenCode and MCP tool implementations) checks before BM25 scoring. A new core module owns pattern loading/matching, kept filesystem-aware logic separate from the existing pure scoring (`trimmer.ts`) and pure pattern-checking (`tool-precall.ts`) modules, so neither of those needs new test-setup complexity (cwd mocking) for something they don't otherwise need.

## Technical Context

**Language/Version**: TypeScript (Node 18+ ESM), matching the rest of `@ctxlite/core`.

**Primary Dependencies**: None new — a hand-rolled, deliberately limited glob-to-regex converter (supporting `*`, `**`, trailing `/` for directory matches, `#` comments, blank lines), not a full gitignore-spec parser. No `minimatch`/`micromatch`/`ignore` package added, per the constitution's "minimize external dependencies" constraint (`.cursor/rules/security.mdc`) and because full gitignore semantics (negation `!pattern`, complex anchoring) are out of scope for what this feature actually needs.

**Storage**: N/A — reads a plain text file (`.ctxliteignore`) from the project root; no database/schema involvement.

**Testing**: Vitest, consistent with the rest of the monorepo. The new core module is pure-function-testable (pass a `cwd` pointing at a real temp directory with a `.ctxliteignore`, per the project's existing "never mock the filesystem, use real temp dirs" convention — see `ctxlite-internals` skill).

**Target Platform**: Same as the rest of ctxlite — Node (CLI, MCP, Claude Code/Cursor hook bridges) and Bun (OpenCode plugin runtime). The pattern-matching logic itself has no runtime-specific dependency (no native module), so it works identically on both.

**Project Type**: Library feature within the existing monorepo (`@ctxlite/core`), consumed by `@ctxlite/opencode` and `@ctxlite/mcp`'s existing tool implementations and by `@ctxlite/core`'s own `optimizeReadPath`.

**Performance Goals**: Negligible added latency — one synchronous file-existence check (and a small-file read when present) per precall/trim_context call. No caching across calls in v1, per spec SC-001 ("read fresh per call, not cached at host-startup") — this is a deliberate simplicity tradeoff; revisit only if profiling ever shows it matters (unlikely for a file typically under 1KB).

**Constraints**: Must not change behavior at all for the common case (no `.ctxliteignore` present) — spec SC-002. Must not throw on a malformed file — spec FR-005.

**Scale/Scope**: One new core module (~40-60 lines), one new test file, small call-site additions in `optimizeReadPath`/`optimizeToolArgs`, and in the two `trim_context` tool implementations (OpenCode, MCP). No changes to `trimmer.ts`/`bm25.ts` themselves (filtering happens at the tool layer, before `trimFiles` is called — see Risk below).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Benefit** — What does this change achieve, measurably or directly
observably, and for whom?
A maintainer with project-specific generated/vendor directories (e.g. a Go `vendor/`, a generated-migrations folder) not covered by ctxlite's hardcoded blocked-path list can exclude them with one line in `.ctxliteignore`, without filing a ctxlite issue or waiting for a hardcoded-pattern update — directly reduces wasted context the same way the existing `node_modules/` block already does, just project-customizable.

**Risk** — What's the specific, most-likely-to-break thing? Which existing
behavior/test/host integration is in the blast radius?
Two specific risks, both mitigated by the design: (1) A buggy glob-to-regex conversion could over-match and block a path the agent legitimately needs — mitigated by deliberately supporting only a small, well-tested pattern subset (no negation, no complex anchoring) rather than attempting full gitignore compatibility, and by every pattern being purely additive (never removes an existing capability — worst case is a missed read, not a corrupted one, mirroring `tool-precall.ts`'s existing "missed optimization is harmless, wrong action isn't" philosophy). (2) Putting the filtering inside `trimFiles`/`trimmer.ts` itself would force filesystem-awareness (and therefore cwd-mocking) into a module whose tests are currently pure and filesystem-free — mitigated by filtering at the *tool* layer (`tools.ts` in OpenCode, `trim-context.ts` in MCP) before calling `trimFiles`, keeping `trimmer.ts` unchanged and its existing tests valid as-is.

**Validation** — How was/will this be verified? Name the actual test(s)
or the actual live host check performed (not just "typecheck and test
pass").
New unit tests in `packages/core/src/ctxliteignore.test.ts` covering: pattern parsing (comments, blank lines, malformed lines skipped per FR-005), directory-pattern matching, no-file-present behavior (FR-004), and Windows-path normalization (Edge Cases). `optimizeReadPath`'s existing test file gains cases for `.ctxliteignore`-sourced blocks alongside its built-in-pattern cases. The two `trim_context` tool test files (OpenCode, MCP) gain a case confirming a `.ctxliteignore`-matched candidate is excluded regardless of BM25 relevance (spec SC-003) — this can use a real temp directory with a real `.ctxliteignore` file, consistent with the project's no-filesystem-mocking convention; no live host session needed since this doesn't change host-integration behavior (the hook/tool call shape is unchanged, only the internal blocking decision).

**Cross-tool availability** — Does this apply uniformly across every host
ctxlite supports (OpenCode, Claude Code, Cursor, Claude Desktop where
relevant)? If not, is the asymmetry a documented platform constraint or an
oversight to track as a follow-up task?
`optimizeReadPath`'s extended blocking applies uniformly to every host that already uses precall (OpenCode, Claude Code, Cursor) — it's the same shared `@ctxlite/core` function every host's hook bridge already calls. `trim_context` filtering applies to every host that has the tool (OpenCode plugin tool, MCP tool — which covers Claude Code, Cursor, and Claude Desktop). No host is left out; this is a `@ctxlite/core` change consumed identically everywhere per Principle IV (Core-First Architecture).

*Gate result: PASS. No violations to justify.*

## Project Structure

### Documentation (this feature)

```text
specs/018-ctxliteignore-support/
├── plan.md              # This file
├── spec.md              # Already written
├── research.md          # Phase 0 output (glob-subset decision, file-location decision)
├── data-model.md         # Phase 1 output (IgnorePattern, CtxliteignoreFile entities)
├── contracts/
│   └── ctxliteignore-format.md   # The .ctxliteignore file format itself — the actual "interface contract" with users for this feature
├── checklists/
│   └── requirements.md  # Already written, all items pass
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

No `quickstart.md` — the contracts file already documents how a maintainer uses this end-to-end (add a line, see it take effect), which is the same content a quickstart would otherwise duplicate.

### Source Code (repository root)

```text
packages/core/src/
├── ctxliteignore.ts          # NEW — loadIgnorePatterns(cwd), isIgnored(path, patterns)
├── ctxliteignore.test.ts     # NEW
├── tool-precall.ts           # MODIFIED — optimizeReadPath/optimizeToolArgs gain an optional cwd param, check ctxliteignore patterns in addition to BLOCKED_READ_PATTERNS
├── tool-precall.test.ts      # MODIFIED — new cases
└── index.ts                  # MODIFIED — export the two new ctxliteignore.ts functions

packages/opencode/src/
├── tools.ts                  # MODIFIED — trimContextTool.execute filters candidates via isIgnored before trimFiles
└── tools.test.ts             # MODIFIED — new case

packages/mcp/src/tools/
├── trim-context.ts           # MODIFIED — same filtering, mirrored
└── trim-context.test.ts      # MODIFIED — new case
```

**Structure Decision**: New logic lives in a dedicated `packages/core/src/ctxliteignore.ts` module rather than inside `tool-precall.ts` or `trimmer.ts` directly — it has a distinct concern (filesystem-aware pattern loading) from both call sites that consume it, and this keeps `trimmer.ts` filesystem-free (Risk above). Exported from `@ctxlite/core`'s `index.ts` per Principle IV, consumed by `tool-precall.ts` internally and by the two `trim_context` tool implementations directly.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally left empty.
