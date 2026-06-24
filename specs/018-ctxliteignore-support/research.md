# Research: `.ctxliteignore` Support

No `[NEEDS CLARIFICATION]` markers exist in spec.md or plan.md's Technical Context — this phase documents the two real design decisions made while writing the plan, for traceability.

## Decision 1: Pattern syntax — limited subset, not full gitignore spec

**Decision**: Support only `*` (any characters except `/`), `**` (any characters including `/`), a trailing `/` to mean "this directory and everything under it", `#`-prefixed comment lines, and blank lines. No negation (`!pattern`), no `**/` at the start of a pattern as a special case beyond what the general `**` handling already covers, no `.gitignore`-style anchoring nuances (e.g. a pattern containing `/` elsewhere being treated as repo-root-relative vs. a bare filename matching anywhere).

**Rationale**: Full gitignore semantics are a genuinely large spec with many edge cases (see `git help gitignore`) — implementing it correctly would mean either a new dependency (against the constitution's "minimize external dependencies" constraint) or a much larger, harder-to-verify hand-rolled parser. The feature's actual goal (block a few extra project-specific directories/file patterns) doesn't need full compatibility. This mirrors the project's existing precedent of deliberately conservative, well-tested subsets over completeness (`stripEmbeddedText`'s "best-effort" framing in `ctxlite-internals`).

**Alternatives considered**:
- Add the `ignore` npm package (the de facto standard gitignore-matching library): rejected — a new dependency for a feature this small, and the constitution requires justifying any new dependency; the limited subset covers the actual use case spec.md describes (directory exclusions, simple glob file patterns) without one.
- Reuse `BLOCKED_READ_PATTERNS`'s raw-regex-literal convention (users write a JS regex in the file instead of glob syntax): rejected — regex syntax is a much higher barrier for the target user (a maintainer adding one line, not a ctxlite contributor) than gitignore syntax, which the spec's Assumptions section already commits to ("reuses gitignore conventions, already familiar to every target user").

## Decision 2: Where filtering happens for `trim_context`

**Decision**: Filter the candidate `files` array inside each `trim_context` tool implementation (OpenCode's `tools.ts`, MCP's `trim-context.ts`), immediately before calling `trimFiles()` — not inside `trimFiles()`/`trimmer.ts` itself.

**Rationale**: `trimmer.ts` and `bm25.ts` are currently pure, filesystem-free, and independently unit-tested with synthetic `CodeFile[]` arrays. Pulling `.ctxliteignore` loading into `trimFiles()` would force every existing and future `trimmer.test.ts` case to either mock or provide a `cwd`, for a concern (filesystem access) those tests don't otherwise have. Filtering at the tool layer keeps `trimmer.ts` unchanged.

**Alternatives considered**:
- Filter inside `trimFiles()`: rejected for the reason above — see plan.md's Constitution Check Risk field for the full reasoning.
- Filter at the MCP/OpenCode protocol boundary (before args even reach the tool's `execute`/`handle` function): rejected — there's no shared interception point at that layer between the two hosts' very different tool-registration mechanisms (OpenCode's `tool()` helper vs. MCP SDK's `registerTool`), so it would have to be duplicated anyway; doing it inside each tool's own function body is no more duplication and is simpler to follow.
