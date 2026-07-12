# Research: Token Savings Accuracy and Verification

**Feature**: `specs/023-token-savings-accuracy/`  
**Date**: 2026-07-12

## R1 — Gap audit findings (verified against source)

### Decision: Treat gaps as four buckets — bug, heuristic, platform constraint, UX/labeling

**Rationale**: The user's "misleading counts" complaint mixes four different root causes. Fixing them requires different work per bucket; conflating them produces wrong fixes (e.g., trying to wire `prune` on Cursor).

| Bucket | Examples found | Action in this feature |
|--------|----------------|------------------------|
| **Bug** | OpenCode `tool-compress-hook.ts` logs `upstream: "opencode"` on `compress` rows (line 46) while `precall` correctly uses `input.tool` — same class of defect as `022` on Claude Code/Cursor, but on OpenCode compress only. `smart-read-tool.ts` logs `upstream: "opencode"` instead of a file/tool identifier. | Fix forward-only at call sites; add regression tests. |
| **Heuristic** | `precall` uses `PRECALL_ESTIMATES` fixed table (`tool-precall.ts`); `concise` uses `CONCISENESS_SAVINGS_RATE` (15% of output+reasoning). Stats UI already labels concise as `concise (est.)` in `report.ts` but `precall` has no `(est.)` suffix. | Label `precall (est.)` in shared stats rendering; document estimate rules in `docs/`. |
| **Platform constraint** | `prune`/`compact`/`concise` measurement OpenCode-only; `compress` unavailable on Cursor built-in tools; `smart_read`/`trim` log under `host: "mcp"` when invoked via MCP. | Capability matrix in docs — no code pretending these work everywhere. |
| **UX / early-session inflation** | `report.ts` already gates `savingsPercent` until `MIN_SESSION_TURNS_FOR_PERCENT` (10 turns). Users may still misread zeros on `--by-session` filters. | Docs + optional stats help line for host filters. |

**Alternatives considered**:
- Add SQLite `measurement_kind` column (`measured` | `estimate`) — rejected for v1; label suffix + docs achieves FR-004 without schema migration, matching `022`'s forward-only pattern.
- Backfill historical rows — rejected per spec FR-009.

### Decision: `022` upstream fix is already shipped for Claude Code/Cursor

**Rationale**: `packages/cli/src/hook.ts` and `cursor-hook.ts` already pass real tool names to `upstream`. This feature verifies via tests and bench host adapters; no duplicate fix unless audit finds new call sites.

---

## R2 — Benchmark harness location and baseline

### Decision: Commit `bench/` source at repo root; pin baseline to `bench/baseline/summary.json`

**Rationale**: `bench/results/2026-06-29T08-42-22-464Z/` exists with a complete JSON schema (`summary.json`, per-run files, `mechanismAttribution`, `regressionVerdict`) but **no runner source is committed** — only archived outputs (untracked `bench/` in git status). The harness must be reconstructed and committed so FR-005/FR-006 are reproducible in CI and `docs/contributing.md`.

**Baseline values** (pinned from `2026-06-29T08-42-22-464Z`):
- `baselineComparison.savingsPercent`: **9.343%** (all mechanisms, `ctxlite-all` adapter)
- `baselineComparison.totalTokensSaved`: **2540** tokens (net delta vs baseline adapter across 7 canonical scenarios)
- Per-mechanism attribution in `byMechanism` (for docs metrics table)
- Correctness: **100%** pass rate, **0%** correctness penalty

**Alternatives considered**:
- Vitest-only integration tests without `bench/` — rejected; user explicitly wants simulated multi-step sessions and archived reports, not isolated unit tests alone (Principle VI Validation).
- Live LLM bench — rejected per spec FR-009 (cost, flakiness, non-determinism).

---

## R3 — Aggregate measured savings rate (15% gate definition)

### Decision: Define two metrics in bench output; gate on `measuredSavingsPercent` only

| Metric | Numerator | Denominator | Role |
|--------|-----------|-------------|------|
| `savingsPercent` | All `tokensSaved` (measured + estimate) net vs baseline adapter | Total context tokens across canonical scenarios | Published + historical reference |
| `measuredSavingsPercent` | Only `compress`, `prune`, `compact`, `smart_read`, `trim` attribution | Same denominator | **Gate metric** — excludes `precall`, `concise` |

