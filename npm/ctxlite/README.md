# ctxlite

> Token optimizer for Cursor, OpenCode and Claude Code.  
> Reduces API costs via semantic caching and context trimming.

[![CI](https://github.com/ctxlite/ctxlite/actions/workflows/ci.yml/badge.svg)](https://github.com/ctxlite/ctxlite/actions)
[![npm](https://img.shields.io/npm/v/ctxlite)](https://www.npmjs.com/package/ctxlite)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## How it works

ctxlite runs as a local HTTP proxy on `127.0.0.1:8080`.  
Your coding tool sends requests to ctxlite instead of directly to the LLM API.

```
Cursor / OpenCode / Claude Code
         ↓
   ctxlite :8080
    ├── L1 cache (exact match)  → instant return
    ├── L2 cache (semantic ~)   → instant return
    └── context trimmer         → forward trimmed request
         ↓
   Anthropic / OpenAI API
```

## Install

```bash
npm install -g ctxlite
```

## Quick start

**1. Start ctxlite**

```bash
ctxlite
```

**2. Point your tool to the proxy**

Cursor — add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ctxlite": { "command": "ctxlite", "args": [] }
  }
}
```

Set env var:

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8080/v1
export ANTHROPIC_BASE_URL=http://127.0.0.1:8080
```

**3. Check savings**

```bash
ctxlite stats
```

## Configuration

See [docs/configuration.md](docs/configuration.md).

## Contributing

See [docs/contributing.md](docs/contributing.md).

## License

MIT
