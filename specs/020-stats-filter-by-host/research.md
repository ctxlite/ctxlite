# Research: Filter `ctxlite stats` by Host

No `[NEEDS CLARIFICATION]` markers exist in spec.md — most investigative work already happened pre-spec (see spec.md's Investigation Findings, grounded in reading the actual `stats.ts`/`stats-command.ts` source). This phase documents the remaining concrete parsing/SQL decisions.

## Decision 1: Where the positional host token is recognized in `parseArgs`

**Decision**: Inside the existing loop in `parseArgs`, only when `args.subcommand === "stats"` (the same condition the existing `switch (arg)` block for `--last`/`--export`/etc. already runs under), check each non-flag token against the 4 known host values (case-insensitive) before falling into the `switch`. If it matches, set `args.host` (a new field, normalized to lowercase) and continue; if it doesn't match any known value, set `args.host` to the raw token anyway (so `runStats` can distinguish "no host given" from "an unrecognized host given" — see Decision 3) rather than silently dropping it as today.

**Rationale**: `parseArgs` already has a `args.subcommand !== null && args.subcommand !== "stats"` guard that skips the switch entirely for `install`/`hook` (so their own positional args land in `args.rest`, untouched) — reusing the inverse of that same condition is the minimal, lowest-risk way to scope this new behavior to exactly `stats`, with zero chance of touching `install`/`hook`'s existing passthrough logic (which has its own regression tests already, per `plan.md`'s Risk field).

**Alternatives considered**:
- A new `--host <name>` flag instead of a positional token: rejected — the user explicitly requested the positional form (`stats opencode`, not `stats --host opencode`), and spec.md's Assumptions already documents this choice.
- Treating ANY unrecognized non-flag token as a host filter unconditionally (no validation against the known list): rejected — this would make an actual user typo (`--alst` mistyped, or a stray word) get misinterpreted as a host filter rather than reported, which fails spec FR-005's "never silently misbehave" requirement; checking against the known list lets `runStats` give a precise, helpful error.

## Decision 2: SQL filter shape in `stats.ts`

**Decision**: `summary(since = 0, host?: string)` builds its existing `filterSql`/`filterParams` by conditionally appending `AND host = ?` (with `host` pushed onto `filterParams`) only when `host` is provided, before calling the existing private `summaryWithFilter`. `sessionBreakdown(since = 0, host?: string)` does the same against its own existing `WHERE host IS NOT NULL AND session_id IS NOT NULL AND (? = 0 OR ts >= ?)` clause.

**Rationale**: Both methods already build a SQL string + a parallel params array and pass them to a parameterized query (`?` placeholders) — appending one more `AND host = ?` / pushing one more param is the smallest possible change that reuses the exact existing safety property (no string-interpolated user input ever reaches the SQL text itself, only placeholder values). No new query method, no new private helper needed.

**Alternatives considered**:
- Filtering the JS-side result array after an unfiltered query, instead of filtering in SQL: rejected — wastes work (scans every host's rows just to discard most of them) for no benefit, when the column is already indexed and a `?`-bound equality filter is the simplest correct approach.
- Adding a third, host-specific query method (`summaryForHost(host, since)`) instead of extending the existing two: rejected — would duplicate most of `summaryWithFilter`'s logic for no real benefit over an optional parameter, and callers that want "no filter" would need a different method name instead of just omitting an argument.

## Decision 3: Distinguishing "no host filter" from "unrecognized host filter" in `runStats`

**Decision**: `args.host` is `undefined` when no positional token was given at all (unchanged call site behavior — `summary(since)` with no second arg). It's a known-valid lowercase string when the token matched one of the 4 values. It's the original (non-normalized) raw token, unmatched, when the user typed something else — `runStats` checks this case explicitly first and writes the FR-005 error message (naming the 4 valid values) to stderr, returning a non-zero exit code, before running any query at all.

**Rationale**: This three-way distinction (absent / valid / invalid) is the only way to satisfy both FR-004 (zero behavior change when absent) and FR-005 (never silently behave as if no filter were given, when an unrecognized token was actually typed) simultaneously — collapsing "invalid" into either of the other two cases would violate one of the two requirements.

**Alternatives considered**: Throwing/crashing on an unrecognized host instead of a clean stderr message + exit code: rejected — every other `runStats` validation failure (invalid `--last` period, invalid `--export` format) already uses the stderr-message-plus-return-1 pattern, not a thrown exception; matching that existing convention keeps the CLI's error-handling style consistent.
