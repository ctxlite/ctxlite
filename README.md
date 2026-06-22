# ctxlite

> Token optimizer pentru OpenCode si Cursor — context trimming + stats reporting.

[![CI](https://github.com/ctxlite/ctxlite/actions/workflows/ci.yml/badge.svg)](https://github.com/ctxlite/ctxlite/actions)
[![npm](https://img.shields.io/npm/v/@ctxlite/opencode)](https://www.npmjs.com/package/@ctxlite/opencode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Cum functioneaza

ctxlite analizeaza fisierele din contextul tau si le trimiteaza la model
doar pe cele relevante pentru task-ul curent, folosind BM25 scoring.
Rezultat: mai putini tokens consumati, raspunsuri mai rapide, costuri mai mici.

## Install

### OpenCode

```bash
opencode plugin @ctxlite/opencode -g
```

### Cursor (editor + agent CLI)

```json
// ~/.cursor/mcp.json
{
  "mcpServers": {
    "ctxlite": {
      "command": "npx",
      "args": ["-y", "@ctxlite/mcp"]
    }
  }
}
```

## Stats

```bash
npx ctxlite stats
npx ctxlite stats --last 7d
npx ctxlite stats --export json
```

## Packages

| Package | Description |
|---|---|
| `@ctxlite/opencode` | OpenCode plugin |
| `@ctxlite/mcp` | MCP server pentru Cursor |
| `@ctxlite/core` | Shared logic (BM25, stats) |
| `ctxlite` | CLI pentru stats |

## Go proxy (legacy)

The Go binary in `go/` provides an HTTP proxy with L1/L2 caching for Cursor and Claude Code.
See [docs/configuration.md](docs/configuration.md) and [docs/architecture.md](docs/architecture.md).

## Contributing

Vezi [docs/contributing.md](docs/contributing.md).

## License

MIT
