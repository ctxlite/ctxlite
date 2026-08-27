# Phase 1 Data Model: OpenCode Output Token Efficiency

This feature does not introduce new persisted domain entities in the stats
SQLite database — it fixes reliability of existing rows and adds a new
blocking rule that logs through the existing `logOptimizationSavings` path.
The entities below (drawn from the spec's Key Entities section) map to
concrete structures already in the codebase, plus one new artifact type for
the live benchmark harness.

## OpenCode Session

Represented implicitly by `sessionID` values already threaded through
`packages/opencode/src/tool-precall-hook.ts` and `precall-state.ts`, and
persisted as the `session_id` column on savings rows in
`packages/core/src/stats.ts`. No schema change — this feature only guarantees
that rows written during a session are reliably queryable afterward (fixes
User Story 1).

## Efficiency Enforcement Rule

**Not a persisted entity** — a pure function extension to
`optimizeReadPath`/`optimizeToolArgs` in `packages/core/src/tool-precall.ts`.

| Field | Type | Description |
|---|---|---|
| `path` | `string` | The file path the agent attempted to read |
| `sizeAboveThreshold` | `boolean` | Whether the file exceeds the shared `smart_read` eligibility threshold (research.md §3) |
| `hasEditIntent` | `boolean` | Whether recent session precall state shows an adjacent edit/write on the same path (research.md §2) |
| `blocked` | `boolean` | `sizeAboveThreshold && !hasEditIntent` |
| `blockReason` | `string` | User/agent-facing message naming the path and the `smart_read` alternative |
| `estimatedTokensSaved` | `number` | Existing `PrecallResult` field, populated for the block case same as today's low-signal-path blocks |

This reuses the existing `PrecallResult` type (`packages/core/src/tool-precall.ts`) —
no new type is introduced, only a new code path producing it.

## Savings Record / Stat

Existing `OptimizationLog` / stats row shape in `packages/core/src/stats.ts`
(`source`, `upstream`, `tokensIn`, `tokensOut`, `id`, `host`, `sessionId`).
This feature does not change the row shape; it changes:
1. **Write reliability** — every completed session's rows are guaranteed
   flushed/queryable before the session-end query path runs (research.md §4).
2. **Read reliability** — `report.ts` / `session-display.ts` never return an
   intermittently-empty result for a session that has rows present in the DB.
3. **Zero-vs-fabricated distinction** — a session with no qualifying savings
   returns an explicit zero/no-data row, never a synthesized non-zero value
   (FR-004).

## Benchmark Run (new — live harness only, not the DB)

Produced by the new `bench-live/` harness (research.md §5). Persisted as a
JSON artifact per run, not in the stats SQLite DB (keeps it decoupled from
production telemetry).

| Field | Type | Description |
|---|---|---|
| `runId` | `string` | Timestamp-based run identifier (mirrors `bench/results/<timestamp>/` convention) |
| `mode` | `"enforced" \| "disabled"` | Whether ctxlite's OpenCode enforcement was active for this run |
| `model` | `string` | The free-tier model identifier used (from `bench-live/src/models.ts`) |
| `taskId` | `string` | Which task in the representative task set this run covers |
| `outputTokens` | `number` | Actual output tokens reported by the OpenCode session for this task |
| `derivedCostUsd` | `number \| null` | Cost derived from `outputTokens` and the model's published rate, `null` if pricing is unknown (never fabricated — mirrors FR's "unavailable, not invented" rule) |
| `correctnessScore` | `number \| "n/a"` | Task-specific pass/fail or scored correctness check (SC-003) |
| `timestampStart` / `timestampEnd` | `string` (ISO 8601) | Wall-clock bounds of the run, for log correlation |
| `logPath` | `string` | Path to the raw OpenCode session log captured for this run |

## Task Set

A fixed, versioned list of representative coding tasks living in
`bench-live/scenarios/`, structurally similar to `bench/scenarios/index.ts`
but independent from it (research.md §5 — kept separate from the deterministic
suite). Each task has a stable `taskId` referenced by `Benchmark Run` rows so
results are comparable run-to-run (SC-002).

| Field | Type | Description |
|---|---|---|
| `taskId` | `string` | Stable identifier, e.g. `"inspect-large-module-structure"` |
| `prompt` | `string` | The instruction given to the OpenCode agent for this task |
| `fixturePath` | `string` | Path to the repository fixture the task operates against |
| `expectedEditIntent` | `boolean` | Whether this task is expected to trigger an edit (used to assert User Story 2's allow-when-editing behavior isn't over-blocked in the live harness too) |
| `correctnessCheck` | `string` | Description/reference of how correctness is scored for this task |
