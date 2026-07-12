# Feature Specification: Token Savings Accuracy and Verification

**Feature Branch**: `023-token-savings-accuracy`

**Created**: 2026-07-12

**Status**: Ready for review

**Input**: User description: "identify gaps in token savings in opencode, misleading token counts, bugs on claude code and cursor, improve token savings accuracy, prove the improvements mechanism by simulating real tests, improve token saving accuracy by at least 15%, update documentation and metrics and tests in docs"

## Investigation Findings (pre-spec research, not a placeholder)

Verified against existing specs, architecture documentation, and benchmark artifacts already in the repository — not assumed:

1. **Token savings are reported through a mix of measured and estimated figures, which can mislead users who treat all numbers as equally precise.** `compress`, `prune`, `compact`, `smart_read`, and `trim` savings are derived from before/after content size. `precall` and `concise` use fixed heuristic estimates that can look suspiciously uniform (e.g., the same round number every time a rule matches). Users comparing categories or sessions without knowing this distinction can draw wrong conclusions about what ctxlite actually saved.
2. **OpenCode has the broadest optimization surface, but several mechanisms are host-limited or opt-in, creating apparent "gaps" that are partly real and partly measurement/labeling issues.** `prune`, `compact`, and `concise` measurement are OpenCode-only because those hosts do not expose the required hooks. `smart_read` and `trim` are opt-in and log under a separate host label when invoked through MCP, so filtering stats by `opencode` alone understates activity. `compress` is unavailable on Cursor for built-in tools — a documented platform constraint, not a wiring bug.
3. **Claude Code and Cursor have known data-quality and coverage bugs that reduce trust in reported savings.** Prior investigation (`specs/022-fix-upstream-tool-attribution/`) identified that `upstream` was logged as the host name instead of the real tool name, making per-tool analysis impossible. `specs/021-conciseness-instructions-non-opencode/` identified that conciseness instructions were not delivered to those hosts (instruction gap) and that `concise` savings cannot be measured there without fragile undocumented internals. Users inspecting `--by-session` output for Claude Code or Cursor see categories permanently at zero and may reasonably assume ctxlite is broken.
4. **A deterministic simulation harness already exists in the repository (`bench/results/`) with representative scenarios and a baseline savings rate (~9.3% in the latest archived run), but it is not yet treated as the authoritative proof mechanism for accuracy improvements.** The user explicitly wants improvements proven through realistic simulated tests and reflected in documentation — not only unit tests of isolated functions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Users see savings figures that match what actually happened (Priority: P1)

A ctxlite user checks savings after a coding session — in OpenCode, Claude Code, or Cursor — and the reported token reductions align with observable differences in tool output and context size. Heuristic categories are clearly distinguished from measured ones, and per-host limitations are not presented as silent zeros that look like failures.

**Why this priority**: Misleading or unexplained numbers undermine the product's core value proposition. Users cannot trust or act on savings they do not believe.

**Independent Test**: Run a fixed set of representative scenarios (large tool output, duplicate tool calls, noisy test commands, blocked reads, signature-only file reads) through each host's integration path; compare logged `tokens_saved` against independently counted before/after token totals for measured mechanisms, and against documented estimate rules for heuristic mechanisms. Confirm reported totals do not overstate savings by more than the agreed tolerance (see Success Criteria).

**Acceptance Scenarios**:

1. **Given** a tool output that is compressed from a known large payload to a smaller one, **When** savings are logged, **Then** the logged value is within 10% of the independently measured token difference (or uses the same counting method documented for users).
2. **Given** a `precall` rule match (e.g., quieting a test command), **When** savings are logged, **Then** the value follows a documented estimate rule — not a measured delta masquerading as one — and user-facing documentation states that `precall` figures are estimates.
3. **Given** a Claude Code or Cursor session where `upstream` attribution was previously wrong, **When** savings rows are written after the fix, **Then** each row identifies the real underlying tool, enabling users to understand which tools drove savings in that session.
4. **Given** a host or category that cannot apply a mechanism (e.g., `compress` on Cursor built-in tools, `prune` on Claude Code), **When** a user reads stats or documentation, **Then** the limitation is explained — not shown as a silent zero implying a bug.

---

### User Story 2 - Improvements are proven with realistic simulated sessions before release (Priority: P1)

A maintainer or reviewer runs a deterministic simulation suite that replays representative agent workflows (multi-step sessions with tool calls, context growth, and duplicate outputs) and produces a before/after report showing aggregate token savings, per-mechanism contribution, and correctness (tasks still pass). This report is the required evidence that accuracy improvements actually work end-to-end, not only in isolated unit tests.

**Why this priority**: The user explicitly requires proving the improvement mechanism through simulated real tests. Without this, heuristic tuning or bug fixes could regress unnoticed across hosts.

