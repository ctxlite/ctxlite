# Feature Specification: MCP Efficiency Expansion and Agent Guidance

**Feature Branch**: `024-mcp-efficiency-expansion`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: Expand ctxlite's MCP surface and agent guidance so coding agents minimize token usage while staying correct — formalize behavior for `smart_read`, `trim_context`, and `get_stats`; add `diff_read`, `log_summary`, `code_search`, and `budget_planner` where missing; ship a unified token-efficiency skill for Cursor, Claude Code, and OpenCode; include caching/reuse guidance and conciseness rules. Bump npm package version when the feature is complete so it can be released.

## Investigation Findings (pre-spec research, not a placeholder)

Verified against the current repository — not assumed:

1. **Three MCP tools already ship** in `@ctxlite/mcp`: `smart_read` (signature-only file reads), `trim_context` (BM25 + import-graph file narrowing), and `get_stats` (token savings by period). Server instructions mention only these three; they do not cover diff-aware reads, log summarization, semantic code search, or budget planning.
2. **Four capabilities in the user description are not implemented as MCP tools today**: diff-focused reads, log summarization, codebase search with snippet budgets, and token-budget planning. Agents currently must approximate these intents with host-native `read`/`grep` or manual reasoning — higher token cost and inconsistent behavior.
3. **Token-efficiency guidance is fragmented**: conciseness rules exist in per-host rules/skills (`ctxlite-conciseness`), and a minimal ctxlite skill covers `smart_read`/`trim_context`, but there is no single authoritative skill matching the full decision tree (when to prefer structure reads vs full reads, multi-file narrowing, diff-aware work, log handling, stats queries, caching).
4. **Stats and savings attribution already distinguish mechanisms** (per `023-token-savings-accuracy`): new tools must log savings through existing stats patterns where they reduce tokens, and agent guidance must tell users to call `get_stats` instead of guessing savings.
5. **Release versioning is centralized**: all `@ctxlite/*` packages share `config.version` in root `package.json` (currently **0.1.36**), propagated via `npm run sync-version`. Constitution Release Discipline requires a version bump before publish — this feature must end with a bumped, releasable version.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agents read code with minimal tokens (Priority: P1)

A developer uses Cursor, Claude Code, or OpenCode with ctxlite MCP enabled. When the agent needs to understand a large source file, it calls `smart_read` first and only uses a full read when editing or debugging implementation details. The agent follows documented thresholds (e.g., prefer structure reads for files above roughly 2–3k tokens of content).

**Why this priority**: File reads dominate context size; signature-only reads are ctxlite's highest-leverage existing tool and must be the default agent behavior before adding new tools.

**Independent Test**: With MCP connected, prompt an agent to "explain the API of file X" for a large TypeScript file; verify it uses `smart_read` and receives signatures without bodies. Repeat without ctxlite — compare token volume qualitatively in tool output size.

**Acceptance Scenarios**:

1. **Given** a supported language source file larger than the documented threshold, **When** the agent needs structure or exports only, **Then** it uses `smart_read` (not a full read) and receives signatures-only output.
2. **Given** the agent must edit specific lines, **When** exact existing content is required, **Then** it may use a full read for that file only.
3. **Given** `smart_read` returns a budgeted fallback for an unsupported language, **When** the agent continues, **Then** output stays within the requested budget and does not include the full file.

---

### User Story 2 - Agents narrow multi-file context before reasoning (Priority: P1)

A developer asks for a cross-file investigation or refactor. The agent collects candidate files, calls `trim_context` with a task description and token budget, and continues only with the kept files — excluding the rest from further prompts unless the user changes scope.

**Why this priority**: Multi-file tasks are the second-largest token sink; `trim_context` already exists but agents often skip it without explicit guidance.

**Independent Test**: Provide 10+ candidate files and a focused task; verify `trim_context` returns a strict subset and the agent does not re-introduce excluded files in follow-up tool calls.

**Acceptance Scenarios**:

