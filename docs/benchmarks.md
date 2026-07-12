# Token savings benchmarks

Deterministic scenarios that replay representative agent workflows without live
LLM calls. Results prove savings accuracy and guard against regressions.

## Run locally

```bash
npm install
npm run build
npm run bench
```

Output lands in `bench/results/<timestamp>/`:

- `report.txt` — human-readable summary and `Regression Verdict`
- `summary.json` — machine-readable aggregations
- `runs/*.json` — per `(adapter, scenario)` results with `mechanismAttribution`
  and `loggingAccuracy`

Run one adapter:

```bash
npm run bench -- --adapter ctxlite-all
npm run bench -- --adapter claude-code
```

## Regression gate

The runner compares the current `ctxlite-all` run against
`bench/baseline/summary.json`:

| Check | Rule |
|-------|------|
| Measured savings rate | `current.measuredSavingsPercent ≥ gateFloorMeasuredSavingsPercent × 1.15` |
| Logging accuracy | Measured mechanisms within **10%** of independent `estimateTokens()` delta |
| Correctness | All `ctxlite-all` scenarios `passed` (unless documented platform skip) |

**Measured** mechanisms: `compress`, `prune`, `compact`, `smart_read`, `trim`.  
**Estimate** mechanisms (labeled `(est.)` in stats): `precall`, `concise`.

Token counting uses `estimateTokens()` (~4 characters per token) — the same
function ctxlite uses internally.

## Canonical scenarios

| Task ID | Mechanism exercised |
|---------|---------------------|
| `compact-stale-tool-output` | `compact` |
| `compress-large-output` | `compress` |
| `concise-10000-tokens` | `concise` (estimate) |
| `precall-npm-test` | `precall` (estimate) |
| `prune-duplicate-tool-call` | `prune` |
| `smart-read-typescript` | `smart_read` |
| `trim-file-list` | `trim` |

## Published metrics (from `bench/baseline/summary.json`)

Read `baselineComparison.published` for docs tables (`SC-004`). Gate floor
fields (`gateFloorMeasuredSavingsPercent`, `archivedSavingsPercent`) are
separate — see [Re-pin baseline](#re-pin-baseline).

| Metric | Gate floor | Archived (June 2026) | Published (latest pin) |
|--------|------------|----------------------|-------------------------|
| `measuredSavingsPercent` | **40.9%** | — | **61.3%** |
| `savingsPercent` (all mechanisms) | — | **9.3%** | **67.4%** |
| Gate target (×1.15) | **47.0%** | — | PASS at 61.3% |

Per-mechanism totals (`published.byMechanism`, `ctxlite-all`):

| Mechanism | Tokens saved | Kind |
|-----------|--------------|------|
| compact | 11,202 | measured |
| compress | 11,202 | measured |
| concise | 1,500 | estimate |
| precall | 800 | estimate |
| prune | 383 | measured |
| smart_read | 4 | measured |
| trim | 15 | measured |

## Re-pin baseline

After a passing run, update **`baselineComparison.published`** from the run's
`baselineComparison` block. **Do not** change `gateFloorMeasuredSavingsPercent`
unless intentionally resetting the improvement gate for a new cycle.

```bash
# Merge published.* from bench/results/<timestamp>/summary.json into
# bench/baseline/summary.json (keep gateFloorMeasuredSavingsPercent: 40.9)
```

Document threshold changes in `specs/023-token-savings-accuracy/research.md`.

## CI

Contributors should run `npm run bench` before opening PRs that touch
`packages/core/src/tool-output-compress.ts`, `context-prune.ts`, `tool-precall.ts`,
or host hook logging. See [contributing.md](./contributing.md).
