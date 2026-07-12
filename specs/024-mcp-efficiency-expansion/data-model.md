# Data Model: MCP Efficiency Expansion

**Feature**: `specs/024-mcp-efficiency-expansion/`  
**Date**: 2026-07-12

## Entities

### EfficiencyTool (logical)

|MCP name | Core handler | Stats `source` | Measurement |
|---------|--------------|----------------|-------------|
| `smart_read` | existing | `smart_read` | measured |
| `trim_context` | existing | `trim` | measured |
| `get_stats` | existing | — | read-only |
| `diff_read` | `diffRead()` | `diff_read` | measured |
| `log_summary` | `summarizeLog()` | `log_summary` | measured |
| `code_search` | `searchCodebase()` | `code_search` | measured |
| `budget_planner` | `planBudget()` | — | none |

### DiffReadRequest

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `path` | string | yes | Absolute or cwd-relative; file must exist |
| `diff` | string | yes | Unified diff text (≥1 hunk) |
| `contextLines` | integer | no | Default 3; 0–20 |
| `budget` | integer | no | Max output tokens; default 1500 |

### DiffReadResult

| Field | Type | Notes |
|-------|------|-------|
| `output` | string | Formatted hunks with line numbers |
| `tokensIn` | integer | Full file token count |
| `tokensOut` | integer | Output token count |
| `tokensSaved` | integer | `tokensIn - tokensOut` (if positive) |
| `hunksIncluded` | integer | Count of hunks in output |

### LogSummaryRequest

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `text` | string | yes | Max 1MB |
| `budget` | integer | no | Default 2000 tokens |

### LogSummaryResult

| Field | Type | Notes |
|-------|------|-------|
| `output` | string | Error-centric summary |
| `tokensIn` | integer | Input log size |
| `tokensOut` | integer | Summary size |
| `tokensSaved` | integer | Delta |
| `errorsFound` | integer | Distinct error/failure identifiers |

### CodeSearchRequest

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `query` | string | yes | Min 1 char |
| `maxResults` | integer | no | Default 5; max 20 |
| `snippetBudget` | integer | no | Tokens per snippet; default 400 |
| `root` | string | no | Default `process.cwd()` |

### CodeSearchHit

| Field | Type | Notes |
|-------|------|-------|
| `path` | string | Repo-relative path |
| `score` | number | BM25 relevance |
| `snippet` | string | Bounded excerpt |
| `line` | integer | Starting line (1-based) |

### CodeSearchResult

| Field | Type | Notes |
|-------|------|-------|
| `hits` | CodeSearchHit[] | Ranked |
| `tokensSaved` | integer | Estimated vs reading full hit files |

### BudgetPlannerRequest

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `taskDescription` | string | yes | |
| `estimatedTokensIn` | integer | yes | Current context estimate |
| `model` | string | yes | Opaque label for plan header |
| `maxBudget` | integer | yes | Total read-token cap |

### BudgetPlanStep

| Field | Type | Notes |
|-------|------|-------|
| `order` | integer | 1-based sequence |
| `tool` | string | e.g. `code_search`, `trim_context` |
| `purpose` | string | One sentence |
| `budgetTokens` | integer | Step cap |

### BudgetPlanResult

| Field | Type | Notes |
|-------|------|-------|
| `steps` | BudgetPlanStep[] | Sum of `budgetTokens` ≤ `maxBudget` |
| `totalBudget` | integer | Sum of steps |
| `warnings` | string[] | If scope exceeds budget |

### SavingsRecord (extended)

Existing SQLite row shape unchanged. New `source` values:

- `diff_read`
- `log_summary`
- `code_search`

Logged via `logOptimizationSavings()` with `host: "mcp"`, `upstream` = tool name or path.

### AgentSkill (install artifact)

| Field | Source | Notes |
|-------|--------|-------|
| `name` | `ctxlite` | Frontmatter |
| `description` | skill-content.ts | Lists seven tools |
| `body` | skill-content.ts | Decision tree + conciseness |

## Relationships

```text
Agent → MCP tool → core function → (optional) logOptimizationSavings → stats.db
Agent → get_stats → StatsStore.summary() → includes new source columns
ctxlite install → skill-content.ts → host SKILL.md paths
```

## State transitions

N/A — stateless request/response tools except stats persistence.
