# Research: Deliver Conciseness Instructions to Claude Code and Cursor

Most of the investigative work for this feature happened *before* spec writing (see spec.md's "Investigation Findings" section, backed by real `WebFetch`/grep research). This phase documents the implementation-shaping decisions made while drafting the plan, including one correction to the spec's own initial mechanism choice.

## Decision 1: Rule-directory delivery instead of a CLAUDE.md merge-block

**Decision**: Deliver the conciseness instructions via a dedicated, ctxlite-owned file under each host's *rules* directory — `.claude/rules/ctxlite-conciseness.md` (Claude Code) and `.cursor/rules/ctxlite-conciseness.mdc` (Cursor) — rather than merging a marked block into the user's own `CLAUDE.md`, which is what the spec's first draft assumed before this research.

**Rationale**: Fetched Claude Code's current official documentation specifically to verify this before committing to an approach (not assumed from training data). It confirms: "Rules without `paths` frontmatter are loaded at launch with the same priority as `.claude/CLAUDE.md`" — meaning a file ctxlite fully owns under `.claude/rules/` loads unconditionally every session, with zero need to parse, merge into, or risk corrupting the user's own `CLAUDE.md`. This project's own repository already has a real, working example of the equivalent Cursor mechanism (`.cursor/rules/security.mdc`, `alwaysApply: true`, confirmed by reading the actual file) — so the same full-file-ownership approach is provably already correct and unconditionally loaded on Cursor too, not a new assumption. This is strictly simpler and lower-risk than a merge-block strategy: no read-the-existing-file-and-find-my-marker logic is needed at all, since nothing else ever writes to a file named `ctxlite-conciseness.md`/`.mdc` — directly mirroring the file-ownership model `.claude/skills/ctxlite/SKILL.md` already uses successfully.

**Alternatives considered**:
- A marked block merged into `CLAUDE.md` directly (the spec's original framing): rejected after this research — would require write access to a file the user edits themselves, with all the markers/merge-conflict-avoidance complexity that implies, when a dedicated sibling file accomplishes the identical "always loaded" outcome with none of that risk.
- `--append-system-prompt` (a Claude Code CLI flag the documentation also mentions): rejected — it "must be passed every invocation," making it unsuitable for a one-time `ctxlite install` step; the user would have to remember to pass it on every single `claude` invocation forever, which defeats the point of an install-time fix.

## Decision 2: Where the instruction text lives (no cross-package import)

**Decision**: Duplicate the instruction text as a new constant in `packages/core/src/install/conciseness-rule-content.ts`, rather than having `@ctxlite/core` import `CONCISENESS_INSTRUCTIONS` from `@ctxlite/opencode`.

**Rationale**: `@ctxlite/opencode`'s `package.json` already depends on `@ctxlite/core` (verified directly), not the other way around — `@ctxlite/core` importing from `@ctxlite/opencode` would be a circular/backwards dependency, violating Principle IV (Core-First Architecture: core is the shared foundation, host packages depend on it, never the reverse). A duplicated constant (copied once, by value) is the same tradeoff `CONCISENESS_INSTRUCTIONS` itself already represents — it's plain instructional text, not executable logic, so duplication carries no behavioral-drift risk beyond "someone edits one copy and forgets the other," which is true of any duplicated documentation and is an acceptable, explicit tradeoff here.

**Alternatives considered**:
- Moving `CONCISENESS_INSTRUCTIONS` into `@ctxlite/core` and having `@ctxlite/opencode` import it from there instead: considered as the "more correct" long-term fix (single source of truth) but rejected for *this* spec specifically — it would touch `packages/opencode/src/system-prompt.ts` and its existing tests for a refactor unrelated to what this spec is actually trying to deliver (closing a real user-reported gap), expanding blast radius for no user-visible benefit right now. Worth flagging as a future cleanup, not bundling into this change.

## Decision 3: Generalizing `run.ts`'s skill-file handling

**Decision**: Extend the existing `isSkillKind`/`skillChange` logic in `packages/core/src/install/run.ts` to also cover the two new `ConfigKind` values, by mapping each full-file-ownership kind to its own expected-content constant (a small `Record<ConfigKind, string>`-style lookup) instead of hardcoding `CTXLITE_SKILL_CONTENT` as the only possible expected content.

**Rationale**: The skill-file code path already does exactly what this feature needs (read existing content, compare to expected content, write/skip/remove accordingly) — the only thing hardcoded is *which* constant counts as "expected." Generalizing that one lookup is the minimal change; duplicating the entire read/compare/write function for a second, near-identical "kind family" would violate the project's preference for reuse over duplication for no real benefit.

**Alternatives considered**: A wholly separate function/module for "rule file" handling, parallel to but not reusing `skillChange`: rejected as unnecessary duplication — the underlying operation (compare full file content, write/skip/remove) is identical; only the data differs.
