# Contract: MCP Efficiency Tools

**Version**: 1.0  
**Feature**: `specs/024-mcp-efficiency-expansion/`

## Server

- **Name**: `ctxlite`
- **Transport**: stdio (existing)
- **Tools after feature**: 7

## Tool: `diff_read`

**Purpose**: Return only diff-affected regions of a file plus surrounding context.

### Input (zod)

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `path` | string | yes | — |
| `diff` | string | yes | — |
| `contextLines` | number (int, 0–20) | no | 3 |
| `budget` | number (int, positive) | no | 1500 |

### Output

Markdown text:

```text
## diff_read <path>
### hunk @ L<start>-<end>
``` 
<lines>
```
(repeat per hunk until budget exhausted)
```

### Errors

| Condition | Response |
|-----------|----------|
| File not found | Error text, no partial output |
| Unparseable diff | Error text |
| No hunks for path | Error text |

### Stats

Log `source: diff_read` when `tokensSaved > 0`.

---

## Tool: `log_summary`

**Purpose**: Compress noisy logs to failures, errors, stack traces, warnings.

### Input

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `text` | string | yes | — |
| `budget` | number (int, positive) | no | 2000 |

### Output

```text
## log_summary
<error-centric lines>
```

If no errors: `No failures detected in log (N tokens scanned).`

### Stats

Log `source: log_summary` when `tokensSaved > 0`.

---

## Tool: `code_search`

**Purpose**: Rank workspace files and return bounded snippets for a query.

### Input

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `query` | string | yes | — |
| `maxResults` | number (int, 1–20) | no | 5 |
| `snippetBudget` | number (int, positive) | no | 400 |
| `root` | string | no | cwd |

### Output

```text
## code_search "<query>"
1. path/to/file.ts (score X.X) L42
```snippet```
...
```

### Stats

Log `source: code_search` with estimated savings vs reading full top-hit files.

---

## Tool: `budget_planner`

**Purpose**: Return ordered tool plan under a token budget (does not execute).

### Input

| Field | Type | Required |
|-------|------|----------|
| `taskDescription` | string | yes |
| `estimatedTokensIn` | number (int, ≥0) | yes |
| `model` | string | yes |
| `maxBudget` | number (int, positive) | yes |

### Output

JSON or structured markdown:

```json
{
  "steps": [
    { "order": 1, "tool": "code_search", "purpose": "...", "budgetTokens": 800 }
  ],
  "totalBudget": 2400,
  "warnings": []
}
```

Constraint: `sum(budgetTokens) ≤ maxBudget`.

### Stats

None.

---

## Existing tools (unchanged contracts)

See current implementations:

- `smart_read` — `packages/mcp/src/tools/smart-read.ts`
- `trim_context` — `packages/mcp/src/tools/trim-context.ts`
- `get_stats` — `packages/mcp/src/tools/get-stats.ts`

Server `instructions` MUST list all seven tools with one-line when-to-use after this feature.

## Fail conditions (integration tests)

1. Unknown tool name not registered.
2. Any new tool input failing zod validation returns MCP error content (not throw to host).
3. Output token count ≤ requested `budget` / `snippetBudget` / planner sum within ±10% of `estimateTokens(output)`.
