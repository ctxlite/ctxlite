/**
 * Shared SKILL.md body for Claude Code / Cursor / OpenCode's skill-discovery
 * mechanism (all three read the same `name`/`description` frontmatter +
 * Markdown body format). Unlike a system-prompt injection (which OpenCode's
 * plugin already does unconditionally), a skill is discovered and loaded by
 * the host on its own — this exists for the platforms where there's no
 * always-on injection point, so the agent still gets the same nudge toward
 * smart_read/trim_context.
 */
export const CTXLITE_SKILL_NAME = "ctxlite"

export const CTXLITE_SKILL_CONTENT = `---
name: ${CTXLITE_SKILL_NAME}
description: >-
  Use ctxlite's smart_read and trim_context MCP tools to reduce token usage
  when reading files for structure rather than editing, or when narrowing
  down candidate files before a multi-file task. Applies whenever the
  ctxlite MCP server is available.
---

# ctxlite token efficiency

ctxlite exposes three MCP tools: \`smart_read\`, \`trim_context\`, \`get_stats\`.

## smart_read

Use \`smart_read\` instead of the regular file-read tool when you need a
file's shape rather than its exact content — checking what a module
exports, how a class or interface is defined, whether a function already
exists before calling it. It returns signatures (functions, classes,
types, exports) with implementation bodies omitted.

Use the regular read tool instead when you need exact content to edit,
or when the file is something \`smart_read\` doesn't apply to (config,
data, prose).

## trim_context

After reading several candidate files for a multi-file task — a refactor,
"how does X work" exploration, a cross-file search — call \`trim_context\`
with their content and the task description before continuing. Drop the
files it excludes from further reasoning instead of carrying all of them
forward into every subsequent turn.

Skip this for a task that only touches one already-known file.

## get_stats

Call \`get_stats\` if asked how much ctxlite has saved this session, or to
check whether it's active.
`
