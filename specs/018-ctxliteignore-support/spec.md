# Feature Specification: `.ctxliteignore` Support

**Feature Branch**: `018-ctxliteignore-support`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: a Romanian-language optimization-advice document (apparently AI-generated, possibly by a different analysis tool reading the user's own ctxlite stats) suggesting several ways to improve savings, including "add a `.ctxliteignore` (or equivalent) for generated files, `node_modules`, build artifacts — reduces what enters BM25 selection." Several other claims in the same input do not match ctxlite's actual architecture (see Assumptions/Out of Scope below) and are explicitly excluded from this spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Project maintainer excludes project-specific generated paths (Priority: P1)

A maintainer has project-specific generated/vendor directories that aren't already covered by ctxlite's built-in blocked-path list (`node_modules/`, `.git/`, `dist/`, `build/`, lockfiles, `*.min.js`) — for example a `vendor/` directory in a Go or PHP project, or a `migrations/generated/` directory. They add a `.ctxliteignore` file (gitignore-style patterns) at their project root so the agent's `read`/`glob` calls into those paths get blocked the same way `node_modules/` already is, without needing a ctxlite code change for every project's specific layout.

**Why this priority**: This is the only concretely actionable, technically-grounded idea in the source feedback — it extends an existing, already-shipped mechanism (`optimizeReadPath`'s blocked-path list) to be project-configurable instead of hardcoded, which is a real, bounded gap.

**Independent Test**: Create a `.ctxliteignore` with one pattern, attempt to read a matching path through the precall hook, confirm it's blocked exactly like an `optimizeReadPath` built-in pattern is today (same block message format, same token-savings logging).

**Acceptance Scenarios**:

1. **Given** a `.ctxliteignore` containing `vendor/`, **When** the agent's `read` tool targets `vendor/some-lib/file.go`, **Then** the read is blocked with the same `[ctxlite] Blocked read of low-signal path` message `optimizeReadPath`'s built-in patterns already produce.
2. **Given** no `.ctxliteignore` file exists in the project, **When** any read happens, **Then** behavior is unchanged from today (only the built-in patterns apply) — this feature is additive, never required.
3. **Given** a `.ctxliteignore` with an invalid/malformed line, **When** ctxlite parses it, **Then** that line is skipped (logged at most, never thrown) and every other valid pattern still applies — a typo in the ignore file must not disable the whole feature or crash the host.

---

### User Story 2 - `.ctxliteignore` also narrows `trim_context` candidates (Priority: P3)

When an agent calls `trim_context` with a list of candidate files, files matching `.ctxliteignore` patterns are dropped before BM25 scoring runs, so they don't consume scoring time or occupy a slot in the selected set.

**Why this priority**: Lower than User Story 1 — `trim_context` already receives a curated list from the calling agent (it doesn't scan the filesystem itself), so the caller is the more direct point of control; this is a secondary safety net, not the primary mechanism.

**Independent Test**: Call `trim_context` with a file list that includes a `.ctxliteignore`-matched path; confirm that file is excluded from the result the same way a low-relevance file would be, without needing to crank up `maxTokens` or rely on BM25 scoring it out by chance.

**Acceptance Scenarios**:

1. **Given** a `.ctxliteignore` matching `*.generated.ts`, **When** `trim_context` is called with a candidate list including a `*.generated.ts` file, **Then** that file is excluded from the selected set regardless of its BM25 relevance score.

### Edge Cases

- What happens when `.ctxliteignore` exists but is empty? → No additional patterns apply; built-in blocked patterns still apply. Not an error.
- What happens when a pattern in `.ctxliteignore` would block a file the agent explicitly, deliberately needs (e.g. the user asks "show me the generated file X")? → Out of scope for this spec to solve generally; this is the same tradeoff `optimizeReadPath`'s existing built-in patterns already accept (a blocked read returns a message instructing the agent not to work around the block, consistent with current behavior) — `.ctxliteignore` doesn't need new conflict-resolution behavior beyond what already exists.
- What happens on Windows path separators? → Patterns are matched against the path after normalizing `\` to `/` (already established behavior in `optimizeReadPath`'s `BLOCKED_READ_PATTERNS` normalization).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support an optional `.ctxliteignore` file at the project root, using gitignore-style glob patterns (one per line, `#` for comments, blank lines ignored).
- **FR-002**: When `.ctxliteignore` is present, every pattern in it MUST be checked by `optimizeReadPath` in addition to (not instead of) the existing built-in `BLOCKED_READ_PATTERNS`.
- **FR-003**: A read blocked by a `.ctxliteignore` pattern MUST log the same way a built-in-pattern block does today (same `source: "precall"`, same token-savings estimate, same host/session tagging) — no new logging category.
- **FR-004**: A missing `.ctxliteignore` file MUST NOT be treated as an error — it's the common case (most projects won't have one) and must be silent.
- **FR-005**: A malformed line in `.ctxliteignore` MUST be skipped without throwing, and MUST NOT prevent other valid lines in the same file from taking effect.
- **FR-006**: `trim_context` (both the OpenCode and MCP tool implementations) MUST drop candidate files matching `.ctxliteignore` patterns before BM25 scoring, when such a file is present in the project.
- **FR-007 (explicitly out of scope)**: This spec does NOT implement: a per-agent `dcp` configuration flag (no such mechanism exists anywhere in ctxlite's actual codebase — this appears to be a hallucinated detail in the source feedback, not a real ctxlite feature to extend), MCP-server-disabling guidance (a user workflow choice, not a ctxlite feature), or a quiet-flag rewrite for `git log` (unlike `npm test --silent`, there is no git flag that suppresses verbosity while preserving the information an agent likely needs from `git log` — rewriting it risks hiding information rather than just noise, which fails this project's own Implementation Heuristic Gate Risk question).

### Key Entities

- **`.ctxliteignore` file**: A project-root, gitignore-syntax file, parsed once per process (or per relevant call) into a list of glob patterns.
- **Ignore pattern**: A single line from the file, compiled to the same kind of matcher `BLOCKED_READ_PATTERNS` already uses internally.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maintainer can add one line to `.ctxliteignore` and see a matching read blocked on the very next agent turn, without restarting any host process (the file is read fresh per call, not cached at host-startup).
- **SC-002**: Projects without a `.ctxliteignore` file see zero behavior change and zero added latency from this feature (file-existence check is the only added cost).
- **SC-003**: A `trim_context` call with `.ctxliteignore`-matched candidates never includes those files in its selected output, verified independent of BM25 score (i.e., even a high-relevance match is still excluded).

## Assumptions

- The source feedback this spec is derived from appears to be AI-generated commentary (possibly from a different tool analyzing the user's ctxlite usage), not a direct ctxlite feature request — several of its specifics don't correspond to anything in ctxlite's real codebase: `agents.coder.dcp: true` is not a real configuration key anywhere in `@ctxlite/opencode`/`@ctxlite/core`, and "PreToolUse hooks registered in opencode.json" describes Claude Code's hook config convention (`.claude/settings.json`), not OpenCode's (which registers hooks via the plugin's exported `tool.execute.before` function, never through `opencode.json`). This spec implements only the one suggestion that's concretely actionable and grounded in real code: `.ctxliteignore`.
- The "precall shows 0 rewrites" observation in the source feedback was already investigated live earlier in this project's history (a real headless OpenCode session confirmed the precall mechanism works correctly end-to-end) — the most likely explanation is that the specific session being measured simply didn't run any bash command matching a supported quiet-flag pattern, not a defect. This spec does not re-open that investigation.
- `.ctxliteignore` pattern syntax reuses gitignore conventions (already familiar to every target user) rather than inventing a new syntax.
