# Quickstart: Validate MCP Efficiency Expansion

**Feature**: `specs/024-mcp-efficiency-expansion/`  
**Date**: 2026-07-12

## Prerequisites

```bash
cd ctxlite
npm install
npm run build
```

## 1 — Unit tests (core + MCP)

```bash
npm run typecheck && npm test
```

**Expected**: New tests pass for `diff-read`, `log-summary`, `code-search`, `budget-planner`, MCP handlers, updated `install.test.ts` skill assertions.

## 2 — MCP tool smoke (manual or scripted)

Start MCP server (or use Cursor with project `.cursor/mcp.json` after `ctxlite install cursor`):

```bash
npx @ctxlite/mcp
```

Verify tool list includes **seven** tools. Call each new tool with fixture inputs from `packages/core/src/*.test.ts` fixtures.

| Tool | Minimal check |
|------|----------------|
| `diff_read` | Path + unified diff fixture → output contains all hunks, smaller than full file |
| `log_summary` | Noisy log fixture → mentions each failure id; ≥80% smaller |
| `code_search` | Query matching known symbol → target file in top 3 |
| `budget_planner` | Large task + `maxBudget` → ≥3 steps, sum ≤ budget |

## 3 — Install skill on each host

```bash
npx ctxlite install claude-code
npx ctxlite install cursor
npx ctxlite install opencode
```

**Expected**: Each `SKILL.md` lists all seven tools per [contracts/skill-content.md](./contracts/skill-content.md).

## 4 — Agent behavior spot-check

With MCP enabled in Cursor:

1. Ask: "Explain the API of `packages/core/src/bm25.ts` without reading the full file" → agent should prefer `smart_read`.
2. Ask: "Where is authentication handled?" → agent should use `code_search` before bulk reads.
3. Ask: "How much has ctxlite saved today?" → agent must call `get_stats`, not estimate.

## 5 — Stats attribution

After running `diff_read`, `log_summary`, and `code_search` in a session:

```bash
npx ctxlite stats --last today
```

**Expected**: Breakdown includes new mechanisms (or documented aggregation) with non-zero rows when tools returned savings.

## 6 — Coverage gate

```bash
npm run test:coverage
```

**Expected**: Every `packages/*` package ≥ 90%.

## 7 — Release prep (FR-011)

```bash
npm view @ctxlite/mcp version
# Must be < bumped version

# After implement bumps config.version:
npm run sync-version
grep '"version"' packages/mcp/package.json  # all 0.1.37
npm run typecheck && npm test && npm run lint
```

**Expected**: `CHANGELOG.md` entry for 0.1.37 documents new MCP tools and skill update.

## Failure triage

| Symptom | Likely cause |
|---------|----------------|
| Tool missing in MCP list | `server.ts` registration not updated |
| `code_search` empty | `ctxliteignore` too aggressive or cwd wrong |
| Skill missing tool name | `skill-content.ts` not updated or install skipped |
| Stats show zero for new tools | `logOptimizationSavings` not called or source not in summary SQL |
| npm publish rejected | Version not bumped or already published |
