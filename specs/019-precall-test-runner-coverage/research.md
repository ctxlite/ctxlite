# Research: Precall Quiet-Flag Coverage for Direct Test-Runner/Linter Invocations

No `[NEEDS CLARIFICATION]` markers exist in spec.md — most of the investigative research for this feature already happened *before* spec writing (see spec.md's "Investigation Findings" section, backed by real `WebFetch`/`WebSearch` against current Claude Code/Cursor hooks docs and Vitest/Jest/ESLint CLI docs). This phase documents the remaining concrete pattern-matching decisions needed to implement the three new rules.

## Decision 1: Exact match patterns and idempotency checks per tool

**Decision**:

| Tool | Match regex | Idempotency check (skip if already present) | Appended flag | Label |
|---|---|---|---|---|
| vitest | `/\bvitest\b/` AND segment does not contain `\bwatch\b` | `hasFlag(segment, ["--reporter", "-r "])` | `--reporter=dot` | `vitest_run` |
| jest | `/\bjest\b/` | `hasFlag(segment, ["--silent"])` | `--silent` | `jest_test` |
| eslint | `/\beslint\b/` | `hasFlag(segment, ["--quiet"])` | `--quiet` | `eslint_lint` |

**Rationale**: Matches the exact style of every existing rule in `matchQuietPattern` — a `segmentSkeleton`-tested regex (post-`stripEmbeddedText`, so a tool name inside a quoted commit message never matches) paired with `hasFlag` against the raw `segment` (so an already-quiet invocation is a no-op). `\b` word boundaries on the bare tool name (not `npm\s+run\s+vitest` style, since `vitest`/`jest`/`eslint` are typically invoked as standalone binaries or via `npx`, not through `npm run`) — this mirrors how `pytest`/`make`/`curl` are matched (bare binary name), not how `npm test`/`cargo test` are matched (subcommand pattern), because that's the real invocation shape these three tools actually have.

The vitest pattern additionally checks the segment does NOT contain the token `watch` anywhere — `vitest watch`/`vitest --watch` are both excluded this way without needing two separate regexes, per spec.md's Edge Cases section (appending a one-shot reporter flag to a long-running watch process is a different risk profile the project has been conservative about elsewhere, e.g. `docker logs --tail` already follows this same "don't reshape a streaming/long-running command's fundamental behavior" caution).

The `--reporter` idempotency check matches both `--reporter` and `-r ` (vitest's CLI also accepts `-r <reporter>` as a documented short flag per the same Vitest CLI guide already cited in spec.md) — broader than just checking for the exact string `--reporter=dot`, consistent with how every other existing rule's `hasFlag` check is intentionally broad (e.g. `npm_test`'s check covers `--silent`, `--quiet`, AND `--loglevel silent`, not just the one flag it appends) so a user who already chose a different quiet-ish flag isn't double-flagged.

**Alternatives considered**:
- Matching `npx vitest`/`npx jest`/`npx eslint` as a separate, more specific pattern from bare `vitest`/`jest`/`eslint`: rejected — unnecessary duplication; a `\bvitest\b` word-boundary match already catches `npx vitest`, `vitest`, `./node_modules/.bin/vitest`, and any other invocation form containing that exact token, the same way `\bcargo\s+test\b`-style patterns elsewhere already rely on word-boundary matching rather than enumerating every possible invocation prefix.
- A single combined "test runner" pattern covering vitest+jest+mocha+ava etc. in one branch: rejected — each tool's correct quiet flag is different (`--reporter=dot` vs `--silent`), and collapsing them into one branch would either need internal tool-detection logic (more complex than three flat branches) or apply the wrong flag to the wrong tool. Three separate `else if` branches matches the codebase's existing convention of one branch per tool.

## Decision 2: Placement in the if/else chain

**Decision**: Append the three new branches at the end of the existing chain in `matchQuietPattern`, after the `curl` branch and before the closing `if (label === undefined ...)` check.

**Rationale**: Order only matters for commands that could match multiple patterns simultaneously — none of the 17 existing patterns share a keyword with `vitest`/`jest`/`eslint`, so placement is purely additive and carries zero risk of shadowing an existing rule or changing existing match order for any currently-covered command (SC-002).

**Alternatives considered**: Interspersing the new branches near conceptually related existing rules (e.g. putting `jest`/`vitest` near `pytest` since both are test runners): rejected as pure style preference with no functional difference — appending at the end is the simplest diff to review and keeps the change additive-only in the literal sense (no existing lines move).
