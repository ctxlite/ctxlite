# ctxlite live benchmarks

Real, model-in-the-loop validation suite (spec `026-opencode-output-token-efficiency`,
User Story 3) — distinct from the deterministic `../bench/` simulation suite.

Where `../bench/` replays fixed scenarios through pure functions to gate
against regressions, `bench-live/` shells out to a **real, locally installed
`opencode` CLI** against a **real (free-tier) model**, once with ctxlite's
OpenCode enforcement active and once with it disabled, and compares the
actual reported output-token cost. It exists to produce believable evidence
for the 70–90% output-token cost reduction target — not to gate every CI run.

See [../docs/benchmarks.md](../docs/benchmarks.md) for how this relates to
the deterministic suite.

## Quick start

```bash
npm run bench:live -- --mode both
```

Requires a local `opencode` CLI, authenticated for at least one free-tier
model (see `src/models.ts`).

## Layout

- `scenarios/` — representative task set (prompts, fixtures, expected edit intent)
- `src/` — CLI runner (`run.ts`), model config (`models.ts`), report builder (`report.ts`)
- `results/` — timestamped, logged, rerunnable run artifacts (git-ignored)

See `../specs/026-opencode-output-token-efficiency/contracts/bench-live-cli.md`
for the full CLI contract.
