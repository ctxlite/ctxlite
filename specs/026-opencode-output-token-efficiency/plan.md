# Implementation Plan: OpenCode Output Token Efficiency

**Branch**: `026-opencode-output-token-efficiency` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-opencode-output-token-efficiency/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Make ctxlite's OpenCode integration actually deliver the output-token cost reduction it claims: (1) fix the stats/dashboard flakiness so savings numbers are always present and reflect real, measured data instead of disconnected estimates; (2) extend `packages/core/src/tool-precall.ts`'s existing block-on-read mechanism (currently limited to low-signal paths like `node_modules/`, lockfiles, `.ctxliteignore` matches) so it also blocks full-content reads that a token-efficient tool (`smart_read`) could serve, redirecting the agent to retry — while still allowing full reads when the agent is about to edit or the file is small; (3) add a real, local-OpenCode-invocation benchmark harness (distinct from the existing deterministic `bench/` simulation) that runs a representative task set against free-tier models with enforcement on/off, logs actual token/cost/quality data, and supports reruns to prove stability of the 70–90% output-token cost reduction target; (4) make the OpenCode-targeted package build/install work across supported Node LTS versions without pinning, addressing the `better-sqlite3` native-dependency friction. Cursor and Claude Code integrations are explicitly out of scope beyond "no regression."

## Technical Context

