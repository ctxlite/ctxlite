# Implementation Plan: Token Savings Accuracy and Verification

**Branch**: `main` (no dedicated feature branch — consistent with `017`–`022`) | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-token-savings-accuracy/spec.md`

## Summary

Audit and close token-savings gaps across OpenCode, Claude Code, and Cursor: fix remaining `upstream` logging bugs (OpenCode compress/smart_read), label heuristic categories honestly in stats output, commit a deterministic `bench/` harness that replays seven canonical agent scenarios, calibrate measured mechanisms so logged savings stay within 10% of independent counts, demonstrate ≥15% relative improvement in **measured** savings rate vs the pinned baseline (`bench/baseline/summary.json`, sourced from `2026-06-29`), and update `docs/` with a capability matrix, benchmark metrics, and contributor run instructions.

`022` upstream attribution for Claude Code/Cursor is already shipped — this plan verifies it via bench host adapters and does not re-implement unless audit finds new call sites.

## Technical Context

**Language/Version**: TypeScript (Node 18+ ESM), matching the monorepo.

**Primary Dependencies**: Existing `@ctxlite/core` optimization functions; Vitest for unit tests; new `bench/` runner (stdlib + existing core imports — no live LLM SDK).

**Storage**: SQLite `~/.ctxlite/stats.db` for production stats (unchanged schema); `bench/results/` and pinned `bench/baseline/summary.json` for verification artifacts.

**Testing**: Vitest (`packages/*/src/**/*.test.ts`) + deterministic bench (`npm run bench`). Bench is the Principle VI host-integration proof — unit tests alone are insufficient for FR-005/FR-006.

**Target Platform**: Node — OpenCode plugin, Claude Code/Cursor hook bridges, CLI stats.

**Project Type**: Monorepo library/CLI — changes span `packages/core`, `packages/opencode`, `packages/cli`, `bench/`, `docs/`.

**Performance Goals**: `npm run bench` completes in <5 minutes on a standard dev machine (SC-005); zero added latency on hot hook paths.

**Constraints**: No schema migration; no historical row backfill; no live LLM calls in bench; no `prune`/`compact`/`concise` measurement on Claude Code/Cursor (platform constraints per `021`).

**Scale/Scope**: ~7 canonical scenarios × ~11 adapters; core threshold tuning in compress/prune/compact; 3 doc files updated + 1 new; bench source committed from scratch (results exist, runner does not).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Benefit** — What does this change achieve, measurably or directly
observably, and for whom?
Users and contributors can trust ctxlite's savings numbers: measured categories align within 10% of real before/after token deltas; heuristic categories are labeled `(est.)`; the bench proves ≥15% relative lift in measured savings rate (gate floor **40.9%** → **≥47.0%**) without correctness regressions; docs explain per-host what works vs what shows zero by design.

**Risk** — What's the specific, most-likely-to-break thing? Which existing
behavior/test/host integration is in the blast radius?
`tool-precall.ts` regex/segment logic and `tool-output-compress.ts` thresholds — same fragile areas as prior incidents (`ctxlite-internals`). Lowering `minTokens` or expanding compress could truncate output agents still need. Mitigation: bench correctness assertions per scenario must stay at 100% pass; tuning is gated on that. OpenCode `tool-compress-hook.ts` upstream fix touches every compress log row — blast radius is logging only, not hook JSON contract.

**Validation** — How was/will this be verified? Name the actual test(s)
or the actual live host check performed (not just "typecheck and test
pass").
1. `npm run bench` → `regressionVerdict: pass`, `measuredSavingsPercent ≥ baseline × 1.15`.  
2. Per-run `loggingAccuracy` asserts ≤10% delta for measured mechanisms (SC-002).  
3. Vitest: `tool-compress-hook.test.ts` (new/updated) — compress row `upstream === input.tool`.  
4. Vitest: `report.test.ts` — `precall (est.)` label.  
5. Vitest: `hook.test.ts` / `cursor-hook.test.ts` — upstream regression guard (`022`).  
6. Docs spot-check per `quickstart.md` §6.

**Cross-tool availability** — Does this apply uniformly across every host
ctxlite supports (OpenCode, Claude Code, Cursor, Claude Desktop where
relevant)? If not, is the asymmetry a documented platform constraint or an
oversight to track as a follow-up task?
**Not uniform — documented constraints.** OpenCode gets full automatic surface (prune/compact/concise measurement). Claude Code gets precall + compress. Cursor gets precall only (built-in compress N/A). MCP opt-in tools (`smart_read`, `trim`) log under `host: mcp` on all hosts. Capability matrix in `contracts/stats-display.md` → `docs/architecture.md` makes asymmetry explicit; bench runs host-specific adapters where mechanisms exist and skips/document where they cannot.

*Gate result: PASS (pre-design and post-design). No violations to justify.*

## Project Structure

### Documentation (this feature)

```text
specs/023-token-savings-accuracy/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0 — gap audit decisions, 15% gate definition
├── data-model.md        # Phase 1 — savings record, bench entities
├── quickstart.md        # Phase 1 — validation runbook
├── contracts/
│   ├── bench-summary.md # Bench output + gate contract
│   └── stats-display.md # Labels + capability matrix contract
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/core/src/
├── tokens.ts                    # estimateTokens — single counter (documented)
├── tool-output-compress.ts      # MAY tune thresholds for +15% gate
├── context-prune.ts             # MAY tune compact/prune budgets
├── grep-output-compress.ts      # MAY extend grep scenarios
├── report.ts                    # MODIFIED — precall (est.) label
└── report.test.ts               # MODIFIED

