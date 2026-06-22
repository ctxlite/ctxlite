# ctxlite

> Token optimizer for OpenCode and Cursor — context trimming + stats reporting.

[![CI](https://github.com/ctxlite/ctxlite/actions/workflows/ci.yml/badge.svg)](https://github.com/ctxlite/ctxlite/actions)
[![npm](https://img.shields.io/npm/v/@ctxlite/opencode)](https://www.npmjs.com/package/@ctxlite/opencode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## How it works

ctxlite analyzes files in your context and sends only those relevant to the current task, using BM25 scoring.  
Result: fewer tokens consumed, faster responses, lower costs.

## Install

### Cursor (editor + agent CLI)

```bash
npx @ctxlite/cli install --tool cursor --scope global --yes
```

Or add manually to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "ctxlite": {
      "command": "npx",
      "args": ["-y", "@ctxlite/mcp"]
    }
  }
}
```

### OpenCode

```bash
npx @ctxlite/cli install --tool opencode --scope global --yes
# or
opencode plugin @ctxlite/opencode -g -f
```

### Claude Code / Claude Desktop

```bash
npx @ctxlite/cli install --tool claude-code --scope global --yes
npx @ctxlite/cli install --tool claude-desktop --scope global --yes
```

Interactive installer (pick tools + global/project scope):

```bash
npx @ctxlite/cli install
```

## Stats

```bash
npx @ctxlite/cli stats
npx @ctxlite/cli stats --last 7d
npx @ctxlite/cli stats --export json
```

## Packages

| Package | Description |
|---|---|
| `@ctxlite/opencode` | OpenCode plugin |
| `@ctxlite/mcp` | MCP server for Cursor |
| `@ctxlite/core` | Shared logic (BM25, stats) |
| `@ctxlite/cli` | CLI for stats + `install` |

## Go proxy (legacy)

The Go binary in `go/` provides an HTTP proxy with L1/L2 caching for Cursor and Claude Code.  
See [docs/configuration.md](docs/configuration.md) and [docs/architecture.md](docs/architecture.md).

## Contributing

See [docs/contributing.md](docs/contributing.md).

## License

MIT
