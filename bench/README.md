# ctxlite benchmarks

Deterministic simulation suite that replays canonical agent-session scenarios
and verifies token-savings accuracy, logging alignment, and regression gates.

See [docs/benchmarks.md](../docs/benchmarks.md) for metrics, scenario list,
and how to interpret results.

## Quick start

```bash
npm run bench
```

Exit code `0` means `Regression Verdict: PASS` in `bench/results/<timestamp>/report.txt`.

Run a single host adapter:

```bash
npm run bench -- --adapter claude-code
```

## Layout

- `baseline/summary.json` — pinned gate floor (`measuredSavingsPercent` pre-improvement)
- `scenarios/` — canonical task definitions and fixtures
- `src/` — runner, report builder, adapters
- `results/` — timestamped run artifacts
