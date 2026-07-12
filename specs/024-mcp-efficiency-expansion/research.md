# Research: MCP Efficiency Expansion

**Feature**: `specs/024-mcp-efficiency-expansion/`  
**Date**: 2026-07-12

## R1 — New MCP tools: implementation strategy

### Decision: Four core modules + thin MCP handlers; no LLM inside MCP server

| Tool | Core module | Baseline for savings | Notes |
|------|-------------|----------------------|-------|
| `diff_read` | `diff-read.ts` | Full file `readFile` + `estimateTokens` | Parse unified diff hunks; extract line ranges from on-disk file with `contextLines` padding |
| `log_summary` | `log-summary.ts` | Raw log `estimateTokens` | Reuse error-line heuristics (FAIL, Error:, ✘, stack frames); cap retained lines by budget |
| `code_search` | `code-search.ts` | Hypothetical full-file reads of all matches | Walk workspace with `ctxliteignore`; `rg` or Node read + BM25 rank; return top-N snippets within `snippetBudget` |
| `budget_planner` | `budget-planner.ts` | N/A (no content reduction) | Rule-based template: classify task keywords → ordered steps with per-step budgets summing ≤ `maxBudget` |

**Rationale**: Constitution Core-First; MCP package already follows pattern in `smart-read.ts`, `trim-context.ts`. Live LLM calls in MCP would violate offline/fast/reproducible goals and complicate CI.

**Alternatives considered**:
- Embed search via external API — rejected (cost, secrets, flakiness).
- Implement `diff_read` as MCP-only without reading disk — rejected; agents often pass diff without full file in context; reading disk matches Cursor agent workflow.

---

## R2 — Code search v1: lexical only

### Decision: Workspace file walk + BM25 scoring over file contents (and paths), optional ripgrep subprocess for initial candidate filter

**Rationale**: `@ctxlite/core` already ships BM25 (`bm25.ts`) and `trimFiles` for relevance. v1 does not require embeddings. SC-005 satisfied with known symbol/string in fixture repo.

**Alternatives considered**:
- Semantic embeddings — rejected for v1 (dependency + model size); note as follow-up in spec assumptions.

**Limits**: Default max **500** files scanned per query; max **1MB** per file read; respect `ctxliteignore`.

---

## R3 — Stats `source` extension

### Decision: Add three measured sources: `diff_read`, `log_summary`, `code_search`

Log via existing `logOptimizationSavings()` with new `source` union members. Extend `StatsStore.summary()` CASE aggregates and `report.ts` breakdown rows (measured, no `(est.)`).

`budget_planner` does not log savings (planning only).

**Rationale**: FR-008 and SC-005/008 require attributable savings; folding into `smart_read` would blur mechanism metrics from `023`.

**Alternatives considered**:
- SQLite migration with CHECK constraint — rejected; `source` is TEXT, forward-only new values suffice.

**Blast radius**: `types.ts`, `stats.ts`, `report.ts`, `packages/cli` JSON export if breakdown extended — regression tests required.

---

## R4 — Unified skill delivery

### Decision: Replace `CTXLITE_SKILL_CONTENT` in `packages/core/src/install/skill-content.ts` with structured markdown derived from user spec (seven tools, decision tree, conciseness rules, caching intent)

Install paths unchanged (`paths.ts`): `.claude/skills/ctxlite/SKILL.md`, `.cursor/skills/ctxlite/SKILL.md`, `.opencode/skills/ctxlite/SKILL.md`.

Frontmatter `description` MUST list all seven tools in ≤1024 chars for host discovery.

Conciseness host rules (`ctxlite-conciseness.md` / `.mdc`) remain separate — skill references them, does not duplicate LICENSE stats support line.

**Rationale**: FR-001; existing install machinery and tests (`install.test.ts`) already validate skill write/idempotency.

---

## R5 — Release version

### Decision: Patch bump **0.1.36 → 0.1.37** at feature completion

Steps: edit root `package.json` `config.version` → `npm run sync-version` → `CHANGELOG.md` → verify `npm view @ctxlite/mcp version` < 0.1.37 → CI green → `publish:npm:live` (manual, out of implement scope).

**Rationale**: FR-011, SC-009, Constitution Release Discipline. Four new MCP tools are additive patch, not breaking API.

**Alternatives considered**:
- Minor 0.2.0 — rejected unless planning discovers breaking MCP schema changes (none expected).

---

## R6 — Input validation and security

### Decision: zod schemas at MCP boundary; core enforces max input size 1MB; paths resolved under `process.cwd()`; no logging of full file/log bodies

Align with `.cursor/rules/security.mdc` TypeScript rules.

**Rationale**: Log and search inputs may contain secrets; same discipline as existing tools.
