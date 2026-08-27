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

## Live benchmarks (`bench-live/`)

`bench/` above is deterministic — it replays fixed scenarios through pure
functions and never calls a real model. It's what gates regressions in CI.

`bench-live/` (spec `026-opencode-output-token-efficiency`, User Story 3) is
a **separate, non-deterministic** suite that shells out to a real, locally
installed `opencode` CLI against a real free-tier model, once with ctxlite's
OpenCode enforcement active and once disabled (`--pure`), and compares actual
reported output tokens. It exists to validate the output-token cost
reduction claim against reality — it is **not** part of the CI regression
gate (it needs live model access and isn't repeatable run-to-run the way the
deterministic suite is), and it does not feed `bench/baseline/summary.json`.

```bash
npm run bench:live -- --mode both
```

See `bench-live/README.md` and
`specs/026-opencode-output-token-efficiency/contracts/bench-live-cli.md` for
the full CLI contract, and the spec's `research.md` §5 for why the two
suites are kept separate.

**Honest finding from the first real, scripted `bench-live` run**
(`bench-live/results/2026-08-27T05-38-37-596Z/`, model `opencode/big-pickle`,
task `inspect-large-module-structure`): the block-and-redirect enforcement
measured an **11.6% reduction in output tokens** (277 → 245), well short of
the 70–90% target — while *input/context* tokens dropped **26.7%**
(14,827 → 10,864, from the blocked full read being served via `smart_read`
instead). SC-001 ("≥70% output-token cost reduction") is **not met** by this
mechanism alone, on this task, as measured.

This is the real, load-bearing conclusion of this feature: blocking large
full reads is genuinely effective at cutting *input/context* tokens, but
output token count is driven by how much the model chooses to write, which
this mechanism barely touches — the model wrote a similarly-sized answer
whether it read the file's full content or just its structure.

### Complementary mechanism attempted: anti-table / anti-restatement system prompt rules

To try to close the gap, the conciseness system prompt
(`packages/opencode/src/system-prompt.ts`) was strengthened with explicit,
imperative formatting rules: never use a markdown table for enumerations
(bullet lists only — tables cost real tokens on header/separator rows for
zero extra information), and don't restate an item's category or the same
fact twice. Four real paired runs against free-tier models
(`opencode/big-pickle`, `opencode/nemotron-3-ultra-free`) measured:

| Attempt | Output tokens (enforced vs. disabled) | Reduction |
|---|---|---|
| Baseline (before this rule) | 245 vs 277 | 11.6% |
| First (subtler) wording, ignored by the model | 354 vs 277 | **-27.8% (regression)** |
| Forceful wording ("NEVER... no exceptions"), solo run | 251 vs 277 | 9.4% |
| Same forceful wording, fresh paired run | 227 vs 278 | 18.3% |
| `nemotron-3-ultra-free`, same forceful wording | table used anyway | not comparable |

**Honest conclusion: this mechanism does not reliably work.** The free-tier
models tested comply with the "never use a table" instruction inconsistently
— sometimes fully, sometimes not at all, regardless of how forcefully it's
worded or where it's placed in the system prompt — because free-tier models
generally have weaker instruction-following fidelity than premium ones.
Prompt-only output shaping cannot be *forced*; it can only be requested, and
a model that doesn't reliably comply cannot deliver a reliable percentage.

The system prompt change was kept (it does help on the runs where the model
follows it, and never actively contradicts anything else in the prompt), but
it should **not** be reported as closing the gap. Two real paths remain, each
with a real cost:

1. **Retest against a stronger (non-free) model.** Premium models generally
   follow explicit formatting instructions far more reliably — the same
   mechanism might land close to the target there. Free-tier models were
   used here specifically because that's what was asked for; this would be
   a deliberate scope change.
2. **A hard output-length cap** (`max_tokens` / stop sequence) instead of a
   prompt request — deterministic, not compliance-dependent, but it is
   dangerous: a cap sized for this task's short answer would truncate a
   longer, legitimately-necessary answer on a different task, which is
   exactly the "affects model performance/intelligence" outcome this
   feature was explicitly told to avoid (spec Assumptions). Not applied
   here without an explicit decision to accept that trade-off.

