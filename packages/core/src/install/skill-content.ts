/**
 * Shared SKILL.md body for Claude Code / Cursor / OpenCode's skill-discovery
 * mechanism (all three read the same `name`/`description` frontmatter +
 * Markdown body format).
 */
export const CTXLITE_SKILL_NAME = "ctxlite"

export const CTXLITE_SKILL_CONTENT = `---
name: ${CTXLITE_SKILL_NAME}
description: >-
  Token-efficiency MCP tools: smart_read, trim_context, get_stats, diff_read,
  log_summary, code_search, budget_planner. Use when ctxlite MCP is available
  to minimize reads, diffs, logs, and search-heavy tasks.
---

# ctxlite token efficiency

## Available tools

| Tool | When to use |
|------|-------------|
| \`smart_read\` | File shape/API only — not for editing exact lines |
| \`trim_context\` | Multi-file tasks with many candidates |
| \`get_stats\` | Any question about savings or ctxlite activity |
| \`diff_read\` | Review/fix with a unified diff |
| \`log_summary\` | Noisy build/test logs |
| \`code_search\` | Unknown which files matter |
| \`budget_planner\` | Large refactors — plan before unbounded reads |

If MCP is unavailable, apply the same intent with native read/grep using budgets.

## Reading code efficiently

Prefer \`smart_read\` over a full read when a source file is large (roughly
2–3k+ tokens of content) and you need exports, signatures, or structure — not
exact implementation to edit.

Use a full read only when you must match existing content for an edit or
debug a specific line. \`smart_read\` falls back to a budgeted head/tail read
for unsupported languages.

## Multi-file tasks

After collecting candidate files for a refactor or cross-file investigation,
call \`trim_context\` with their content and the task description. Drop
excluded files from further reasoning unless the user expands scope.

Skip \`trim_context\` for a single small known file. Chain with
\`code_search\` when you do not yet know the candidates.

## Diff-aware reading

When you have a unified diff and the task is review or incremental fix, use
\`diff_read\` for changed hunks plus minimal context — not the whole file.

Without MCP, focus manually on changed regions and nearby lines.

## Logs and grep

For large CI/build/test output, use \`log_summary\` to surface failures,
stack traces, and material warnings. Reuse the summary in follow-up turns
instead of re-pasting the raw log.

## Token stats

When asked how much ctxlite saved, call \`get_stats\` with an appropriate
period (\`session\`, \`today\`, \`7d\`, \`30d\`, \`all\`). Report only
returned numbers; distinguish estimate-labeled rows from measured ones.

## Caching / reuse

Reuse recent tool output when the underlying file, diff, or log has not
changed — do not re-read the same unchanged content every turn.

## Budget planning

For wide refactors or long sessions, call \`budget_planner\` with
\`taskDescription\`, \`estimatedTokensIn\`, \`model\`, and \`maxBudget\`
before exploratory reads. Follow the returned step order.

## Response conciseness

Skip preamble, recap, and sign-off filler. Be direct. Explain tricky logic
inline in code comments when editing, not in long prose before the edit.
`
