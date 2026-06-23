# ctxlite

> Token optimizer for OpenCode, Cursor, and Claude Code — automatic context optimization + stats reporting.

[![CI](https://github.com/ctxlite/ctxlite/actions/workflows/ci.yml/badge.svg)](https://github.com/ctxlite/ctxlite/actions)
[![npm](https://img.shields.io/npm/v/@ctxlite/opencode)](https://www.npmjs.com/package/@ctxlite/opencode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## How it works

ctxlite reduces tokens at several points in a session: quieter command flags and blocked low-signal reads before a tool runs, output compression and symbol-only file reads after, duplicate/stale context pruning before each request, BM25-based relevant-file selection, and conciseness instructions for the model's own output.

Which of these run **automatically** vs. **on demand** depends on what each tool's plugin/hook API actually allows — see the table below.

| | Automatic (no action needed) | On demand (agent calls a tool) |
|---|---|---|
| **OpenCode** | pre-call rewrite, output compression, context pruning, conciseness, sidebar widget + toast + session title | `get_stats`, `trim_context`, `smart_read` |
| **Claude Code** | pre-call rewrite (`Bash` quiet flags, blocked reads), output compression — via hooks | `get_stats`, `trim_context`, `smart_read` (MCP) |
| **Cursor** | pre-call rewrite only — Cursor's hooks can't rewrite output for built-in tools, so output compression has no automatic path here | `get_stats`, `trim_context`, `smart_read` (MCP) |
| **Claude Desktop** | — (no hook/plugin API) | `get_stats`, `trim_context`, `smart_read` (MCP) |

## Install

### OpenCode

```bash
npx @ctxlite/cli install --tool opencode --scope global --yes
```

Registers the plugin (`~/.config/opencode/opencode.json`) and the sidebar widget (`tui.json`). Restart OpenCode.

### Claude Code

```bash
npx @ctxlite/cli install --tool claude-code --scope global --yes
```

Registers the MCP server (`~/.claude.json`) and the PreToolUse/PostToolUse hooks (`~/.claude/settings.json`) — two separate files, both written.

### Cursor

```bash
npx @ctxlite/cli install --tool cursor --scope global --yes
```

Registers the MCP server (`~/.cursor/mcp.json`) and the `preToolUse` hook (`~/.cursor/hooks.json`).

### Claude Desktop

```bash
npx @ctxlite/cli install --tool claude-desktop --scope global --yes
```

MCP only — Claude Desktop has no plugin/hook API.

### Interactive installer (pick tools + global/project scope)

```bash
npx @ctxlite/cli install
```

Use `--scope project` to scope any of the above to the current repo instead of your whole machine, and `--remove` to undo.

## Viewing stats

All surfaces read from the same `~/.ctxlite/stats.db`, so the CLI shows combined totals no matter which tool generated the savings.

**From any terminal:**

```bash
npx @ctxlite/cli stats
npx @ctxlite/cli stats --last 7d
npx @ctxlite/cli stats --export json
```

**OpenCode:** the sidebar widget shows live savings the whole session — no action needed. You can still ask in chat:

```
You: how much has ctxlite saved this session?
```

**Claude Code:** ask in chat — the agent calls the `get_stats` MCP tool:

```
You: show me ctxlite's token savings for the last 7 days
```

**Cursor:** same as Claude Code — ask in chat and the agent calls `get_stats`:

```
You: how much has ctxlite saved on this project?
```

If the agent doesn't reach for `get_stats` on its own, ask explicitly: "use the ctxlite get_stats tool."

## Packages

| Package | Description |
|---|---|
| `@ctxlite/opencode` | OpenCode plugin (server + TUI sidebar) |
| `@ctxlite/mcp` | MCP server for Cursor, Claude Code, Claude Desktop |
| `@ctxlite/core` | Shared logic (BM25, tree-sitter symbol extraction, stats) |
| `@ctxlite/cli` | CLI for `stats`, `install`, and the Claude Code / Cursor hook bridge |

## Go proxy (legacy)

The Go binary in `go/` provides an HTTP proxy with L1/L2 caching for Cursor and Claude Code — an earlier architecture, superseded by the plugin/MCP/hooks approach above.  
See [docs/configuration.md](docs/configuration.md) and [docs/architecture.md](docs/architecture.md).

## Contributing

See [docs/contributing.md](docs/contributing.md).

## License

MIT
