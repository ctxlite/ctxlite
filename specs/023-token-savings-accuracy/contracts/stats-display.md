# Contract: Stats Display and Capability Matrix

**Version**: 1.0  
**Feature**: `specs/023-token-savings-accuracy/`

## Stats breakdown labels (`packages/core/src/report.ts`)

Shared by CLI (`ctxlite stats`), OpenCode `get_stats`, and MCP `get_stats`.

| `source` | Display label | Kind suffix |
|----------|---------------|-------------|
| `precall` | `precall (est.)` | estimate |
| `compress` | `compress` | measured |
| `prune` | `prune` | measured |
| `compact` | `compact` | measured |
| `smart_read` | `smart_read` | measured |
| `trim` | `trim` | measured |
| `concise` | `concise (est.)` | estimate (unchanged) |

**Breaking change policy**: Label-only; JSON output may add optional `measurementKind` field (`measured` | `estimate`) per row — consumers that parse text labels must tolerate `(est.)` suffix on precall.

## Savings line (`formatSavingsLine`)

Existing behavior preserved:
- Before `MIN_SESSION_TURNS_FOR_PERCENT` (10): show turn count notice, not `%`.
- After baseline stable: `X of Y (Z% context avoided)`.

No change to formula; docs explain what `Z%` includes (estimates + measured).

## Capability matrix (docs table)

Required in `docs/architecture.md` and summarized in `docs/benchmarks.md`.

Columns: **Mechanism** | **OpenCode** | **Claude Code** | **Cursor** | **Measurement**

Cell values (one per cell):
- `automatic` — runs without agent action
- `opt-in` — agent must call tool (`smart_read`, `trim`)
- `unavailable` — platform constraint
- `estimate-only` — instructions or logging use heuristics, not before/after measure

Example rows (minimum):

| Mechanism | OpenCode | Claude Code | Cursor | Measurement |
|-----------|----------|-------------|--------|-------------|
| precall | automatic | automatic | automatic | estimate |
| compress | automatic | automatic | unavailable (built-ins) | measured |
| prune | automatic | unavailable | unavailable | measured |
| compact | automatic | unavailable | unavailable | measured |
| smart_read | opt-in | opt-in (MCP) | opt-in (MCP) | measured |
| trim | opt-in | opt-in (MCP) | opt-in (MCP) | measured |
| concise | automatic | unavailable | unavailable | estimate |

**MCP host note**: `smart_read` / `trim` log as `host: mcp` — document that `--by-session mcp` shows this activity.

## `upstream` field semantics

| Host | `upstream` MUST be |
|------|-------------------|
| OpenCode hooks | Lowercased tool name (`bash`, `read`, …) — **not** `opencode` |
| Claude Code hooks | Lowercased tool name |
| Cursor hooks | `normalizeToolName()` result |
| MCP tools | Tool name (`smart_read`, `trim_context`) |

Violations are bugs, not documentation gaps.

## Help text (optional FR-008)

When `ctxlite stats --by-session <host>` shows zero for a category that is `unavailable` on that host, docs link to capability matrix — no runtime warning required in v1 unless trivial to add in `formatSessionBreakdown`.