**Pinned baseline file** (`bench/baseline/summary.json`) uses a **dual-floor** shape:

| Field | Value (shipped) | Purpose |
|-------|-----------------|---------|
| `gateFloorMeasuredSavingsPercent` | **40.9%** | Regression gate — current run must be ≥ this × 1.15 (**47.0%**) |
| `archivedSavingsPercent` | **9.343%** | June 2026 all-mechanisms rate — historical reference only |
| `published.*` | Latest passing run (e.g. **67.4%** / **61.3%** measured) | Docs metrics source of truth (`SC-004`) |

**Gate floor derivation (40.9%)**: Recomputed `measuredSavingsPercent` from archived run `bench/results/2026-06-29T08-42-22-464Z/` using the current `computeBaselineComparison` formula (measured mechanisms only, same denominator as live bench). Pinned intentionally before T036 threshold tuning so later improvements must beat **47.0%**, not reset the floor on every passing run.

**15% relative improvement target** (SC-001):  
`current.measuredSavingsPercent ≥ gateFloorMeasuredSavingsPercent × 1.15`

Example: gate floor **40.9%** → target **≥47.0%**. Shipped run **61.3%** → PASS.

**Rationale**: Spec Assumptions state heuristic categories do not count toward the gate. Using a separate measured metric prevents "improving" the headline number by inflating `PRECALL_ESTIMATES`. Separating `published` from `gateFloor` avoids conflating docs metrics with the regression floor when re-pinning after a passing run.

**Alternatives considered**:
- Gate on `totalTokensSaved` absolute count — rejected; doesn't normalize for scenario token volume changes.
- Gate on `savingsPercent` including estimates — rejected; trivially gameable by bumping `PRECALL_ESTIMATES`.

---

## R4 — Improvement levers (how to reach +15% measured rate)

### Decision: Prioritize measured-mechanism effectiveness + logging accuracy, in this order

1. **Compress coverage** — Review `minTokens` (128), `maxChars`, grep bucketing (`grep-output-compress.ts`) against canonical `compress-large-output` fixture; add scenario for grep-heavy output if missing.
2. **Compact/prune tuning** — Review stale-output cap budget in `capStaleToolOutputs`; ensure duplicate detection in `pruneMessageContext` attributes full before-token count.
3. **OpenCode upstream fixes** — Correct compress/smart_read logging (R1 bugs); improves auditability, not directly measured rate.
4. **Host-path adapters** — Add `claude-code` and `cursor` bench adapters that invoke `hook.ts` / `cursor-hook.ts` with fixture stdin JSON for `precall-npm-test` and `compress-large-output` (compress only on Claude Code); proves cross-host accuracy (Principle VI).
5. **Logging alignment** — Add bench assertion: `|logged.tokensSaved - independentCount| / independentCount ≤ 0.10` per measured mechanism (SC-002).

**Rationale**: Archived `ctxlite-all` run shows `compact` (11916) and `compress` (9510) dominate measured savings on their respective scenarios. Modest threshold tuning on compress/compact yields ≥15% relative measured-rate lift without new mechanisms.

**Alternatives considered**:
- Lower `CONCISENESS_SAVINGS_RATE` — rejected for gate (estimate); may still document honestly.
- Inflate `PRECALL_ESTIMATES` — rejected (violates FR-003 spirit and user trust).

---

## R5 — Token counting method for verification

### Decision: Single definition — `estimateTokens()` in `packages/core/src/tokens.ts` (~4 chars/token)

**Rationale**: All mechanisms already use this function for `tokensIn`/`tokensOut`/`tokensSaved`. Bench independent verification and docs MUST reference the same function — no second counter.

**Alternatives considered**:
- tiktoken / model-specific tokenizer — rejected; adds dependency, differs per provider, not what ctxlite logs today.

---

## R6 — Documentation surface

### Decision: Update `docs/architecture.md`, `docs/contributing.md`; add `docs/benchmarks.md`

