# Contract: Benchmark Summary Report

**Version**: 1.0  
**Feature**: `specs/023-token-savings-accuracy/`

## Purpose

Machine-readable output from `npm run bench`. Used for regression gating, docs metrics, and the 15% measured-savings improvement gate.

## Top-level shape (`summary.json`)

```json
{
  "timestamp": "ISO-8601",
  "mode": "deterministic",
  "aggregations": [ "Aggregation" ],
  "baselineComparison": "BaselineComparison",
  "regressionVerdict": "RegressionVerdict",
  "correctnessPenalty": 0,
  "successfulTokensSaved": 0,
  "totalTokensSaved": 0
}
```

## `Aggregation`

One row per `(adapterId, taskId)` pair.

| Field | Type | Required |
|-------|------|----------|
| `adapterId` | string | yes |
| `taskId` | string | yes |
| `n` | integer | yes |
| `statusCounts.passed` | integer | yes |
| `statusCounts.failed` | integer | yes |
| `tokensSaved.median` | integer | yes |
| `tokensIn.median` | integer | yes |
| `passRate` | number 0–1 | yes |

## `BaselineComparison`

### Pinned file (`bench/baseline/summary.json`)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `gateFloorMeasuredSavingsPercent` | number | yes | **Regression gate floor** — pre-improvement measured rate |
| `archivedSavingsPercent` | number | yes | June 2026 all-mechanisms rate — historical reference |
| `published` | object | yes | Latest passing run — docs metrics (`SC-004`) |

### `published` object (and live run output)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `totalTokensSaved` | integer | yes | Net vs `baseline` adapter |
| `totalCostSavedUsd` | number | yes | |
| `savingsPercent` | number | yes | All mechanisms |
| `measuredSavingsPercent` | number | yes | Measured mechanisms only |
| `byMechanism` | object | yes | Keys = `source` names |

## `RegressionVerdict`

| Field | Type | Values |
|-------|------|--------|
| `verdict` | string | `pass` \| `fail` |
| `failures` | string[] | Human-readable reasons |
| `checkedAt` | ISO-8601 | |

### Fail conditions

1. Any canonical scenario `passRate < 1` on `ctxlite-all` adapter.
2. `current.measuredSavingsPercent < gateFloorMeasuredSavingsPercent × 1.15` (regression vs pinned gate floor).
3. Any `loggingAccuracy` row (per-run) has `deltaPercent > 10` for a measured mechanism.
4. `correctnessPenalty > 0` (ctxlite-all fails more tasks than baseline).

## Per-run shape (`runs/{runId}.json`)

| Field | Type | Required |
|-------|------|----------|
| `runId` | string | yes — `{adapterId}::{taskId}` |
| `adapterId` | string | yes |
| `taskId` | string | yes |
| `status` | string | yes |
| `tokensIn` | integer | yes |
| `tokensOut` | integer | yes |
| `tokensSaved` | integer | yes |
| `mechanismAttribution` | object | yes — map of `source` → tokens |
| `loggingAccuracy` | array | optional — see data-model.md |

## Human report (`report.txt`)

Must include, in order:

1. Title + timestamp + mode
2. `Regression Verdict: PASS|FAIL`
3. Baseline comparison block (tokens, cost, savings %, **measured savings %**)
4. Per-mechanism breakdown
5. Correctness penalty line
6. Per `(adapterId, taskId)` aggregation lines

## Canonical adapters

| `adapterId` | Mechanisms enabled |
|-------------|-------------------|
| `baseline` | none |
| `precall` | precall |
| `compress` | compress |
| `prune` | prune |
| `compact` | compact |
| `smart_read` | smart_read |
| `trim` | trim |
| `concise` | concise |
| `ctxlite-all` | all |
| `claude-code` | precall + compress (hook bridge) |
| `cursor` | precall only (compress N/A for built-ins) |

## Canonical tasks

See `data-model.md` — seven `taskId` values. No task may be removed without spec amendment.