Reaching 70–90% (or even a reliable 50%) specifically on *output* tokens, on
a free-tier model, via prompting alone, is not demonstrated to be achievable
by the evidence gathered in this feature. This is reported plainly, not
smoothed over, because that is the entire point of `bench-live` existing.

### Second attempt: schema-forced `concise_reply` tool

External research (OpenCode maintainer statements + GitHub issues, see the
sourcing notes kept alongside this feature's implementation history)
confirmed independently: there is no first-class OpenCode knob that shortens
prose specifically — `limit.output`/`max_tokens` is a hard generation
ceiling that would truncate code edits along with prose, and structured
output on the SDK path (`session.prompt({ outputFormat })`) isn't wired into
the interactive agent loop's final message. The one credible untried lever
the research surfaced: add a plugin tool with a small, length-capped
argument schema (`concise_reply`, `packages/opencode/src/tools.ts`) and
instruct the model to answer *only* through it for pure explain/list tasks
— a schema is generally harder to sidestep than a prose request, since
malformed tool args fail validation instead of silently rendering.

Implemented and tested live against `opencode/big-pickle`: **the model
ignored the tool entirely** and answered with free text anyway — 223 output
tokens vs. a ~277-token baseline (≈20% reduction), no better than the plain
system-prompt instruction. The tool was available and described exactly as
the research recommended; the model simply didn't choose to call it. This
model's tool-use compliance is opt-in, not enforced by OpenCode's agent
loop, so a tool schema doesn't force anything it wasn't already free to
ignore in prose.

**Converged conclusion, from two independent lines of evidence** (empirical
testing here + external maintainer/issue-tracker research): on free-tier
OpenCode models, there is no reliable mechanism — prompt instruction,
"never do X" wording, or tool-schema forcing — that reduces output tokens
by 50%+ without either (a) depending on the model's voluntary compliance
(measured ceiling: ~10–20%, one regression case), or (b) a hard
`max_tokens`/`limit.output` cap, which risks truncating a legitimately
longer, correct answer on other tasks — the exact "don't affect model
performance" outcome this feature was told to avoid. The `concise_reply`
tool was kept (harmless — an unused tool the model can ignore costs nothing
extra), but is not a solution to the output-token target.

### Third attempt: retest against a premium (non-free) model

To rule out "the free-tier models just don't follow instructions" as the
root cause, the same paired task was run against `opencode/claude-sonnet-5`
(a paid, non-free-tier model) with real API spend.

- Same task, "never use a table" rule only: **the model complied fully**
  (no table, clean bullets) — and still only reached **12.4%** output-token
  reduction (550 → 482 tokens). Compliance was not the bottleneck here; the
  model's natural, complete, correct answer for this task is simply that
  long once table syntax is removed.
- Adding a hard, explicit numeric constraint ("≤12 words per item
  description, drop parentheticals/examples") on the same model: **the
  model did not comply** — it kept ~30+ word descriptions with the exact
  parenthetical asides it was told to drop — landing at **14.4%** (550 →
  471), no improvement.

**This is the converged, final conclusion, from three independent models
(two free-tier, one premium) and two independent research paths (live
testing + external maintainer/issue-tracker research):** removing
formatting overhead (tables, restatement) recovers roughly 10–20% of output
tokens on this class of task, on any model tested regardless of price tier
or instruction-following quality — because that overhead is genuinely only
~10–20% of a complete, correct answer's length. Compliance was ruled out as
the limiting factor. Going meaningfully past that ceiling means the model
saying materially *less content*, not just less formatting — and no
mechanism tested (prompt instruction, imperative wording, explicit word
caps, tool-schema forcing) reliably produces that without either the model
declining to comply or a hard `max_tokens` cap that risks truncating a
longer, legitimately correct answer on a different task.
