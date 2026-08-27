# Phase 0 Research: OpenCode Output Token Efficiency

No unresolved `NEEDS CLARIFICATION` markers remain in the Technical Context — both
open design questions were resolved with the user during `/speckit-specify`
(hard-block-and-retry enforcement; real local-OpenCode benchmark baseline). This
document records the implementation-level decisions needed before Phase 1 design,
grounded in the current codebase.

## 1. Block-and-redirect strategy for full-content reads

**Decision**: Extend `optimizeReadPath` in `packages/core/src/tool-precall.ts`
with a second, distinct blocking path (separate from the existing
`BLOCKED_READ_PATTERNS` low-signal-path list): when a `read` call targets a file
above the existing `smart_read` size/token threshold (see `smart-read.ts`) **and**
the current tool-call sequence for the session shows no adjacent `edit`/`write`
intent on that same path, return `blocked: true` with a `blockReason` that names
the ctxlite alternative tool by name (`smart_read`) and the path, so the agent's
retry is a direct, obvious next action rather than a vague refusal.

**Rationale**: This reuses the exact mechanism (`PrecallResult`, `blocked`/
`blockReason`/`estimatedTokensSaved`) already wired end-to-end through
`packages/opencode/src/tool-precall-hook.ts` into `logOptimizationSavings` — no
new plumbing, only a new rule. It keeps the "why" (edit vs. inspect) inferrable
from data already available at precall time (recent tool calls in the session),
consistent with how the project's existing conciseness instructions already
draw that same distinction advisorily.

**Alternatives considered**:
- *Transparent auto-redirect* (silently serve `smart_read` output instead of the
  blocked `read`) — rejected per user's explicit clarification answer
  ("hard block, force retry"): a silent substitution risks the agent not
  noticing it received signatures-only content and hallucinating implementation
  details it never saw.
- *Block at the OpenCode plugin layer only* (`tool-precall-hook.ts`), bypassing
  `@ctxlite/core` — rejected: violates the "business logic only in
  `@ctxlite/core`" hard constraint in `AGENTS.md`; the hook must stay a thin
  wire-up.

## 2. Edit-intent detection (when to allow a full read)

**Decision**: Treat a full read as edit-intent-allowed when either (a) the same
session has an `edit`/`write`/`patch` tool call on the identical path within a
short recent window, or (b) the read call itself is immediately followed by such
a call in the same turn (some hosts read-then-edit atomically). Track this via
the existing per-session precall state module (`packages/opencode/src/precall-state.ts`)
rather than inventing a new state store.

**Rationale**: Reuses infrastructure already tracking per-session/per-call
precall state; avoids a new persistence surface. Keeps the heuristic
conservative (only blocks when there's no nearby edit signal), reducing the risk
of the false-positive-over-blocking regression class the `ctxlite-internals`
skill warns about for this exact file.

**Alternatives considered**:
- *Always allow full reads and only nudge via a warning* — rejected: this is
  the "warn only" option the user explicitly did not choose.
- *Require an explicit `intent` argument from the agent* — rejected: would
  require a tool-schema change outside ctxlite's control (the host's native
  `read` tool schema is not ctxlite's to modify).

## 3. Small-file exemption threshold

**Decision**: Reuse the existing size/token threshold already defined for
`smart_read` eligibility (see `packages/core/src/smart-read.ts`) as the same
cutoff below which the new blocking rule does not apply — one threshold, not two,
to avoid inconsistent behavior between "when smart_read helps" and "when reads
get blocked."

**Rationale**: Directly satisfies FR-007 ("MUST NOT apply blocking/enforcement
overhead to files small enough that a full read is already cheap") without
introducing a second tunable that could drift out of sync with the first.

**Alternatives considered**: A separate, lower threshold specifically for
blocking — rejected as an unnecessary second knob with no evidence it's needed.

## 4. Dashboard/stats flakiness root cause

**Decision**: Before writing a fix, add a reproduction test that runs a
sequence of OpenCode sessions against `packages/core/src/stats.ts` /
`report.ts` and asserts every completed session's savings row is queryable
immediately after the session (per SC-004's "100% of the time" bar) — treat any
existing race between the SQLite write path (`better-sqlite3` synchronous
writes vs. `bun:sqlite` in `sqlite-bun.ts`) and the read path used by
`report.ts`/`session-display.ts` as the primary suspect, since the two runtimes
take different code paths through `sqlite-adapter.ts`.

**Rationale**: The bug is user-observed as intermittent, which points at a
timing/runtime-path inconsistency rather than a logic error (a pure logic bug
would be reliably wrong, not "appears and disappears"). Writing the
reproduction first, per the project's test-first constitution requirement,
avoids guessing at a fix for a bug that isn't yet reliably reproduced.

**Alternatives considered**: Jumping straight to a speculative fix (e.g., adding
a `pragma` or forcing synchronous flush) without a reproduction — rejected, does
not satisfy the constitution's test-first principle and risks masking rather
than fixing the actual race.

## 5. Live benchmark harness: invoking OpenCode against a free-tier model

**Decision**: Build `bench-live/` as a thin runner that shells out to a locally
installed `opencode` CLI (the same binary a developer would use interactively),
running the representative task set from `bench-live/scenarios/` twice per task
— once with the OpenCode ctxlite plugin's enforcement active, once with it
disabled via existing config — against whichever free-tier model is currently
configured in `bench-live/src/models.ts` (a small, swappable config, since
free-tier model availability changes over time — see spec Assumptions). Each
run's actual reported token usage (from OpenCode's own session output/logs) is
captured, logged to `bench-live/results/<timestamp>/`, and the harness supports
`--rerun` to repeat a prior run's task set for stability comparison.

**Rationale**: Directly matches the user's clarification answer: "use local
opencode invocation to test on their free models ... so you can test, add logs,
monitor, rerun." Keeping the model choice in one small config file (rather than
hardcoding a provider) means the harness keeps working as free-tier offerings
change, without being a spec-level commitment to a specific vendor.

**Alternatives considered**:
- *Mock/simulate OpenCode's model responses* — rejected: this is exactly the
  synthetic-estimate pattern the user is distrustful of; the whole point of
  this story is a real model in the loop.
- *Extend the existing `bench/` deterministic suite in place* — rejected: that
  suite's adapters (`bench/src/engine.ts`) simulate token deltas from fixture
  strings with no live model call; conflating the two would make the
  regression-gated deterministic suite non-deterministic. Kept as a separate
  sibling directory instead (see plan.md Structure Decision).

## 6. Node-version-agnostic install (`better-sqlite3`)

**Decision**: Confirm `better-sqlite3`'s prebuilt binary coverage spans the
current + previous Node LTS lines used in FR-013/SC-007, add explicit `engines`
guidance (informational, not a hard `engine-strict` pin) documenting the
supported range, and ensure the existing Bun fallback path
(`packages/core/src/sqlite-bun.ts`) is exercised by install-time verification so
a Node-ABI mismatch fails with FR-014's "clear, specific error" rather than a
generic native-module load failure. Verify via a matrix install test on the
oldest and newest supported LTS versions (spec's Independent Test for User
Story 4).

**Rationale**: The install pain the user describes ("stuck on a Node version")
is the classic native-module ABI mismatch class of problem, not a
JavaScript-level incompatibility — the fix is prebuilt-binary coverage plus a
legible failure mode, not a rewrite of the storage layer.

**Alternatives considered**: Replacing `better-sqlite3` with Node's built-in
`node:sqlite` — rejected: that module is only available on newer Node
versions, which would *increase* version-pinning pressure, the opposite of
FR-013's goal.
