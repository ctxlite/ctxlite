# Contract: `bench-live` harness CLI

**Surface**: new `bench-live/src/run.ts`, invoked via an npm script (e.g.
`npm run bench:live`), mirroring the existing `npm run bench` convention for
the deterministic suite.

## Command

```
npm run bench:live -- [--task <taskId>] [--mode enforced|disabled|both] [--rerun <runId>] [--model <modelId>]
```

| Flag | Default | Meaning |
|---|---|---|
| `--task <taskId>` | all tasks in `bench-live/scenarios/` | Run a single task instead of the full representative set |
| `--mode` | `both` | Run with ctxlite enforcement `enforced`, `disabled`, or `both` (sequential, for direct comparison) |
| `--rerun <runId>` | none | Repeat the exact task set/mode of a prior `runId` from `bench-live/results/`, for SC-002 stability checks |
| `--model <modelId>` | value in `bench-live/src/models.ts` | Override the configured free-tier model |

## Preconditions

- A local `opencode` CLI is installed and authenticated for the target model
  (harness fails fast with a clear error if not — same "clear, specific
  error" bar as FR-014, applied here to harness usability).
- The OpenCode ctxlite plugin is installed in the environment the harness
  invokes, so `--mode enforced` actually exercises the plugin hooks under
  test.

## Output

- Writes one JSON file per `Benchmark Run` record (see `data-model.md`) under
  `bench-live/results/<runId>/`, plus a `summary.json` aggregating: total
  output tokens per mode, computed percent reduction (`enforced` vs.
  `disabled`), and pass/fail against the SC-001 70–90% band.
- Writes a human-readable `report.txt` (mirrors `bench/results/<ts>/report.txt`
  convention) stating `Live Regression Verdict: PASS|FAIL` plus the measured
  reduction percentage, for quick local inspection and CI log reading.
- Exit code `0` only when every task's measured reduction meets the SC-001
  floor (≥70%) and SC-003 (no correctness regression on any task); non-zero
  otherwise, so the harness is usable as a gate, not just a report generator.

## Non-goals

- Does **not** replace or feed into the existing `bench/baseline/summary.json`
  regression gate — that gate stays deterministic/simulation-based (see
  research.md §5). `bench-live` is an independent, evidence-producing check.
- Does **not** run in the default `npm test`/CI-on-every-PR path by default
  (it depends on live model access and is not deterministic run-to-run in the
  same way); it is intended for pre-release validation and ad hoc reruns per
  User Story 3, invoked explicitly.