**Independent Test**: Execute the simulation suite against the current baseline, record aggregate savings rate and per-mechanism totals; apply improvements; re-run; confirm the suite passes correctness gates and shows at least a 15% relative improvement in aggregate measured savings rate (see Success Criteria). Archive results in a reproducible, reviewable format.

**Acceptance Scenarios**:

1. **Given** the simulation suite's canonical scenario set (covering each active mechanism on at least one host path), **When** run in baseline mode, **Then** it produces a summary report with aggregate savings rate, per-mechanism breakdown, and pass/fail correctness verdict.
2. **Given** accuracy improvements shipped under this feature, **When** the suite is re-run in the same deterministic mode, **Then** aggregate measured savings rate improves by at least 15% relative to the archived baseline without increasing correctness failures.
3. **Given** a regression that causes logged savings to diverge from measured reality beyond tolerance, **When** the suite runs, **Then** it fails with an identifiable scenario and mechanism — not a generic test failure.

---

### User Story 3 - Documentation and published metrics reflect honest, host-aware savings (Priority: P2)

A new or existing user reads ctxlite documentation and understands which optimizations apply on their host, which stats are estimates versus measurements, how to interpret `ctxlite stats` output (including `--by-session` and host filters), and how to run the simulation suite to verify savings locally. Published benchmark metrics in docs match the latest archived simulation results.

**Why this priority**: Accurate code without accurate docs still produces support burden and mistrust. The user explicitly asked to update documentation, metrics, and tests in docs.

**Independent Test**: Review updated documentation for: per-host capability matrix, estimate-vs-measured labeling, instructions to run the simulation suite, and a metrics table sourced from the latest archived run. Confirm no doc still implies all seven `source` categories work identically on every host.

**Acceptance Scenarios**:

1. **Given** a user reading architecture or configuration docs, **When** they look up their host (OpenCode, Claude Code, or Cursor), **Then** they find a clear table of which mechanisms are automatic, opt-in, unavailable, or estimate-only on that host.
2. **Given** the latest simulation run after improvements, **When** a maintainer updates docs, **Then** published aggregate savings rate and per-mechanism figures match the archived summary within rounding — not stale or hand-waved numbers.
3. **Given** a contributor following contributing docs, **When** they need to validate a savings-related change, **Then** they find step-by-step instructions to run the simulation suite and interpret its pass/fail output before opening a PR.

---

### Edge Cases

- What happens when a session has zero qualifying tool calls (no compressible output, no precall matches)? → Stats show zero savings for those categories; documentation explains this is expected, not a defect.
- What happens when heuristic estimates and measured savings apply to the same session? → Totals aggregate both types; user-facing output or docs distinguish estimate-derived rows from measurement-derived rows so users do not double-count or misinterpret precision.
- What happens on Cursor where built-in tool output cannot be compressed? → Savings from `compress` are legitimately zero; docs state the platform constraint and point users to mechanisms that still apply (`precall`, opt-in MCP tools, conciseness instructions).
- What happens when simulation scenarios include host-only mechanisms (e.g., `prune` on OpenCode only)? → Suite reports per-host/per-mechanism results separately; aggregate improvement target applies to the full canonical set, with exclusions documented when a mechanism cannot run on a host path.
- What happens to historical stats rows logged before accuracy fixes? → Forward-only correction; docs note that older rows may have incorrect `upstream` or inflated heuristic values and are not retroactively rewritten.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST audit all seven savings `source` categories (`precall`, `compress`, `prune`, `compact`, `smart_read`, `trim`, `concise`) and produce a written gap analysis identifying: (a) where logged savings diverge from measurable reality, (b) where heuristics are used, (c) where host platform constraints prevent a mechanism, and (d) confirmed bugs versus expected asymmetry — scoped to OpenCode, Claude Code, and Cursor integration paths.
- **FR-002**: System MUST verify and fix confirmed bugs that cause misleading savings data: confirm real-tool `upstream` attribution on Claude Code and Cursor per `specs/022-fix-upstream-tool-attribution/` (regression tests), and fix any additional attribution or logging defects discovered during the audit (OpenCode compress/smart_read were the new fixes in this feature).
- **FR-003**: System MUST calibrate or correct savings calculations so measured mechanisms (`compress`, `prune`, `compact`, `smart_read`, `trim`) log values within 10% of independently counted before/after token totals on the canonical simulation scenarios.
- **FR-004**: System MUST document heuristic mechanisms (`precall`, `concise`) as estimates in user-facing stats presentation or documentation — users MUST be able to tell estimate-derived figures from measured ones without reading source code.
- **FR-005**: System MUST provide a deterministic simulation suite covering representative multi-step agent workflows that: replays scenarios per active mechanism, computes aggregate and per-mechanism savings, checks task correctness, compares against an archived baseline, and fails on regression beyond defined tolerance.
- **FR-006**: System MUST demonstrate at least a 15% relative improvement in aggregate measured savings rate on the canonical simulation suite compared to the archived baseline, without increasing correctness failures — this is the release gate for accuracy work under this feature.
- **FR-007**: System MUST update documentation under `docs/` to include: per-host capability matrix, estimate-vs-measured explanation, how to run and interpret the simulation suite, and published metrics from the latest passing archived run.
- **FR-008**: System MUST NOT claim savings for mechanisms that did not run — zero rows for unavailable categories must not be presented in ways that imply broken integrations. Stats text output MUST include brief help explaining estimate labels and expected zeros per host; documentation and capability matrix address the rest.
- **FR-009 (explicitly out of scope)**: This feature does NOT add `prune`/`compact` to Claude Code or Cursor (confirmed platform constraint in `specs/021-conciseness-instructions-non-opencode/`). It does NOT measure `concise` savings on Claude Code or Cursor via undocumented transcript parsing. It does NOT retroactively rewrite historical SQLite rows. It does NOT add live LLM API calls to the simulation suite — scenarios use deterministic fixtures that mirror real agent sessions.