| Doc | Changes |
|-----|---------|
| `architecture.md` | Per-host capability matrix table; estimate vs measured legend; note OpenCode compress `upstream` fix |
| `contributing.md` | `npm run bench` instructions; when to re-pin baseline; PR gate |
| `benchmarks.md` (new) | Canonical scenarios list, latest metrics table, how to read `report.txt` / `summary.json` |

**Rationale**: Spec FR-007 asks for docs/ updates including metrics and test instructions; dedicated benchmarks doc avoids bloating architecture.md.

**Alternatives considered**:
- Metrics only in README — rejected; constitution prefers `docs/` for contributor-facing detail.

---

## FR-001 — Gap audit call-site table

Verified 2026-07-12 by grepping `logOptimizationSavings` and `logConcisenessSavings` in `packages/*/src` (excluding tests).

| File | `source` | Host | Kind | `upstream` | Issue | Status |
|------|----------|------|------|------------|-------|--------|
| `packages/opencode/src/tool-compress-hook.ts` | `precall` | opencode | estimate | `input.tool` | Correct | verified |
| `packages/opencode/src/tool-compress-hook.ts` | `compress` | opencode | measured | `input.tool` | Was `"opencode"` — misattributed tool | **fixed** (T015) |
| `packages/opencode/src/smart-read-tool.ts` | `smart_read` | opencode | measured | `"read"` | Was `"opencode"` — not a tool id | **fixed** (T016) |
| `packages/opencode/src/tool-precall-hook.ts` | `precall` | opencode | estimate | `input.tool` | Correct | verified |
| `packages/opencode/src/messages-transform-hook.ts` | `prune` | opencode | measured | `"opencode"` | Context-level pass, no per-tool id | **documented** |
| `packages/opencode/src/messages-transform-hook.ts` | `compact` | opencode | measured | `"opencode"` | Context-level pass, no per-tool id | **documented** |
| `packages/opencode/src/stats-events.ts` | `concise` | opencode | estimate | (n/a) | Uses `logConcisenessSavings` | verified |
| `packages/cli/src/hook.ts` | `precall` / `compress` | claude-code | estimate / measured | `tool_name` (lower) | Shipped in `022` | verified (T012) |
| `packages/cli/src/cursor-hook.ts` | `precall` | cursor | estimate | `normalizeToolName(tool_name)` | Shipped in `022`; compress N/A | verified (T013) |
| `packages/mcp/src/tools/smart-read.ts` | `smart_read` | mcp | measured | `"mcp"` | MCP host attribution by design | **documented** |

No additional production call sites found outside this table.

---

## Threshold tuning changelog (T036 / T047)

Applied after unit-level logging-accuracy checks (T014) and bench gate tuning (T036). Values are defaults in `@ctxlite/core`.

| Parameter | File | Before | After | Rationale |
|-----------|------|--------|-------|-----------|
| `minTokens` (compress) | `tool-output-compress.ts` | 128 | **96** | Compress more medium-sized tool outputs on `compress-large-output` fixture |
| Duplicate prune threshold | `context-prune.ts` | 64 tokens | **48 tokens** | Attribute savings on smaller duplicate tool outputs |
| `STALE_OUTPUT_MAX_TOKENS` (compact) | `context-prune.ts` | 600 | **512** | Slightly more aggressive stale-output cap within logging-accuracy tolerance |

**Not changed** (per FR-003 / gate rules): `PRECALL_ESTIMATES`, `CONCISENESS_SAVINGS_RATE`.

### Bench outcome after tuning

Latest passing run: `bench/results/2026-07-12T07-18-05-569Z/`

| Metric | Pre-improvement gate floor | After tuning |
|--------|---------------------------|--------------|
| `measuredSavingsPercent` | 40.9% (pinned floor) | **61.3%** |
| Gate (`floor × 1.15`) | 47.0% | PASS |
| `savingsPercent` (all mechanisms) | 9.3% (archived 2026-06-29) | **67.4%** |
| `regressionVerdict` | — | `pass` |
| `correctnessPenalty` | — | 0 |

### Baseline re-pin policy (dual-floor)

After T037, `bench/baseline/summary.json` uses `gateFloorMeasuredSavingsPercent` +
`archivedSavingsPercent` + `published` (see research.md §R3). Re-pin updates
`published` only unless intentionally resetting the gate.
