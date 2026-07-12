# Implementation Plan: MCP Efficiency Expansion and Agent Guidance

**Branch**: `main` (no dedicated feature branch — consistent with `017`–`023`) | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-mcp-efficiency-expansion/spec.md`

## Summary

Expand ctxlite's agent-facing efficiency surface: add four MCP tools (`diff_read`, `log_summary`, `code_search`, `budget_planner`) with business logic in `@ctxlite/core`, extend stats attribution for new measured mechanisms, replace the minimal install skill (`skill-content.ts`) with the full token-efficiency decision tree from the spec, update MCP server instructions and `docs/`, and close with a synchronized **0.1.37** version bump + changelog for npm release.

Existing tools (`smart_read`, `trim_context`, `get_stats`) keep behavior; skill and docs align naming and when-to-use guidance.

## Technical Context

**Language/Version**: TypeScript (Node 18+ ESM), monorepo packages `@ctxlite/core`, `@ctxlite/mcp`, `@ctxlite/cli` (install only).

**Primary Dependencies**: Existing `@ctxlite/core` (`bm25`, `trimFiles`, `smart-read`, `estimateTokens`, `stats`); MCP SDK `@modelcontextprotocol/sdk`; `zod` input validation at MCP boundary; **no live LLM** inside MCP server (budget planner is rule-based).

**Storage**: SQLite `~/.ctxlite/stats.db` — extend `source` values (`diff_read`, `log_summary`, `code_search`) in logging + summary queries; no new tables. Skill content in `packages/core/src/install/skill-content.ts`, installed to host paths via existing `ctxlite install`.

**Testing**: Vitest per package; fixture-driven tests in `packages/core` for diff/log/search/planner; MCP handler tests with temp dirs; install tests verify skill mentions seven tools; maintain ≥90% coverage per package.

**Target Platform**: MCP stdio server (Cursor, Claude Desktop, Claude Code MCP config); skill via install on OpenCode, Claude Code, Cursor.

**Project Type**: Monorepo library — core logic + thin MCP adapters + install skill bundle.

**Performance Goals**: Each MCP tool returns within **2s** on canonical fixtures on a dev laptop; `code_search` caps workspace walk (default max files scanned, configurable).

**Constraints**: Core-first (Principle IV); 1MB max processed text per tool input (align with security rules); paths validated under workspace cwd; `budget_planner` does not execute tools; persistent cross-session cache out of scope (FR-012).

**Scale/Scope**: 4 new core modules + 4 MCP tool files; 1 skill rewrite; stats/report extensions; docs update; version **0.1.36 → 0.1.37**.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Benefit** — Agents using ctxlite MCP reduce tokens on reads, diffs, logs, and search-heavy tasks with explicit tool choice (measurable: SC-001–SC-006 fixture compression ratios; SC-007 skill present on all hosts). Users get a releasable **0.1.37** with four new tools and one authoritative skill.

**Risk** — (1) `stats.ts` summary SQL and `report.ts` breakdown must stay in sync when adding sources — same class of regression as `023`. (2) `code_search` workspace walks must respect `ctxliteignore` and size limits. (3) Skill content size — very long skill may dilute host discovery; mitigate with structured sections and frontmatter description listing all tools.

**Validation** — Vitest fixtures per SC-001–SC-006; `packages/mcp/src/server.test.ts` registers seven tools; `install.test.ts` skill content assertions; manual quickstart §1–§4 with Cursor MCP connected; release step: `npm view @ctxlite/mcp version` vs bumped `config.version`, `npm run sync-version`, full CI.

**Cross-tool availability** — MCP tools uniform wherever MCP is configured (Cursor, Claude Code, Claude Desktop). Skill installs on OpenCode, Claude Code, Cursor via `ctxlite install`. Hosts without MCP still get skill fallbacks (native read/grep). `budget_planner` and `code_search` are MCP-only in v1 (no hook equivalent) — documented asymmetry.

*Gate result: PASS (pre-design and post-design). No violations to justify.*

## Project Structure

### Documentation (this feature)

```text
specs/024-mcp-efficiency-expansion/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── mcp-tools.md     # MCP tool schemas + behavior
│   └── skill-content.md # Install skill contract
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/core/src/
├── diff-read.ts              # NEW — parse diff, extract hunks + context
├── diff-read.test.ts
├── log-summary.ts            # NEW — error-centric log compression
├── log-summary.test.ts
├── code-search.ts            # NEW — workspace lexical search + snippets
├── code-search.test.ts
├── budget-planner.ts         # NEW — rule-based tool-step plan
├── budget-planner.test.ts
├── install/skill-content.ts  # MODIFIED — full efficiency skill
├── stats.ts                  # MODIFIED — new source aggregates
├── report.ts                 # MODIFIED — optional new breakdown rows
├── types.ts                  # MODIFIED — source union
└── index.ts                  # MODIFIED — exports

packages/mcp/src/
├── server.ts                 # MODIFIED — register 4 tools + instructions
├── tools/
│   ├── diff-read.ts          # NEW
│   ├── diff-read.test.ts
│   ├── log-summary.ts        # NEW
│   ├── log-summary.test.ts
│   ├── code-search.ts        # NEW
│   ├── code-search.test.ts
│   ├── budget-planner.ts     # NEW
│   └── budget-planner.test.ts

docs/
├── architecture.md           # MODIFIED — MCP tool table
└── configuration.md          # MODIFIED — MCP tool list (if present)

package.json                  # MODIFIED — config.version 0.1.37 at release
CHANGELOG.md                  # MODIFIED — release notes
```

**Structure Decision**: All reusable logic in `@ctxlite/core`; MCP handlers validate with zod, call core, log stats. Skill lives in `install/skill-content.ts` (single source for three hosts). No new npm packages.

## Phase 0: Research (complete)

See [research.md](./research.md).

## Phase 1: Design (complete)

| Artifact | Path | Status |
|----------|------|--------|
| Data model | [data-model.md](./data-model.md) | ✅ |
| MCP contract | [contracts/mcp-tools.md](./contracts/mcp-tools.md) | ✅ |
| Skill contract | [contracts/skill-content.md](./contracts/skill-content.md) | ✅ |
| Quickstart | [quickstart.md](./quickstart.md) | ✅ |

### Implementation phases (for `/speckit-tasks`)

**Phase A — Core modules (FR-003–FR-006, FR-007)**  
Implement `diff-read`, `log-summary`, `code-search`, `budget-planner` in core with fixture tests meeting SC-003–SC-006.

**Phase B — Stats attribution (FR-008)**  
Extend `OptimizationLog` / `RequestLog.source` and `StatsStore.summary()` for `diff_read`, `log_summary`, `code_search`; optional `report.ts` rows (measured).

**Phase C — MCP adapters (FR-002, FR-009)**  
Register tools in `server.ts`; update `SERVER_INSTRUCTIONS`; handler tests.

**Phase D — Skill + install (FR-001, SC-007)**  
Rewrite `CTXLITE_SKILL_CONTENT` from user spec (condensed where needed); update `install.test.ts` assertions.

**Phase E — Docs (FR-009)**  
`docs/architecture.md` MCP section; tool when-to-use table.

**Phase F — Release (FR-011, SC-009)**  
Bump `config.version` to **0.1.37**, `npm run sync-version`, `CHANGELOG.md`, verify npm not already at version.

## Complexity Tracking

No violations — table intentionally left empty.

## Post-Design Constitution Re-check

Principle VI fields remain concrete. New tools have named fixture tests; MCP-only asymmetry for search/planner is documented; release step explicit. **Ready for `/speckit-tasks`.**
