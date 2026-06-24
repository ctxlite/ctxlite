# Feature Specification: Precall Quiet-Flag Coverage for Direct Test-Runner/Linter Invocations

**Feature Branch**: `019-precall-test-runner-coverage`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: a pasted `ctxlite stats --by-session` output showing several Claude Code and Cursor sessions where `precall` sits at 0 rewrites/blocks while `compress` (or, on one Cursor session, `precall` itself) carries most of the savings — the user observed this pattern recurring on Claude Code and Cursor specifically, found it implausible given how many tool calls those sessions contain, and asked for the two hosts' hook documentation and our own implementation to be checked for a real defect before fixing anything.

## Investigation Findings (pre-spec research, not a placeholder)

Before writing this spec, the following was verified against current upstream documentation and this repo's own code — not assumed:

1. **Hook registration is correct on both hosts.** Claude Code's `settings.json` PreToolUse/PostToolUse entries use `matcher: "*"` (confirmed: matches every tool per [Claude Code's hooks reference](https://code.claude.com/docs/en/hooks)) — `packages/core/src/install/merge.ts`'s `addCtxliteHookGroup` sets exactly this. Cursor's `hooks.json` `preToolUse` entry has no `matcher` field at all (confirmed: per [Cursor's hooks docs](https://cursor.com/docs/hooks), "without a matcher, the hook fires for all tool types") — `mergeCursorHooksConfig` matches this. Neither host's registration is the problem.
2. **The stdin/stdout JSON contract our hook bridges implement matches both hosts' current documented schema exactly** — `tool_name`/`tool_input`/`session_id` fields, capitalized tool names (`Bash`, `Read`, `Edit`, etc.) on Claude Code; `tool_name`/`tool_input`/`conversation_id` and the flat `permission`/`updated_input` response shape on Cursor. `packages/cli/src/hook.ts` and `packages/cli/src/cursor-hook.ts` both match this precisely. The hooks really do fire and really are wired correctly — evidenced directly in the user's own pasted data: one Claude Code session shows 42/43 requests as precall, and both Cursor sessions show 100% of their logged rows as precall. The mechanism is not silently broken.
3. **The real explanation is `optimizeBashCommand`'s pattern list is narrower than this project's own actual command usage.** `packages/core/src/tool-precall.ts`'s `matchQuietPattern` only recognizes `npm test`/`npm run build`/`pnpm test`/`yarn test`/`cargo test`/`dotnet ...`/`pytest`/`npm install`/`pip install`/`composer install`/`bundle install`/`mvn`/`gradle`/`make`/`vite build`/`docker logs`/`curl`. It does **not** recognize direct invocations of `vitest`, `jest`, or `eslint` — and this exact repository's own dev workflow runs `npx vitest run packages/...` and `eslint packages/*/src/**/*.ts` directly, constantly (confirmed by direct observation: this session alone ran `npx vitest run` dozens of times while implementing `018-ctxliteignore-support`, none of which matched any existing pattern). A session dominated by direct test-runner/linter invocations — rather than `npm test`/`npm run build` wrappers — will legitimately show 0 precall rewrites today, while its outputs are large enough to still show up under `compress`. This matches the user's pasted Claude Code session exactly (15 requests, 0 precall, 15 compress).
4. **Verified real flags exist for all three tools** (per current docs, not training-data memory): Vitest's CLI supports `--reporter=dot` for minimal per-test output ([Vitest CLI guide](https://vitest.dev/guide/cli)); Jest supports `--silent` ([Jest CLI options](https://jestjs.io/docs/cli)); ESLint supports `--quiet` to suppress warning-level output, leaving only errors ([ESLint quiet flag discussion](https://github.com/eslint/eslint/issues/9597)).
5. **A separate, non-bug factor also contributes**, documented here so it isn't re-investigated as if it were new: precall's two categories (bash quiet-flags, blocked low-signal reads — now plus `.ctxliteignore`, see `specs/018-ctxliteignore-support/`) never touch `Edit`, `Write`, `Grep`, `Task`, or most MCP tool calls. A session dominated by those tool types will correctly show `precall: 0` by design — this is a scope limitation, not a defect, and is explicitly out of scope for this spec (see Assumptions).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Direct `vitest`/`jest` invocations get quieted (Priority: P1)

A developer (or an agent working in a repo that runs its test suite directly — `npx vitest run`, `vitest`, `npx jest`, `jest`, rather than through an `npm test` wrapper script) runs the test suite as part of an agent session. Today this produces full, unquieted test-runner output every time, because no existing pattern recognizes the bare tool invocation. After this feature, the same command gets the appropriate quiet flag appended automatically, exactly as `npm test` already does.

**Why this priority**: This is the single most concretely validated gap — it was observed directly in this project's own command history during real implementation work, not inferred from guesswork.

**Independent Test**: Run `optimizeBashCommand("npx vitest run")` and `optimizeBashCommand("vitest")`; confirm `--reporter=dot` is appended, `modified: true`, and a positive `estimatedTokensSaved`. Same for `npx jest`/`jest` with `--silent`.

**Acceptance Scenarios**:

1. **Given** the bash command `npx vitest run packages/core`, **When** precall evaluates it, **Then** the command becomes `npx vitest run packages/core --reporter=dot` and the rewrite is logged exactly like an `npm_test` rewrite is today.
2. **Given** the bash command `vitest --reporter=dot` (already quiet), **When** precall evaluates it, **Then** nothing changes (`modified: false`) — same idempotency guarantee every existing rule already provides.
3. **Given** the bash command `npx jest src/`, **When** precall evaluates it, **Then** `--silent` is appended.
4. **Given** a chained command `cd packages/core && npx vitest run | tail -20`, **When** precall evaluates it, **Then** only the `vitest` segment is rewritten — `tail -20` is untouched (same segment-aware rewriting `tool-precall.ts` already does for every other rule).

---

### User Story 2 - Direct `eslint` invocations get quieted (Priority: P2)

Same scenario, for lint commands run directly (`eslint .`, `npx eslint packages/*/src/**/*.ts` — this repo's own `npm run lint` script invokes `eslint` directly, not through a wrapper that already has a quiet default) rather than through an `npm run lint` wrapper that masks the underlying tool name from `optimizeBashCommand`'s pattern matching.

**Why this priority**: Lower than P1 because `--quiet` only suppresses warnings (errors still print), a smaller win than `--reporter=dot`/`--silent`'s effect on test output — but still a real, verified gap.

**Independent Test**: Run `optimizeBashCommand("eslint packages/*/src/**/*.ts")`; confirm `--quiet` is appended when not already present.

**Acceptance Scenarios**:

1. **Given** the bash command `eslint .`, **When** precall evaluates it, **Then** the command becomes `eslint . --quiet`.
2. **Given** the bash command `npx eslint --quiet .` (already quiet), **When** precall evaluates it, **Then** nothing changes.

### Edge Cases

- What happens when `vitest`/`jest`/`eslint` is invoked as `npm run test`/`npm test` (already covered today)? → The existing `npm_test` pattern still matches first; this feature adds patterns for the *direct* binary invocation only, so there's no double-matching or conflict (the `if`/`else if` chain in `matchQuietPattern` already guarantees only one rule fires per segment).
- What happens when the project already configures a `reporter`/`silent`/`quiet` setting in `vitest.config.ts`/`jest.config.js`/`.eslintrc`? → Out of scope to detect — consistent with every existing quiet-flag rule, which only checks the command line itself, never config files. A config-level default does not prevent appending the CLI flag (redundant but harmless, same as today's behavior for any tool).
- What happens with `vitest watch` (no `run`, interactive mode)? → Excluded from matching — appending `--reporter=dot` to a long-running watch process is a different risk profile (the agent wouldn't normally invoke watch mode in a non-interactive tool call anyway). Pattern matches only when paired with `run` or no subcommand at all that implies a non-interactive single pass; see Assumptions for the exact matching decision.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST append `--reporter=dot` to a bash command segment matching a direct `vitest`/`npx vitest` invocation (with or without an explicit `run` subcommand) when no reporter flag is already present.
- **FR-002**: System MUST append `--silent` to a bash command segment matching a direct `jest`/`npx jest` invocation when no silence-related flag is already present.
- **FR-003**: System MUST append `--quiet` to a bash command segment matching a direct `eslint`/`npx eslint` invocation when `--quiet` is not already present.
- **FR-004**: All three new rules MUST integrate into the existing `matchQuietPattern` if/else chain (one rule fires per segment, never two) and MUST respect existing segment-aware/chain-aware rewriting (`splitTopLevel`, `stripEmbeddedText`) — a tool name mentioned in a quoted string or commit message MUST NOT be rewritten.
- **FR-005**: Each new rule MUST log under a distinct, descriptive label (e.g. `vitest_run`, `jest_test`, `eslint_lint`) in the same `PRECALL_ESTIMATES`-keyed stats system existing rules use, so future `--by-session` output can distinguish which rule actually fired.
- **FR-006 (explicitly out of scope)**: This spec does NOT widen precall to cover `Edit`/`Write`/`Grep`/`Task`/MCP tool calls, and does NOT add a `git`-command quiet-flag rule (both already explicitly rejected — see `specs/018-ctxliteignore-support/spec.md` FR-007 for the git-log rejection rationale, which still applies). This spec also does NOT change `vitest watch`/interactive test-runner modes.

### Key Entities

N/A — no new data entities; this is three additional branches in `matchQuietPattern`'s existing if/else chain plus three new `PRECALL_ESTIMATES` entries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A bash tool call running `npx vitest run`/`vitest`/`npx jest`/`jest`/`eslint ...`/`npx eslint ...` without an existing quiet flag is rewritten on the very next agent turn — no host restart, no config change required.
- **SC-002**: Existing precall behavior for every currently-covered tool (`npm test`, `cargo test`, etc.) is unchanged — confirmed by the full existing `tool-precall.test.ts` suite continuing to pass without modification to any pre-existing test case.
- **SC-003**: This project's own future Claude Code/Cursor sessions doing test/lint work (the exact workflow that surfaced this gap) show non-zero `precall` activity going forward, verifiable via `ctxlite stats --by-session` after this ships and a future session runs `npx vitest run` or the repo's own `npm run lint`.

## Assumptions

- `vitest run`/bare `vitest` (no subcommand) are both treated as the non-interactive, single-pass form worth quieting; `vitest watch`/`vitest --watch` are excluded by checking the segment does not contain `watch` as a token, mirroring the existing project convention of being conservative about altering long-running/interactive invocations.
- The user's broader observation that precall "is almost always 0" on Claude Code/Cursor is **not** fully resolved by this spec — a real, separate, and already-documented architectural scope limit (precall only ever touches Bash-quiet-flags and blocked-reads, never `Edit`/`Write`/`Grep`/`Task`/most MCP calls) also contributes, and is correctly out of scope here (see Investigation Findings #5). This spec fixes the one concretely validated, low-risk, evidence-backed gap (direct test-runner/linter invocations); it does not claim to make precall non-zero on every session.
- No new dependency is needed — this is three new regex/flag branches in an existing, already-tested function, consistent with how every prior quiet-flag rule in this codebase was added (cargo, dotnet, mvn/gradle wrapper coverage, etc., per `ctxlite-internals`).
