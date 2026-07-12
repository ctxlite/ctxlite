# Contract: Install Skill Content

**Version**: 1.0  
**Feature**: `specs/024-mcp-efficiency-expansion/`

## File

- **Source**: `packages/core/src/install/skill-content.ts` → `CTXLITE_SKILL_CONTENT`
- **Installed paths** (unchanged):
  - Claude Code: `.claude/skills/ctxlite/SKILL.md` (project or global)
  - Cursor: `.cursor/skills/ctxlite/SKILL.md`
  - OpenCode: `.opencode/skills/ctxlite/SKILL.md` (project) or `~/.config/opencode/skills/ctxlite/SKILL.md` (global)

## Frontmatter (required)

```yaml
---
name: ctxlite
description: |
  <Must mention all seven MCP tools and token-efficiency intent — used for host skill discovery>
---
```

## Body sections (required, in order)

1. **Available tools** — table or list of `smart_read`, `trim_context`, `get_stats`, `diff_read`, `log_summary`, `code_search`, `budget_planner` with one-line when-to-use.
2. **Reading code efficiently** — `smart_read` vs full read threshold (~2–3k tokens); budgeted fallback.
3. **Multi-file tasks** — `trim_context` workflow; when to skip; chain with `code_search`.
4. **Diff-aware reading** — `diff_read` for review/fix; manual fallback.
5. **Logs and grep** — `log_summary`; reuse compressed output; grep summary lines.
6. **Token stats** — always `get_stats` for savings questions; no invented numbers.
7. **Caching / reuse** — reuse recent tool output when unchanged (behavioral, no formal cache).
8. **Budget planning** — `budget_planner` for large tasks; manual budget fallback.
9. **Response conciseness** — skip preamble/recap/sign-off (align with `ctxlite-conciseness` rules).

## Constraints

- English only.
- Do not remove Ko-fi / support references from stats output (LICENSE) — skill does not override `get_stats` formatting.
- Snake_case tool names in backticks matching MCP registration.
- If MCP unavailable, each section includes one-sentence native-tool fallback.

## Verification (SC-007)

After `ctxlite install <host>`, installed `SKILL.md` MUST contain substring for each tool:

`smart_read`, `trim_context`, `get_stats`, `diff_read`, `log_summary`, `code_search`, `budget_planner`