1. **Given** more than a handful of candidate files and a clear task description, **When** the agent plans context assembly, **Then** it calls `trim_context` before loading all files into reasoning.
2. **Given** `trim_context` excludes a file, **When** the agent continues the same task, **Then** that file is not read again unless the user expands scope.
3. **Given** a single small known file under the token budget, **When** the task is local, **Then** the agent may skip `trim_context` without penalty.

---

### User Story 3 - Agents work diff-aware and summarize noisy output (Priority: P2)

A developer asks for a code review or fix on a changed region, or pastes a large test/build log. The agent uses diff-focused reading and log summarization instead of reloading entire files or logs.

**Why this priority**: Review and CI-debug sessions repeatedly pay full-file and full-log token costs; these are the main gaps in the current MCP surface.

**Independent Test**: Provide a unified diff and a multi-thousand-line log fixture; verify new tools return hunk-focused code and an error-centric log summary within stated budgets.

**Acceptance Scenarios**:

1. **Given** a file path and a unified diff, **When** the task is review or incremental fix, **Then** the agent uses diff-focused reading to return changed hunks plus minimal surrounding context — not the whole file.
2. **Given** a large build or test log, **When** the agent needs failure diagnosis, **Then** it uses log summarization that surfaces errors, failing tests, stack traces, and material warnings within a budget.
3. **Given** diff-focused or log tools are unavailable in a host session, **When** the agent falls back, **Then** documented skill guidance still directs it to focus on changed regions or error lines manually.

---

### User Story 4 - Agents search and plan large investigations (Priority: P2)

A developer asks a semantic question ("where is authentication handled?") or starts a large refactor. The agent uses codebase search to find relevant snippets first, optionally combines with `trim_context`, and for very large tasks requests a token budget plan before unbounded exploration.

**Why this priority**: Search and upfront planning prevent exploratory reads that burn context on irrelevant files.

**Independent Test**: Ask a semantic location question across a monorepo fixture; verify search returns ranked paths and bounded snippets. For a large task prompt, verify budget planner returns an ordered step list respecting `maxBudget`.

**Acceptance Scenarios**:

1. **Given** a natural-language codebase question, **When** the agent does not know which files matter, **Then** it uses codebase search before reading many files at random.
2. **Given** search returns multiple candidates still exceeding budget, **When** narrowing is needed, **Then** the agent chains search → `trim_context` → `smart_read`/`diff_read` as appropriate.
3. **Given** a task described as large (wide refactor, long session), **When** planning begins, **Then** the agent uses budget planning to cap total read tokens and sequence tool usage.

---

### User Story 5 - Users and agents trust reported savings (Priority: P2)

A user asks whether ctxlite is saving tokens or what mechanisms contributed. The agent calls `get_stats` with an appropriate period and reports measured figures — never inventing savings.

**Why this priority**: Misreported savings erode trust; guidance must reinforce the stats tool delivered in prior work.

**Independent Test**: After a session using MCP tools, call `get_stats` for `session` and verify the agent's summary matches returned totals and source breakdown.

**Acceptance Scenarios**:

1. **Given** a user question about token savings or cost, **When** MCP is available, **Then** the agent calls `get_stats` with a matching period (`session`, `today`, `7d`, `30d`, `all`).
2. **Given** stats returned, **When** the agent explains results, **Then** it distinguishes estimate vs measured categories per published stats labeling and does not fabricate numbers.
3. **Given** new efficiency tools run successfully, **When** they reduce tokens, **Then** savings are attributable in stats under the correct mechanism name.

---

### User Story 6 - Unified efficiency skill ships to all supported hosts (Priority: P1)

A maintainer installs or updates ctxlite on OpenCode, Claude Code, or Cursor. Each host receives the same token-efficiency skill content (tool choice, thresholds, caching behavior, conciseness rules) via the existing install paths.

**Why this priority**: Tools only help when agents are instructed to use them; fragmented skills caused inconsistent adoption.

**Independent Test**: Run `ctxlite install` for each host target; verify the skill file contains the full decision tree and references all shipped MCP tools (existing + new). Spot-check that conciseness rules align with existing host rules without contradiction.