packages/opencode/src/
├── tool-compress-hook.ts        # MODIFIED — upstream: input.tool (not "opencode")
├── smart-read-tool.ts           # MODIFIED — upstream: meaningful tool id
└── *.test.ts                    # MODIFIED/NEW

packages/cli/src/
├── hook.ts                      # VERIFY 022 (no change expected)
├── cursor-hook.ts               # VERIFY 022 (no change expected)
└── *.test.ts                    # Regression guards

bench/                           # NEW (source committed; results archived)
├── baseline/
│   └── summary.json             # Pinned from 2026-06-29 + updated after improvements
├── fixtures/                    # Scenario tool I/O + message history
├── scenarios/                   # 7 canonical task definitions
├── src/
│   ├── run.ts                   # CLI entry
│   ├── adapters/                # baseline, per-mechanism, ctxlite-all, host hooks
│   └── report.ts                # summary.json + report.txt generator
└── results/                     # Timestamped runs (latest + historical)

docs/
├── architecture.md              # MODIFIED — capability matrix, estimate legend
├── contributing.md                # MODIFIED — npm run bench
└── benchmarks.md                # NEW — scenarios, metrics, interpretation

package.json                     # MODIFIED — "bench" script
```

**Structure Decision**: Business logic stays in `@ctxlite/core`; OpenCode/CLI fixes are thin adapter logging corrections; `bench/` is a repo-root verification tool (not an npm workspace package) importing core directly — same pattern as archived results already under `bench/results/`.

## Phase 0: Research (complete)

See [research.md](./research.md). All technical unknowns resolved:
- Gap taxonomy (bug / heuristic / platform / UX)
- Bench baseline pinned to `2026-06-29T08-42-22-464Z`
- `measuredSavingsPercent` gate definition (excludes precall + concise)
- Improvement levers ordered (compress → compact/prune → upstream fixes → host adapters)
- Token counter = `estimateTokens()` only

## Phase 1: Design (complete)

| Artifact | Path | Status |
|----------|------|--------|
| Data model | [data-model.md](./data-model.md) | ✅ |
| Bench contract | [contracts/bench-summary.md](./contracts/bench-summary.md) | ✅ |
| Stats contract | [contracts/stats-display.md](./contracts/stats-display.md) | ✅ |
| Quickstart | [quickstart.md](./quickstart.md) | ✅ |

### Implementation phases (for `/speckit-tasks`)

**Phase A — Audit artifact (FR-001)**  
Write gap analysis section in `research.md` (or `docs/benchmarks.md` appendix) from code grep across all `logOptimizationSavings` / `logConcisenessSavings` call sites — table of source × host × measurement kind × known issues.

**Phase B — Bug fixes (FR-002)**  
- `tool-compress-hook.ts`: `upstream: input.tool` on compress branch.  
- `smart-read-tool.ts`: meaningful `upstream` (e.g. file basename or `read`).  
- Verify `022` call sites unchanged; add bench host adapters.

**Phase C — Bench harness (FR-005)**  
Reconstruct runner from `contracts/bench-summary.md`; wire `npm run bench`; copy pinned baseline; implement `measuredSavingsPercent` + `loggingAccuracy` checks.

**Phase D — Accuracy calibration (FR-003, FR-006)**  
Tune measured mechanisms until bench gate passes (+15% relative measured rate, ≤10% logging delta, 100% correctness). Document exact threshold changes in `research.md` changelog.

**Phase E — Stats presentation (FR-004, FR-008)**  
`precall (est.)` in `buildStatsBreakdown`; optional JSON `measurementKind` field.

**Phase F — Documentation (FR-007)**  
`architecture.md`, `contributing.md`, `benchmarks.md` per contracts.

## Complexity Tracking

No violations — table intentionally left empty.

## Post-Design Constitution Re-check

All four Principle VI fields remain concrete after Phase 1 design. Bench contract names exact fail conditions; capability matrix documents cross-host gaps; no placeholder answers. **Ready for `/speckit-tasks`.**