**Language/Version**: TypeScript 5.4 (ESM), running on Node.js (target: current + previous LTS, see FR-013) and on Bun (OpenCode's plugin runtime already has a `sqlite-bun.ts` fallback path)

**Primary Dependencies**: `@ctxlite/core` (business logic — `tool-precall.ts`, `stats.ts`, `report.ts`, `smart-read.ts`, `ctxliteignore.ts`), `better-sqlite3` (native SQLite binding used for the stats DB), the OpenCode plugin API consumed by `packages/opencode` (`tool-precall-hook.ts`, `tools.ts`, `stats-events.ts`, `session-display.ts`), `vitest` for tests, the OpenCode CLI itself for the new live benchmark harness

**Storage**: SQLite stats DB at the path resolved by `defaultDbPath()` / `getStatsDbPath()` (via `better-sqlite3` on Node, `bun:sqlite` on Bun) — no new storage technology introduced; this feature fixes read-reliability and blocking-enforcement around existing storage, and adds append-only log files for live benchmark runs (see `data-model.md`)

**Testing**: `vitest` unit/integration tests per package (existing pattern: `*.test.ts` colocated with source); the existing deterministic `bench/` simulation suite (`npm run bench`, gated against `bench/baseline/summary.json`); a **new** live benchmark harness that shells out to a locally-installed OpenCode CLI against a real (free-tier) model, logs results under a new results directory, and is rerunnable to check run-to-run stability

**Target Platform**: OpenCode plugin runtime (Node.js and Bun), invoked via local `opencode` CLI sessions; developer workstation / CI for the benchmark harness

**Project Type**: TypeScript npm workspace monorepo (`packages/core`, `packages/opencode`, `packages/mcp`, `packages/cli`) — this feature extends `packages/core` and `packages/opencode`, and adds a live-benchmark tool alongside the existing `bench/` directory; no new package is created

**Performance Goals**: ≥70% (target ~90%) reduction in measured output-token cost for representative OpenCode coding tasks, ctxlite-enforced vs. ctxlite-disabled, per SC-001

**Constraints**: enforcement MUST NOT degrade task correctness/output quality (SC-003); blocking MUST NOT add overhead to reads below the efficiency threshold (FR-007); blocking MUST allow full reads with evident edit intent (FR-006); dashboard/stats MUST be present and accurate on every query, never fabricated (FR-002–FR-004); install MUST succeed on current + previous Node LTS without manual version pinning (FR-013)

**Scale/Scope**: `packages/core/src/tool-precall.ts` (extend blocking logic), `packages/core/src/stats.ts` / `report.ts` (fix reliability), `packages/opencode/src/tool-precall-hook.ts` / `tools.ts` / `session-display.ts` (wire enforcement + redirect messaging), `packages/core/src/install/` and root packaging (`better-sqlite3` cross-Node-version story), a new live benchmark harness (location decided in `research.md`) alongside the existing `bench/` deterministic suite; Cursor and Claude Code adapters are touched only if regression tests require it

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

[Gates determined based on constitution file — Principles I-V from
`.specify/memory/constitution.md` apply as written. Principle VI
(Implementation Heuristic Gate) requires the four fields below to be
filled with specifics for *this* change, not restated boilerplate; a
generic or missing answer fails this gate.]

**Benefit** — What does this change achieve, measurably or directly
observably, and for whom?
OpenCode users see a stats dashboard that never silently drops values, and
their measured output-token cost for real coding sessions drops by 70–90%
(proven by a live-model benchmark, not a static estimate) — directly
addressing the user's stated complaint that "I don't see any reduction in
cost."

**Risk** — What's the specific, most-likely-to-break thing? Which existing
behavior/test/host integration is in the blast radius?
`packages/core/src/tool-precall.ts` is exactly the file the `ctxlite-internals`
skill flags as having shipped real regressions before. Extending
`optimizeReadPath`/`optimizeToolArgs` to block more reads risks over-blocking
a read the agent genuinely needs (breaking OpenCode sessions outright) or
under-blocking (no measured improvement). The existing `bench/` regression
gate (`npm run bench`, checked against `bench/baseline/summary.json`) is in
the blast radius since it measures `tool-precall.ts` behavior; Cursor/Claude
Code precall tests (`SKIP_TOOLS`, host-specific adapters in
`bench/src/engine.ts`) must not regress even though they're out of scope for
new work.

**Validation** — How was/will this be verified? Name the actual test(s)
or the actual live host check performed (not just "typecheck and test
pass").
Unit tests extending `packages/core/src/tool-precall.test.ts` and
`packages/opencode/src/tool-precall-hook.test.ts` / `smart-read-tool.test.ts`
for the new block-and-redirect and edit-intent-allowed cases; the existing
`npm run bench` deterministic suite re-run to confirm no baseline regression;
the **new** live benchmark harness run locally via real `opencode` CLI
invocations against a free-tier model (enforced vs. disabled) to verify
SC-001/SC-002/SC-003; a manual `opencode run` smoke check that a blocked
read produces a clear redirect message the agent can act on.

**Cross-tool availability** — Does this apply uniformly across every host
ctxlite supports (OpenCode, Claude Code, Cursor, Claude Desktop where
relevant)? If not, is the asymmetry a documented platform constraint or an
oversight to track as a follow-up task?
No — this is intentionally OpenCode-only, per spec Assumptions and the
user's explicit direction to focus there while planning to retire Cursor and
Claude Code integrations separately over time. Cursor and Claude Code keep
their current (weaker) precall behavior unchanged; the only requirement on
them is "no regression," verified via their existing tests/bench adapters.
This is a documented, deliberate platform-scoping decision, not an oversight.

## Project Structure

### Documentation (this feature)

```text
specs/026-opencode-output-token-efficiency/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # /speckit-specify quality checklist (already created)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/
├── core/                          # @ctxlite/core — all business logic lives here
│   └── src/
│       ├── tool-precall.ts        # EXTEND: block-and-redirect full reads → smart_read
│       ├── tool-precall.test.ts
│       ├── stats.ts               # FIX: reliability of persisted savings records
│       ├── stats.test.ts
│       ├── report.ts              # FIX: dashboard/graph query reliability
│       ├── report.test.ts
│       ├── smart-read.ts          # reference: existing token-efficient read tool
│       └── install/                # TOUCH: Node-version-agnostic install/build story
│
├── opencode/                      # thin OpenCode plugin adapter
│   └── src/
│       ├── tool-precall-hook.ts   # EXTEND: wire block-and-redirect messaging
│       ├── tool-precall-hook.test.ts
│       ├── smart-read-tool.ts
│       ├── smart-read-tool.test.ts
│       ├── stats-events.ts        # FIX: session→stats event reliability
│       ├── session-display.ts     # FIX: dashboard rendering reliability
│       └── tools.ts
│
├── mcp/                           # unaffected unless a shared fix is needed
└── cli/                           # unaffected unless a shared fix is needed

bench/                             # EXISTING deterministic simulation suite (unchanged)
├── scenarios/
├── src/
└── results/

bench-live/                        # NEW: real local-OpenCode-invocation benchmark harness
├── scenarios/                     # representative task set (User Story 3)
├── src/
│   ├── run.ts                     # shells out to local `opencode` CLI, records usage
│   ├── report.ts                  # summarizes token/cost/quality, enforced vs. disabled
│   └── models.ts                  # free-tier model configuration
└── results/                       # timestamped, logged, rerunnable run artifacts
```

**Structure Decision**: Single TypeScript monorepo (existing `npm` workspaces
layout) — no new package is introduced. Core enforcement and stats-reliability
logic lives in `packages/core` per the "business logic only in `@ctxlite/core`"
constraint in `AGENTS.md`; `packages/opencode` stays a thin adapter that wires
core functions into OpenCode's plugin hooks. The new live benchmark harness is
added as a sibling to the existing `bench/` directory (`bench-live/`) rather
than inside `bench/` itself, keeping the deterministic simulation suite (used
for the `npm run bench` regression gate) clearly separate from the new
real-model, real-CLI validation harness that produces the evidence for
SC-001–SC-003.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. The Constitution Check gates above pass with the OpenCode-only
scoping documented as a deliberate platform decision (per spec Assumptions),
not a gap requiring justification.