**Acceptance Scenarios**:

1. **Given** a fresh project install, **When** install completes for Cursor, Claude Code, and OpenCode, **Then** each host has the updated ctxlite efficiency skill at the documented path.
2. **Given** the skill text, **When** a reader follows it for a multi-file task, **Then** they can determine which tool to call at each step without reading source code.
3. **Given** a tool is not yet implemented, **When** the skill references it, **Then** it states the fallback intent clearly (as in the user description).

---

### User Story 7 - Releasable version bump on completion (Priority: P1)

A maintainer finishes this feature, validates tests and coverage, and prepares an npm release. The monorepo version is incremented once in root `config.version`, synchronized to all packages, and recorded in the changelog — ready for `publish:npm:live` without republish rejection.

**Why this priority**: User explicitly requested a version increase at the end so the feature can ship to users; Release Discipline is a constitutional requirement.

**Independent Test**: After implementation, verify `package.json` `config.version` is greater than the last published npm version, `npm run sync-version` leaves all `packages/*/package.json` versions aligned, and `npm view @ctxlite/mcp version` (or equivalent) is strictly less than the bumped version.

**Acceptance Scenarios**:

1. **Given** all feature tasks complete and CI green, **When** the release maintainer prepares publish, **Then** root `config.version` has been bumped by at least one patch (or minor if warranted) from **0.1.36**.
2. **Given** the bump, **When** `npm run sync-version` runs, **Then** every workspace package reports the same new version.
3. **Given** the release, **When** changelog is updated, **Then** it summarizes new MCP tools, skill updates, and any behavior changes visible to users.

---

### Edge Cases

- What happens when MCP is not connected? → Skill guidance still applies using host-native tools with the same intent (budgeted reads, focused regions, concise answers).
- What happens when a requested file does not exist or path is outside workspace? → Tools return a clear validation error; agents do not retry unbounded.
- What happens when `trim_context` or search input exceeds size limits? → Reject with a bounded error message; document max input size for agents.
- What happens when diff input is malformed? → `diff_read` returns a parse error without partial misleading output.
- What happens when log input has no errors? → `log_summary` returns a compact "no failures detected" view rather than echoing the full log.
- What happens when budget planner cannot fit the task under `maxBudget`? → Return a plan that states what cannot fit and suggests raising budget or narrowing scope — not a silent overrun.
- What happens when the same file is read repeatedly unchanged? → Skill instructs reuse of prior tool output; optional future cache is out of scope unless explicitly added in planning.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST ship or update unified token-efficiency agent guidance (skill) covering: tool selection order, read thresholds, multi-file narrowing, diff-aware work, log handling, stats queries, caching/reuse behavior, and response conciseness — installable on OpenCode, Claude Code, and Cursor via existing install machinery.
- **FR-002**: System MUST preserve and document behavior for existing MCP tools `smart_read`, `trim_context`, and `get_stats`, aligning names and descriptions with the skill (snake_case tool IDs in MCP; human-readable names in skill prose).
- **FR-003**: System MUST add MCP tool `diff_read` that, given a file path and diff (or line ranges), returns only affected regions plus configurable surrounding context, within a token budget.
- **FR-004**: System MUST add MCP tool `log_summary` that compresses large build/test/log text into an error-centric summary (failures, stack traces, key warnings) within a token budget.
- **FR-005**: System MUST add MCP tool `code_search` that, given a query, returns ranked file paths and bounded code snippets relevant to the query (lexical search at minimum; semantic enhancement optional if it does not violate offline/no-live-LLM constraints for the MCP server).
- **FR-006**: System MUST add MCP tool `budget_planner` that, given task description, estimated context size, model identifier, and max budget, returns an ordered plan of tool steps with per-step token budgets for large tasks.
- **FR-007**: System MUST implement new tool business logic in `@ctxlite/core` where reusable; MCP package remains a thin adapter per constitution Core-First Architecture.
- **FR-008**: System MUST log measurable token savings for new tools through existing stats mechanisms where they reduce content vs a full read/log/search baseline.
- **FR-009**: System MUST update MCP server instructions and user-facing docs (`docs/`) to list all tools, when to use each, and fallback behavior when a tool is unavailable.
- **FR-010**: System MUST include tests for every new or changed behavior in `packages/core` and `packages/mcp` per constitution Principle II (no skipped tests; maintain ≥90% coverage per package).
- **FR-011**: System MUST bump root `package.json` `config.version` and run `npm run sync-version` as the final release-prep step before calling the feature complete — increment at least patch from the version at feature start (**0.1.36**), update `CHANGELOG.md`, and verify the new version is not already published on npm.
- **FR-012 (explicitly out of scope for v1)**: Persistent cross-session tool-result cache in SQLite or disk (beyond agent session memory and existing hook compress cache). Skill may describe reuse behavior; a formal cache service is a follow-up unless planning proves it essential.

