# ctxlite

> Token optimizer for OpenCode — automatic context optimization + stats reporting.

[![CI](https://github.com/ctxlite/ctxlite/actions/workflows/ci.yml/badge.svg)](https://github.com/ctxlite/ctxlite/actions)
[![npm](https://img.shields.io/npm/v/@ctxlite/opencode)](https://www.npmjs.com/package/@ctxlite/opencode)
[![License: MIT + Commons Clause](https://img.shields.io/badge/License-MIT%20%2B%20Commons%20Clause-yellow.svg)](LICENSE)
[![Sponsor on Ko-fi](https://img.shields.io/badge/sponsor-ko--fi-FF5E5B.svg)](https://ko-fi.com/techdebeci)

If ctxlite is saving you tokens, consider [supporting the project on Ko-fi](https://ko-fi.com/techdebeci).

> **Cursor and Claude Code were previously supported here too.** That support
> is currently disabled — `ctxlite install` only offers OpenCode now. Their
> underlying install/merge code hasn't been deleted (a prior Cursor/Claude
> Code install keeps working), it's just no longer offered, while ctxlite's
> efficiency work focuses on OpenCode specifically. See
> [docs/benchmarks.md](docs/benchmarks.md) for the real, measured numbers
> behind that focus.

## How it works

ctxlite reduces tokens at several points in an OpenCode session: quieter command flags and blocked low-signal reads before a tool runs (including a hard block-and-redirect to `smart_read` for large full-file reads), output compression and symbol-only file reads after, duplicate/stale context pruning before each request, BM25-based relevant-file selection, and conciseness instructions for the model's own output.

| | Automatic (no action needed) | On demand (agent calls a tool) |
|---|---|---|
| **OpenCode** | pre-call rewrite (quiet flags, blocked/redirected reads), output compression, context pruning, conciseness, sidebar widget + toast + session title | `get_stats`, `trim_context`, `smart_read`, `concise_reply` (plugin — in-process) |

Add a project-root `.ctxliteignore` (gitignore-style patterns) to block reads and `trim_context` candidates from project-specific generated/vendor paths that aren't already covered by ctxlite's built-in blocked-path list — see [the format reference](specs/018-ctxliteignore-support/contracts/ctxliteignore-format.md).

**Honest numbers, not just claims**: real, model-in-the-loop testing (`bench-live/`, see [docs/benchmarks.md](docs/benchmarks.md)) measured roughly 26–88% input/context token reduction and roughly 10–20% output-token reduction on representative OpenCode tasks — not the 70–90% output-token target originally hoped for. That gap, what was tried to close it, and why it's genuinely hard on any model tested (free or paid) is documented in full rather than smoothed over.

## Install

```bash
npx @ctxlite/cli install --tool opencode --scope global --yes
```

Registers the plugin (`~/.config/opencode/opencode.json`) and the sidebar widget (`tui.json`). Restart OpenCode.

Use `--scope project` to scope this to the current repo instead of your whole machine, `--dry-run` to preview changes first, and `--remove` to undo.

### Interactive installer

```bash
npx @ctxlite/cli install
```

Prompts for scope (global/project) and confirms before writing.

## Viewing stats

```bash
npx @ctxlite/cli stats
npx @ctxlite/cli stats --last 7d
npx @ctxlite/cli stats --export json
```

**In OpenCode:** the sidebar widget shows live savings the whole session — no action needed. You can still ask in chat:

```
You: how much has ctxlite saved this session?
```

If the agent doesn't reach for `get_stats` on its own, ask explicitly: "use the ctxlite get_stats tool."

## Packages

| Package | Description |
|---|---|
| `@ctxlite/opencode` | OpenCode plugin (server + TUI sidebar) — the primary supported surface |
| `@ctxlite/core` | Shared logic (BM25, tree-sitter symbol extraction, stats, precall enforcement) |
| `@ctxlite/cli` | CLI for `stats` and `install` |
| `@ctxlite/mcp` | MCP server — currently unused now that Cursor/Claude Code install is disabled; kept for a future re-enable, not actively developed |

## Go proxy (legacy)

The Go binary in `go/` provides an HTTP proxy with L1/L2 caching for Cursor and Claude Code — an earlier architecture, superseded by the plugin/MCP/hooks approach above, and not part of the current OpenCode-focused direction.
See [docs/configuration.md](docs/configuration.md) and [docs/architecture.md](docs/architecture.md).

## Contributing

See [docs/contributing.md](docs/contributing.md).

## License

- **v0.1.0 – v0.1.25**: plain MIT, permanently (already published, not retroactively changed).
- **v0.1.26 and later**: MIT with the [Commons Clause](https://commonsclause.com/) condition — free to use, modify, and run for any purpose, including commercial/internal use at a company. What requires a separate commercial license: reselling or rebranding ctxlite itself (or a derivative whose value comes substantially from it) as a competing product or service.

See [LICENSE](LICENSE) for the full text.