### Key Entities

- **Savings record**: A single logged optimization event with `source`, `host`, `upstream` (real tool name), `tokens_saved`, session identifier, and timestamp — stored in the user's local stats database.
- **Simulation scenario**: A reproducible multi-step workflow fixture (tool inputs/outputs, message history, task assertions) representing a real agent session pattern; mapped to one or more mechanisms and host paths.
- **Baseline report**: Archived summary from a pinned simulation run (aggregate savings rate, per-mechanism totals, correctness verdict) used as the before picture for improvement measurement.
- **Capability matrix**: User-facing documentation artifact listing, per host, which mechanisms are automatic, opt-in, unavailable, or estimate-only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the canonical simulation suite, aggregate **measured** savings rate (`measuredSavingsPercent`, excluding `precall` and `concise`) improves by at least **15% relative** to the pinned gate floor in `bench/baseline/summary.json` (e.g., gate floor **40.9%** → target **≥47.0%**) while correctness pass rate remains 100% on all scenarios. The archived June 2026 all-mechanisms rate (**9.3%** `savingsPercent`) is historical reference only — not the regression gate.
- **SC-002**: For every measured mechanism on the canonical scenarios, logged `tokens_saved` is within **10%** of independently counted before/after token totals — verifiable from simulation output without reading implementation code.
- **SC-003**: After fixes ship, **100%** of new `precall` rows on Claude Code and Cursor sessions in test runs carry the real tool name in `upstream`, not the host name. **100%** of new `compress` rows on Claude Code carry the real tool name. On Cursor, `compress` is not applicable to built-in tools (platform constraint) — verified by bench skip/pass, not by expecting compress rows.
- **SC-004**: Documentation in `docs/` includes an updated per-host capability matrix and a metrics section whose aggregate savings rate and per-mechanism figures match `bench/baseline/summary.json` → `baselineComparison.published` within **±0.5 percentage points** (or stated rounding).
- **SC-005**: A contributor can follow docs-only instructions to run the simulation suite and receive a pass/fail verdict with per-scenario breakdown in under **5 minutes** on a standard developer machine (excluding first-time dependency install).

## Assumptions

- The **15% improvement target** applies to **`measuredSavingsPercent`** on the full canonical simulation suite relative to **`gateFloorMeasuredSavingsPercent`** in `bench/baseline/summary.json` (pinned at **40.9%** from the pre-tuning June 2026 archive), not to all-mechanisms `savingsPercent` (**9.3%** archived reference) and not to heuristic estimate totals alone. Heuristic categories may be recalibrated but do not count toward the 15% gate unless their estimates are demonstrably closer to observed verbosity reductions on fixture scenarios.
- **"Simulating real tests"** means deterministic replay of realistic agent-session fixtures (tool I/O, conversation shape, task pass/fail checks) — not live model calls. This matches the existing `bench/results/` pattern and keeps verification fast, reproducible, and CI-friendly.
- **`specs/022-fix-upstream-tool-attribution/`** may already be implemented or in flight; this feature treats upstream attribution as a required fix if not yet shipped, and builds further accuracy work on top.
- **Token counting method** for verification uses the same counter ctxlite already uses internally for savings measurement, documented once in `docs/` so users and reviewers use one consistent definition.
- **OpenCode gaps** in this feature focus on accuracy and honest reporting (heuristic calibration, opt-in tool visibility, measurement alignment) — not on adding new host integrations beyond what platforms support today.
