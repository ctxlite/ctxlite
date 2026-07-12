# Data Model: Token Savings Accuracy and Verification

**Feature**: `specs/023-token-savings-accuracy/`  
**Date**: 2026-07-12

## Existing entities (unchanged schema)

### Savings record (`requests` table)

Already defined in `packages/core/src/stats.ts`. This feature corrects values and presentation; **no migration**.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Dedup key (e.g. `compress-{callID}`) |
| `source` | enum-like string | `precall` \| `compress` \| `prune` \| `compact` \| `smart_read` \| `trim` \| `concise` |
| `upstream` | string | **Real tool name** (`bash`, `read`, `grep`, …) — not host name |
| `host` | string | `opencode` \| `claude-code` \| `cursor` \| `mcp` |
| `session_id` | string | Host session identifier |
| `tokens_in` | integer | Before optimization |
| `tokens_out` | integer | After optimization (0 for blocked/estimate rows) |
| `tokens_saved` | integer | `tokens_in - tokens_out` or heuristic estimate |
| `cost_saved` | real | From `estimateCost()` |
| `created_at` | timestamp | Insert time |

### Measurement kind (logical, not stored)

Derived at display/report time from `source`:

| `source` | Kind |
|----------|------|
| `compress`, `prune`, `compact`, `smart_read`, `trim` | **measured** |
| `precall`, `concise` | **estimate** |

Used by bench gating (`measuredSavingsPercent`) and stats labels (`precall (est.)`, `concise (est.)`).

---

## New entities (bench harness)

### Simulation scenario

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | string | Stable id (e.g. `compress-large-output`) |
| `description` | string | Human-readable purpose |
| `fixtures` | object | Tool I/O, message history, files on disk |
| `assertions` | array | Pass/fail checks (output shape, token bounds) |
| `mechanisms` | string[] | Which optimizations the scenario is designed to exercise |
| `hosts` | string[] | Which adapters must run it (`opencode`, `claude-code`, `cursor`) |

**Canonical set** (7 scenarios, from archived bench):
1. `compact-stale-tool-output`
2. `compress-large-output`
3. `concise-10000-tokens`
4. `precall-npm-test`
5. `prune-duplicate-tool-call`
6. `smart-read-typescript`
7. `trim-file-list`

### Bench adapter

| Field | Type | Description |
|-------|------|-------------|
| `adapterId` | string | `baseline` \| `precall` \| `compress` \| … \| `ctxlite-all` \| `claude-code` \| `cursor` |
| `enabledMechanisms` | string[] | Subset of optimizations applied |
| `hostPath` | string? | Optional hook/plugin entry for host simulation |

### Run result

| Field | Type | Description |
|-------|------|-------------|
| `runId` | string | `{adapterId}::{taskId}` |
| `status` | enum | `passed` \| `failed` \| `timed_out` |
| `tokensIn` | integer | Context tokens before savings |
| `tokensOut` | integer | Context tokens after savings |
| `tokensSaved` | integer | Net reduction |
| `mechanismAttribution` | map | Per-`source` token breakdown |
| `loggingAccuracy` | object? | `{ source, logged, independent, deltaPercent }[]` for SC-002 |

### Baseline report (pinned)

| Field | Type | Description |
|-------|------|-------------|
| `pinnedAt` | ISO timestamp | When baseline was captured |
| `savingsPercent` | number | All-mechanism rate |
| `measuredSavingsPercent` | number | Measured-only rate (gate metric) |
| `totalTokensSaved` | integer | Net tokens (all mechanisms) |
| `byMechanism` | map | Per-source totals |
| `regressionVerdict` | object | `pass` \| `fail` + failure list |

Stored at `bench/baseline/summary.json`; copied from a passing archived run after improvements land.

---

## Relationships

```text
Simulation scenario ──run──▶ Bench adapter ──produces──▶ Run result
                                    │
                                    └──writes──▶ Savings record (host adapters only)

Baseline report ◀──compared── Run result aggregate (ctxlite-all × all scenarios)
```

---

## Validation rules

1. **SC-002**: For each measured mechanism on each scenario, `|logged - independent| / max(independent, 1) ≤ 0.10`.
2. **SC-001**: `measuredSavingsPercent_new ≥ measuredSavingsPercent_baseline × 1.15`.
3. **SC-003**: New `precall`/`compress` rows from Claude Code/Cursor adapters: `upstream ∉ {claude-code, cursor, opencode}`.
4. **FR-008**: Stats breakdown rows for unavailable host+mechanism pairs are omitted or annotated in docs — never implied as broken zero integrations.