### Key Entities

- **Efficiency tool**: An MCP-callable capability with validated inputs, bounded output, and optional stats logging (`smart_read`, `trim_context`, `get_stats`, `diff_read`, `log_summary`, `code_search`, `budget_planner`).
- **Agent skill**: Host-installed markdown instructions that tell agents when and how to invoke efficiency tools and fallbacks.
- **Token budget**: A numeric cap on tokens returned by a tool or planned for a task step.
- **Savings record**: Existing stats row attributing tokens saved to a mechanism when a tool returns less content than the baseline alternative.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a canonical large-file fixture (≥8k tokens), `smart_read` output is at least **60% smaller** than a full file read while still exposing all top-level signatures exports callers need for an API-understanding task (verified by fixture test).
- **SC-002**: For a canonical 10-file candidate set and fixed task query, `trim_context` reduces the kept set to **≤50%** of input files while retaining a file that contains the answer (fixture test with known target file).
- **SC-003**: For a canonical unified diff fixture, `diff_read` output is at least **70% smaller** than a full file read and includes every changed hunk (fixture test).
- **SC-004**: For a canonical noisy log fixture (≥5k tokens, embedded failures), `log_summary` output is at least **80% smaller** than raw log and mentions every distinct failing test or error identifier in the fixture (fixture test).
- **SC-005**: For a canonical monorepo snippet index fixture, `code_search` returns the known relevant file in the **top 3** results with at least one snippet containing the matching symbol or string (fixture test).
- **SC-006**: For a large-task prompt fixture, `budget_planner` returns a plan whose summed per-step read budgets is **≤ `maxBudget`** and lists at least **3** ordered steps using named efficiency tools (fixture test).
- **SC-007**: After install on each supported host, the efficiency skill is present and mentions all **seven** tools by name or documented alias — verifiable by install integration test or documented manual checklist.
- **SC-008**: When the user asks about savings in an MCP-enabled session, agent evaluation checklist shows **`get_stats` invoked** in ≥**90%** of scripted test prompts (manual or automated prompt suite).
- **SC-009**: On feature completion, published workspace version is **> 0.1.36**, all packages synchronized, changelog entry present, and `npm run typecheck && npm test && npm run lint` pass on the release commit.

## Assumptions

- MCP tool IDs use **snake_case** (`smart_read`, `trim_context`, `get_stats`, `diff_read`, `log_summary`, `code_search`, `budget_planner`) even when skill prose uses condensed names (`smartread`, etc.).
- **Code search v1** may use existing BM25/ripgrep-style lexical search in core; live LLM calls inside the MCP server are out of scope unless planning documents an offline alternative.
- **Budget planner v1** returns a structured text/JSON plan for the agent to follow — it does not autonomously execute tools.
- **Diff input v1** accepts unified diff text or equivalent hunk descriptors; provider-specific diff formats are normalized at the MCP boundary.
- Host-native `read`/`grep` remain available; ctxlite tools are opt-in via MCP but strongly preferred by skill rules.
- Version bump is **patch** by default (0.1.36 → 0.1.37) unless new tools are deemed a minor feature release during planning.
- Existing conciseness host rules remain; the unified skill **extends** rather than replaces LICENSE-mandated support line behavior in stats output.
